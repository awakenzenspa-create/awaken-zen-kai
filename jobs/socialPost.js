// jobs/socialPost.js
// Social Flash — Meta posting module
// Handles IG Story, IG Feed, and Facebook feed posts
// Images must be publicly accessible URLs at post time (served from Railway or uploaded to temp host)

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const IG_ACCOUNT_ID = process.env.META_IG_ACCOUNT_ID;
const FB_PAGE_ID    = process.env.META_FB_PAGE_ID;
const PAGE_TOKEN    = process.env.META_PAGE_ACCESS_TOKEN;
const BASE_URL      = process.env.BASE_URL;
const GRAPH         = 'https://graph.facebook.com/v19.0';

// ============================================================
// MAIN ENTRY POINT
// Called from square-webhook handler alongside triggerFlashFill
// ============================================================
async function triggerSocialFlash(offerId, slotTime, serviceData) {
  try {
    const now       = new Date();
    const slot      = new Date(slotTime);
    const hoursOut  = (slot - now) / (1000 * 60 * 60);

    // Determine urgency tier
    const tier = hoursOut >= 12 ? 'day_before' : 'same_day';

    console.log(`[SocialFlash] Offer ${offerId} | ${hoursOut.toFixed(1)}hrs out | tier: ${tier}`);

    if (tier === 'day_before') {
      // 1. IG Story immediately
      await postToChannel('ig_story', offerId, slotTime, serviceData);

      // 2. FB feed 30 min later
      setTimeout(async () => {
        await postToChannel('fb_feed', offerId, slotTime, serviceData);
      }, 30 * 60 * 1000);

      // 3. IG feed 2 hrs later — only if slot still open
      setTimeout(async () => {
        const stillOpen = await isOfferStillActive(offerId);
        if (stillOpen) {
          await postToChannel('ig_feed', offerId, slotTime, serviceData);
        } else {
          console.log(`[SocialFlash] Offer ${offerId} already filled — skipping IG feed post`);
        }
      }, 2 * 60 * 60 * 1000);

    } else {
      // Same-day urgent: Story + FB immediately, no feed post
      await postToChannel('ig_story', offerId, slotTime, serviceData);

      setTimeout(async () => {
        await postToChannel('fb_feed', offerId, slotTime, serviceData);
      }, 5 * 60 * 1000); // 5 min gap on same-day
    }

  } catch (err) {
    console.error(`[SocialFlash] triggerSocialFlash error:`, err.message);
  }
}

// ============================================================
// POST TO SINGLE CHANNEL
// ============================================================
async function postToChannel(channel, offerId, slotTime, serviceData) {
  try {
    // Enforce: max 3 flash posts per day across all channels
    const dailyCount = await getDailyPostCount();
    if (dailyCount >= 3) {
      console.log(`[SocialFlash] Daily cap reached (${dailyCount}/3) — skipping ${channel}`);
      return;
    }

    // Enforce: 4-hour minimum gap on same channel
    const lastPost = await getLastPostOnChannel(channel);
    if (lastPost) {
      const gapHours = (Date.now() - new Date(lastPost.posted_at)) / (1000 * 60 * 60);
      if (gapHours < 4) {
        console.log(`[SocialFlash] Channel ${channel} posted ${gapHours.toFixed(1)}hrs ago — skipping`);
        return;
      }
    }

    // Pick template
    const template = await pickTemplate(channel);
    if (!template) {
      console.error(`[SocialFlash] No active template found for channel: ${channel}`);
      return;
    }

    // Pick caption variant (round-robin)
    const captionVariants = template.caption_variants;
    const captionIndex    = template.use_count % captionVariants.length;
    const rawCaption      = captionVariants[captionIndex];
    const caption         = interpolate(rawCaption, slotTime, serviceData);

    // Render image — calls /social-flash/render endpoint on self (Puppeteer)
    const imageUrl = await renderTemplate(template, slotTime, serviceData);
    if (!imageUrl) {
      console.error(`[SocialFlash] Image render failed for template ${template.id}`);
      return;
    }

    // Post to Meta
    let metaPostId = null;
    if (channel === 'ig_story') {
      metaPostId = await postIgStory(imageUrl);
    } else if (channel === 'ig_feed') {
      metaPostId = await postIgFeed(imageUrl, caption);
    } else if (channel === 'fb_feed') {
      metaPostId = await postFbFeed(imageUrl, caption);
    }

    // Log to Supabase
    await logPost({
      offerId,
      templateId: template.id,
      channel,
      captionIndex,
      metaPostId,
      status: metaPostId ? 'posted' : 'failed',
      slotTime,
      price: serviceData.flashPrice,
      addon: serviceData.addon || null
    });

    // Update template usage
    await supabase
      .from('social_post_templates')
      .update({
        use_count:    template.use_count + 1,
        last_used_at: new Date().toISOString()
      })
      .eq('id', template.id);

    console.log(`[SocialFlash] Posted to ${channel} | meta_id: ${metaPostId} | template: ${template.name}`);

  } catch (err) {
    console.error(`[SocialFlash] postToChannel(${channel}) error:`, err.message);
    await logPost({
      offerId, templateId: null, channel,
      captionIndex: 0, metaPostId: null,
      status: 'failed', error: err.message,
      slotTime, price: serviceData?.flashPrice, addon: null
    });
  }
}

// ============================================================
// META API — IG STORY
// ============================================================
async function postIgStory(imageUrl) {
  // Step 1: Create container
  const containerRes = await fetch(
    `${GRAPH}/${IG_ACCOUNT_ID}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url:  imageUrl,
        media_type: 'STORIES',
        access_token: PAGE_TOKEN
      })
    }
  );
  const container = await containerRes.json();
  if (!container.id) {
    console.error('[SocialFlash] IG Story container error:', container);
    return null;
  }

  // Step 2: Publish
  const publishRes = await fetch(
    `${GRAPH}/${IG_ACCOUNT_ID}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: container.id,
        access_token: PAGE_TOKEN
      })
    }
  );
  const published = await publishRes.json();
  return published.id || null;
}

// ============================================================
// META API — IG FEED
// ============================================================
async function postIgFeed(imageUrl, caption) {
  // Step 1: Create container
  const containerRes = await fetch(
    `${GRAPH}/${IG_ACCOUNT_ID}/media`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url:    imageUrl,
        caption:      caption,
        access_token: PAGE_TOKEN
      })
    }
  );
  const container = await containerRes.json();
  if (!container.id) {
    console.error('[SocialFlash] IG Feed container error:', container);
    return null;
  }

  // Step 2: Publish
  const publishRes = await fetch(
    `${GRAPH}/${IG_ACCOUNT_ID}/media_publish`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id:  container.id,
        access_token: PAGE_TOKEN
      })
    }
  );
  const published = await publishRes.json();
  return published.id || null;
}

// ============================================================
// META API — FACEBOOK FEED
// ============================================================
async function postFbFeed(imageUrl, caption) {
  const res = await fetch(
    `${GRAPH}/${FB_PAGE_ID}/photos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:          imageUrl,
        caption:      caption,
        access_token: PAGE_TOKEN
      })
    }
  );
  const data = await res.json();
  return data.post_id || data.id || null;
}

// ============================================================
// TEMPLATE PICKER
// Excludes last 4 used on the given channel
// ============================================================
async function pickTemplate(channel) {
  // Get last 4 template IDs used on this channel
  const { data: recent } = await supabase
    .from('social_post_log')
    .select('template_id')
    .eq('channel', channel)
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(4);

  const recentIds = (recent || []).map(r => r.template_id).filter(Boolean);

  // Determine which channels a template can serve
  const channelFilter = channel.startsWith('ig') ? ['instagram', 'both'] : ['facebook', 'both'];

  // Fetch active templates for this channel type, excluding recently used
  let query = supabase
    .from('social_post_templates')
    .select('*')
    .eq('active', true)
    .in('channel', channelFilter);

  // Also filter by format
  if (channel === 'ig_story') {
    query = query.eq('format', 'story_9x16');
  } else {
    query = query.in('format', ['feed_1x1', 'feed_4x5']);
  }

  const { data: templates } = await query;
  if (!templates || templates.length === 0) return null;

  // Filter out recently used
  const available = templates.filter(t => !recentIds.includes(t.id));

  // Fall back to full list if all have been recently used
  const pool = available.length > 0 ? available : templates;

  // Pick least recently used
  pool.sort((a, b) => {
    if (!a.last_used_at) return -1;
    if (!b.last_used_at) return 1;
    return new Date(a.last_used_at) - new Date(b.last_used_at);
  });

  return pool[0];
}

// ============================================================
// IMAGE RENDER
// Calls the /social-flash/render endpoint (Puppeteer, next file)
// Returns a publicly accessible image URL
// ============================================================
async function renderTemplate(template, slotTime, serviceData) {
  try {
    const res = await fetch(`${BASE_URL}/social-flash/render`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${process.env.STAFF_API_TOKEN}`
      },
      body: JSON.stringify({
        templateId:  template.id,
        html:        interpolateHtml(template.html_template, slotTime, serviceData),
        format:      template.format
      })
    });

    const data = await res.json();
    return data.imageUrl || null; // publicly accessible URL served by Railway
  } catch (err) {
    console.error('[SocialFlash] renderTemplate error:', err.message);
    return null;
  }
}

// ============================================================
// TEMPLATE INTERPOLATION
// Replaces {{TOKENS}} in HTML and caption strings
// ============================================================
function buildTokenMap(slotTime, serviceData) {
  const slot     = new Date(slotTime);
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Phoenix' };
  const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Phoenix' };

  return {
    SERVICE_NAME:        serviceData.serviceName || 'Massage',
    SERVICE_DESCRIPTION: serviceData.serviceDescription || 'A deeply restorative treatment.',
    FLASH_PRICE:         serviceData.flashPrice || '79',
    REG_PRICE:           serviceData.regPrice || '85',
    SLOT_DATE:           slot.toLocaleDateString('en-US', dateOpts),
    SLOT_TIME:           slot.toLocaleTimeString('en-US', timeOpts),
    ADDON:               serviceData.addon || '',
    BOOKING_LINK:        `${process.env.BASE_URL?.replace('railway.app', 'netlify.app') || 'https://awakenzenspa.com'}/booking`
  };
}

function interpolate(str, slotTime, serviceData) {
  const tokens = buildTokenMap(slotTime, serviceData);
  let result = str;
  for (const [key, val] of Object.entries(tokens)) {
    result = result.replaceAll(`{{${key}}}`, val);
  }
  // Handle {{#if ADDON}}...{{/if}} — strip block if no addon
  result = result.replace(/\{\{#if ADDON\}\}([\s\S]*?)\{\{\/if\}\}/g,
    tokens.ADDON ? '$1' : ''
  );
  return result;
}

function interpolateHtml(html, slotTime, serviceData) {
  return interpolate(html, slotTime, serviceData);
}

// ============================================================
// SUPABASE HELPERS
// ============================================================
async function isOfferStillActive(offerId) {
  const { data } = await supabase
    .from('flash_offers')
    .select('status')
    .eq('id', offerId)
    .single();
  return data?.status === 'active';
}

async function getDailyPostCount() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('social_post_log')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'posted')
    .gte('posted_at', startOfDay.toISOString());

  return count || 0;
}

async function getLastPostOnChannel(channel) {
  const { data } = await supabase
    .from('social_post_log')
    .select('posted_at')
    .eq('channel', channel)
    .eq('status', 'posted')
    .order('posted_at', { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

async function logPost({ offerId, templateId, channel, captionIndex, metaPostId, status, error, slotTime, price, addon }) {
  await supabase.from('social_post_log').insert({
    offer_id:      offerId,
    template_id:   templateId,
    channel,
    caption_index: captionIndex,
    meta_post_id:  metaPostId,
    status,
    error_message: error || null,
    slot_time:     slotTime,
    price,
    addon
  });
}

module.exports = { triggerSocialFlash, postToChannel };
