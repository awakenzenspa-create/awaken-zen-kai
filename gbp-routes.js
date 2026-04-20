// ── Google Business Profile Routes ───────────────────────────────────────────
// POST /gbp/post        — create a GBP post (called by content cron)
// POST /gbp/upload-photo — upload photo from staff portal
// GET  /gbp/status      — verify OAuth + fetch location info

const { createPost, uploadPhoto, getLocationName, getAccessToken } = require('./gbp-client');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Allowed origins for CORS
const GBP_ALLOWED_ORIGINS = [
  'https://awakenzenspa.com',
  'https://awakenzenspa.netlify.app',
  'http://localhost',
  'http://localhost:3000',
];

// CORS middleware — applied to all /gbp routes
function corsGbp(req, res, next) {
  const origin = req.headers.origin;
  if (!origin || GBP_ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,x-cron-token,x-staff-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

// Handle preflight for all /gbp routes
app.options('/gbp/*', corsGbp, (req, res) => res.sendStatus(204));

// Auth middleware — reuse CRON_SECRET for internal calls, or a staff session
function requireCronOrStaff(req, res, next) {
  const cronToken = req.headers['x-cron-token'];
  if (cronToken && cronToken === process.env.CRON_SECRET) return next();
  // Also allow staff portal calls with basic auth header
  const staffToken = req.headers['x-staff-token'];
  if (staffToken && staffToken === process.env.CRON_SECRET) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// ── GET /gbp/status ───────────────────────────────────────────────────────────
app.get('/gbp/status', corsGbp, requireCronOrStaff, async (req, res) => {
  try {
    const locationName = await getLocationName();
    res.json({ connected: true, locationName });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// ── POST /gbp/post ────────────────────────────────────────────────────────────
// Body: { summary, type, callToActionType, offerDetails, eventDetails }
app.post('/gbp/post', corsGbp, requireCronOrStaff, async (req, res) => {
  try {
    const { summary, callToActionType, offerDetails, eventDetails } = req.body;
    if (!summary) return res.status(400).json({ error: 'summary is required' });

    const result = await createPost({
      summary,
      callToActionType: callToActionType || 'BOOK',
      callToActionUrl: 'https://awakenzenspa.com/booking',
      offerDetails,
      eventDetails
    });

    // Log to Supabase
    await supabase.from('gbp_post_log').insert({
      post_name: result.name,
      summary: summary.substring(0, 200),
      type: offerDetails ? 'OFFER' : eventDetails ? 'EVENT' : 'STANDARD',
      created_at: new Date().toISOString()
    });

    console.log(`[gbp] Post published: ${result.name}`);
    res.json({ success: true, postName: result.name });
  } catch (err) {
    console.error('[gbp] Post error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /gbp/upload-photo ────────────────────────────────────────────────────
// Multipart form: photo (file) + category (string)
app.post('/gbp/upload-photo', corsGbp, requireCronOrStaff, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const category = req.body.category || 'INTERIOR';
    const result = await uploadPhoto({
      imageBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      category
    });

    // Log to Supabase
    await supabase.from('gbp_photo_log').insert({
      media_name: result.name || 'unknown',
      category,
      original_filename: req.file.originalname,
      uploaded_at: new Date().toISOString()
    });

    console.log(`[gbp] Photo uploaded: ${category} — ${req.file.originalname}`);
    res.json({ success: true, mediaName: result.name });
  } catch (err) {
    console.error('[gbp] Photo upload error:', err.message);
    res.status(500).json({ error: err.message });
  }
});