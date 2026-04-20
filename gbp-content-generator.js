// ── GBP Weekly Post Generator ─────────────────────────────────────────────────
// Add this function to index.js alongside generatePost() and researchTrend()
// Then call generateAndPublishGBPPosts() inside the /generate-content route

// GBP post types to rotate through each week
const GBP_WEEKLY_PLAN = [
  { day: 'Monday',    type: 'STANDARD', pillar: 'education',  cta: 'LEARN_MORE' },
  { day: 'Wednesday', type: 'OFFER',    pillar: 'promo',      cta: 'BOOK'       },
  { day: 'Friday',    type: 'STANDARD', pillar: 'service',    cta: 'BOOK'       },
];

async function generateGBPPost(slot, monthlySpecial, trendingContext) {
  const Anthropic = require('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const dayOfWeek = slot.day;
  const isOffer = slot.type === 'OFFER';
  const specialText = monthlySpecial
    ? `Current monthly special: ${monthlySpecial.title} — ${monthlySpecial.discount_text}`
    : 'No current special';
  const trendText = trendingContext || 'wellness, massage therapy, self-care';

  const prompt = isOffer
    ? `Write a Google Business Profile OFFER post for Awaken Zen Spa in Mesa, AZ.
${specialText}
Rules:
- 150-200 characters max (GBP limit)
- Start with the offer clearly stated
- Warm, professional tone — not salesy
- End with a soft CTA like "Book your session" or "Treat yourself"
- No hashtags (GBP posts don't use them)
- No emojis
Return only the post text, nothing else.`
    : slot.pillar === 'education'
    ? `Write a Google Business Profile educational post for Awaken Zen Spa in Mesa, AZ.
Topic context: ${trendText}
Rules:
- 200-250 characters max
- Share one specific wellness insight or tip related to massage or skin care
- Warm, knowledgeable tone — like advice from a trusted therapist
- End with "Questions? We're here." or similar soft invite
- No hashtags, no emojis
Return only the post text, nothing else.`
    : `Write a Google Business Profile service highlight post for Awaken Zen Spa in Mesa, AZ.
Rules:
- 150-200 characters max
- Highlight one specific service (Swedish massage, Blissful Slumber, facial, or Muscle Mender)
- Mention the therapeutic benefit, not just the service name
- Warm, inviting tone
- End with a booking nudge
- No hashtags, no emojis
Return only the post text, nothing else.`;

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text.trim();
}

async function generateAndPublishGBPPosts(monthlySpecial, trendingContext) {
  const results = [];
  const errors = [];

  for (const slot of GBP_WEEKLY_PLAN) {
    try {
      const summary = await generateGBPPost(slot, monthlySpecial, trendingContext);

      // Auto-publish to GBP
      const gbpClient = require('./gbp-client');
      const offerDetails = slot.type === 'OFFER' && monthlySpecial ? {
        couponCode: monthlySpecial.discount_text || '',
        redeemOnlineUrl: 'https://awakenzenspa.com/booking',
        termsConditions: 'Cannot be combined with other offers.'
      } : null;

      const result = await gbpClient.createPost({
        summary,
        callToActionType: slot.cta,
        callToActionUrl: 'https://awakenzenspa.com/booking',
        offerDetails
      });

      // Log to Supabase
      await supabase.from('gbp_post_log').insert({
        post_name: result.name,
        summary: summary.substring(0, 200),
        type: slot.type,
        created_at: new Date().toISOString()
      });

      console.log(`[gbp] ✓ ${slot.day} ${slot.type} published: ${result.name}`);
      results.push({ day: slot.day, type: slot.type, postName: result.name });

      // Rate limit — GBP API is slow
      await new Promise(r => setTimeout(r, 2000));

    } catch (err) {
      console.error(`[gbp] ✗ ${slot.day} error:`, err.message);
      errors.push({ day: slot.day, error: err.message });
    }
  }

  return { results, errors };
}

// ── HOW TO INTEGRATE INTO /generate-content ROUTE ────────────────────────────
// In your existing /generate-content route, after the Instagram/Facebook loop,
// add this block:
//
//   console.log('[generate-content] Generating GBP posts...');
//   const gbpResult = await generateAndPublishGBPPosts(monthlySpecial, trendingContext);
//   console.log(`[generate-content] GBP: ${gbpResult.results.length} published, ${gbpResult.errors.length} errors`);
//
// And add to the response JSON:
//   gbp: { published: gbpResult.results.length, errors: gbpResult.errors.length }

module.exports = { generateAndPublishGBPPosts };
