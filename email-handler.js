/**
 * AZS Kai — Email Inbox Handler
 * ────────────────────────────────────────────────────────────
 * Add this file to your existing Kai Railway server repo.
 * Then require it in your main server.js:
 *
 *   const emailRoutes = require('./email-handler');
 *   app.use(emailRoutes);
 *
 * Required env vars (set in Railway):
 *   GMAIL_CLIENT_ID
 *   GMAIL_CLIENT_SECRET
 *   GMAIL_REFRESH_TOKEN
 *   GMAIL_ADDRESS          (awakenzenspa@gmail.com)
 *   EMAIL_DRAFT_MODE       (true = save drafts, false = auto-send)
 *   EMAIL_OWNER_PHONE      (+16232196907)
 *   ANTHROPIC_API_KEY      (already set for Kai)
 *   TWILIO_ACCOUNT_SID     (already set for Kai)
 *   TWILIO_AUTH_TOKEN      (already set for Kai)
 *   TWILIO_FROM_NUMBER     (already set for Kai)
 * ────────────────────────────────────────────────────────────
 */

const express = require('express');
const { google } = require('googleapis');
const Anthropic = require('@anthropic-ai/sdk');
const twilio = require('twilio');

const router = express.Router();

// ── CLIENTS ─────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

function getGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// ── LAST PROCESSED HISTORY ID ───────────────────────────────
// Stored in memory — resets on Railway redeploy.
// For production: store in Supabase email_state table instead.
let lastHistoryId = null;
let processedMessageIds = new Set(); // prevents double-processing within a session

// ── KAI EMAIL SYSTEM PROMPT ─────────────────────────────────
const EMAIL_SYSTEM_PROMPT = `You are Kai, the AI concierge for Awaken Zen Spa (AZS) in Mesa, Arizona.
You are responding to an email sent to awakenzenspa@gmail.com.

ABOUT AZS:
- Boutique massage and esthetics spa at 2830 East Brown Road, Suite 10, Mesa, AZ 85213
- Services: therapeutic massage (deep tissue, Swedish, hot stone, prenatal), facials, and esthetic treatments
- Staff: Brant (LMT, owner) and Trevor (LE, esthetician)
- Phone: (602) 688-2578 | Booking: awakenzenspa.com or text/call the number above
- Hours: check awakenzenspa.com for current hours

YOUR TONE FOR EMAIL:
- Warm, professional, unhurried — never robotic or templated-sounding
- Sign off as "Kai at Awaken Zen Spa" 
- Keep replies concise but complete — answer the question, offer the next step
- Never make up prices, availability, or policies you don't know — offer to follow up
- For booking requests: direct them to book online at awakenzenspa.com or text (602) 688-2578 for same-day availability

REPLY FORMAT:
- Plain text only (no HTML, no markdown)
- Greeting using their first name if available
- Body: address their question directly
- CTA: clear next step (book online, text us, reply to this email)
- Sign-off: "Warm regards," then "Kai at Awaken Zen Spa"
- Keep it under 150 words unless the question genuinely requires more

THINGS YOU CANNOT DO IN EMAIL:
- Book appointments directly (direct them to website or phone)
- Process payments
- Access Square booking system from email

If the email is spam, a sales pitch, a newsletter, or clearly not from a potential client, respond with exactly: SKIP`;

// ── HELPERS ──────────────────────────────────────────────────

function decodeBase64(encoded) {
  return Buffer.from(encoded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractEmailBody(payload) {
  if (!payload) return '';

  // Direct text/plain body
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Multipart — find text/plain part
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data);
      }
      // Nested multipart
      if (part.parts) {
        const nested = extractEmailBody(part);
        if (nested) return nested;
      }
    }
  }

  return '';
}

function getHeader(headers, name) {
  const h = headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

function extractFirstName(fromHeader) {
  // "John Smith <john@email.com>" → "John"
  const nameMatch = fromHeader.match(/^([^<"]+)/);
  if (nameMatch) {
    const parts = nameMatch[1].trim().split(' ');
    return parts[0] || 'there';
  }
  return 'there';
}

function stripEmailThread(body) {
  // Remove everything after common reply markers
  const markers = [
    /^On .+ wrote:/m,
    /^From: /m,
    /^-{3,}/m,
    /^_{3,}/m,
    /^>{1,}/m,
  ];
  let stripped = body;
  for (const marker of markers) {
    const idx = stripped.search(marker);
    if (idx > 50) { // only cut if there's actual content before it
      stripped = stripped.substring(0, idx);
    }
  }
  return stripped.trim();
}

// ── CLASSIFY EMAIL ───────────────────────────────────────────
function classifyEmail(subject, body) {
  const text = (subject + ' ' + body).toLowerCase();

  if (/(unsubscribe|no longer wish|opt.?out|remove me)/i.test(text)) return 'unsubscribe';
  if (/(hi there|dear business owner|seo|marketing|improve your ranking|we found your business|special offer for|blast|promo)/i.test(subject)) return 'spam';
  if (/(book|appointment|schedule|available|availability|reserve|session|massage|facial|service)/i.test(text)) return 'booking';
  if (/(cancel|reschedule|change my appointment|move my)/i.test(text)) return 'reschedule';
  if (/(price|cost|how much|rate|package|gift card)/i.test(text)) return 'pricing';
  if (/(question|curious|wonder|what is|do you|can you|does)/i.test(text)) return 'inquiry';
  return 'general';
}

// ── GENERATE KAI REPLY ───────────────────────────────────────
async function generateReply(senderName, senderEmail, subject, body, classification) {
  const userMessage = `
EMAIL RECEIVED:
From: ${senderName} (${senderEmail})
Subject: ${subject}
Classification: ${classification}

Body:
${body}

Please write a reply to this email.`.trim();

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: EMAIL_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  return response.content[0].text;
}

// ── CREATE GMAIL DRAFT ───────────────────────────────────────
async function createDraft(gmail, to, subject, body, threadId) {
  const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const rawMessage = [
    `From: Awaken Zen Spa <${process.env.GMAIL_ADDRESS}>`,
    `To: ${to}`,
    `Subject: ${reSubject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const draft = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: encoded,
        threadId: threadId,
      },
    },
  });

  return draft.data.id;
}

// ── SEND EMAIL DIRECTLY ──────────────────────────────────────
async function sendEmail(gmail, to, subject, body, threadId) {
  const reSubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

  const rawMessage = [
    `From: Awaken Zen Spa <${process.env.GMAIL_ADDRESS}>`,
    `To: ${to}`,
    `Subject: ${reSubject}`,
    `In-Reply-To: ${threadId}`,
    `References: ${threadId}`,
    `Content-Type: text/plain; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    body,
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId: threadId,
    },
  });
}

// ── NOTIFY OWNER VIA SMS ─────────────────────────────────────
async function notifyOwner(senderName, senderEmail, subject, classification, draftMode, draftId) {
  const action = draftMode
    ? `Draft saved in Gmail — review & send`
    : `Auto-sent`;

  const message = [
    `📧 AZS email from ${senderName}`,
    `Subject: "${subject}"`,
    `Type: ${classification}`,
    `${action}`,
    draftMode ? `Open Gmail drafts to review.` : '',
  ].filter(Boolean).join('\n');

  await twilioClient.messages.create({
    body: message,
    from: process.env.TWILIO_FROM_NUMBER,
    to: process.env.EMAIL_OWNER_PHONE,
  });
}

// ── MARK AS READ ─────────────────────────────────────────────
async function markAsRead(gmail, messageId) {
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD'],
      addLabelIds: ['Label_kai_processed'], // optional — create this label in Gmail first
    },
  });
}

// ── PROCESS A SINGLE EMAIL ───────────────────────────────────
async function processEmail(gmail, messageId) {
  // Skip already processed in this session
  if (processedMessageIds.has(messageId)) return;
  processedMessageIds.add(messageId);

  const msg = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const headers = msg.data.payload.headers;
  const from    = getHeader(headers, 'from');
  const subject = getHeader(headers, 'subject') || '(no subject)';
  const to      = getHeader(headers, 'to');
  const threadId = msg.data.threadId;

  // Skip emails sent by our own address (avoid loops)
  if (from.includes(process.env.GMAIL_ADDRESS)) return;
  // Skip if we already replied to this thread recently (check labelIds)
  if (msg.data.labelIds?.includes('SENT')) return;

  const rawBody  = extractEmailBody(msg.data.payload);
  const body     = stripEmailThread(rawBody);
  const senderName  = extractFirstName(from);
  const senderEmail = from.match(/<(.+)>/)?.[1] || from;

  const classification = classifyEmail(subject, body);

  // Skip spam/unsubscribes silently (just mark as read)
  if (classification === 'spam' || classification === 'unsubscribe') {
    await markAsRead(gmail, messageId);
    console.log(`[email] Skipped (${classification}): ${subject}`);
    return;
  }

  console.log(`[email] Processing (${classification}): "${subject}" from ${senderEmail}`);

  // Generate Kai's reply
  const reply = await generateReply(senderName, senderEmail, subject, body, classification);

  // Check if Kai flagged it as skip
  if (reply.trim().toUpperCase() === 'SKIP') {
    await markAsRead(gmail, messageId);
    console.log(`[email] Kai flagged as SKIP: ${subject}`);
    return;
  }

  const draftMode = process.env.EMAIL_DRAFT_MODE !== 'false';

  if (draftMode) {
    // Save as Gmail draft
    const draftId = await createDraft(gmail, senderEmail, subject, reply, threadId);
    console.log(`[email] Draft created: ${draftId}`);
    await notifyOwner(senderName, senderEmail, subject, classification, true, draftId);
  } else {
    // Auto-send
    await sendEmail(gmail, senderEmail, subject, reply, threadId);
    console.log(`[email] Sent reply to ${senderEmail}`);
    await notifyOwner(senderName, senderEmail, subject, classification, false);
  }

  // Mark original as read so we don't process it again
  await markAsRead(gmail, messageId);
}

// ── ROUTE: POLL INBOX (called by Railway cron every 2 min) ──
router.post('/email/poll', async (req, res) => {
  // Lightweight auth — only Railway cron should call this
  const token = req.headers['x-cron-token'] || req.query.token;
  if (token !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const gmail = getGmailClient();

    // Get list of unread messages in INBOX
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      labelIds: ['INBOX', 'UNREAD'],
      maxResults: 10, // Process up to 10 at a time
    });

    const messages = listRes.data.messages || [];

    if (messages.length === 0) {
      return res.json({ processed: 0, message: 'No new emails' });
    }

    console.log(`[email/poll] Found ${messages.length} unread emails`);

    let processed = 0;
    const errors = [];

    for (const msg of messages) {
      try {
        await processEmail(gmail, msg.id);
        processed++;
        // Small delay between emails to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[email/poll] Error processing ${msg.id}:`, err.message);
        errors.push({ id: msg.id, error: err.message });
      }
    }

    res.json({ processed, errors: errors.length > 0 ? errors : undefined });

  } catch (err) {
    console.error('[email/poll] Fatal error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE: MANUAL SEND DRAFT (staff portal trigger) ─────────
router.post('/email/send-draft', async (req, res) => {
  const { draftId } = req.body;
  if (!draftId) return res.status(400).json({ error: 'draftId required' });

  try {
    const gmail = getGmailClient();

    // Get the draft
    const draft = await gmail.users.drafts.get({ userId: 'me', id: draftId });

    // Send it
    await gmail.users.drafts.send({
      userId: 'me',
      requestBody: { id: draftId },
    });

    console.log(`[email/send-draft] Sent draft ${draftId}`);
    res.json({ success: true });

  } catch (err) {
    console.error('[email/send-draft] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── ROUTE: STATUS CHECK ──────────────────────────────────────
router.get('/email/status', async (req, res) => {
  try {
    const gmail = getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const draftRes = await gmail.users.drafts.list({ userId: 'me', maxResults: 5 });

    res.json({
      connected: true,
      email: profile.data.emailAddress,
      draftMode: process.env.EMAIL_DRAFT_MODE !== 'false',
      pendingDrafts: draftRes.data.resultSizeEstimate || 0,
      processedThisSession: processedMessageIds.size,
    });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

module.exports = router;
