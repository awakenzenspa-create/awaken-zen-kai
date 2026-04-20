/**
 * AZS Kai — Daily Digest Cron Entry Point
 * file: jobs/runDailyDigestCron.js
 *
 * Railway cron command:  node jobs/runDailyDigestCron.js
 * Railway cron schedule: 0 5 * * *   (05:00 UTC = 10:00 PM Arizona / UTC-7)
 *
 * Set in Railway:
 *   Service → Settings → Cron Schedule: 0 5 * * *
 *
 * Required env vars (already set in Railway):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   DIGEST_EMAIL   — recipient address (e.g. brant@awakenzenspa.com)
 *                    falls back to GMAIL_ADDRESS if not set
 */

const { runDailyDigest } = require('./dailyDigest.js');

console.log('=== AZS Kai Daily Digest ===');

runDailyDigest()
  .then(result => {
    console.log('Digest result:', JSON.stringify({
      success:          result.success,
      resendId:         result.resendId,
      activityCount:    result.activityCount,
      appointmentCount: result.appointmentCount,
    }, null, 2));
    result.log.forEach(line => console.log(line));
    process.exit(0);
  })
  .catch(err => {
    console.error('Daily digest failed:', err.message);
    process.exit(1);  // Railway marks the cron run as failed — good for alerting
  });
