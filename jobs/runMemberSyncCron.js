/**
 * AZS Flash Fill — Cron Entry Point
 * file: jobs/runMemberSyncCron.js
 *
 * Railway cron command:  node jobs/runMemberSyncCron.js
 * Railway cron schedule: 0 0 * * *   (midnight AZ time = 07:00 UTC, no DST)
 *
 * Set in Railway:
 *   Service → Settings → Cron Schedule: 0 7 * * *
 */

import { runMemberSync } from './memberSync.js';

console.log('=== AZS Member Sync Cron ===');

runMemberSync()
  .then(result => {
    console.log('Sync result:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Sync failed:', err.message);
    process.exit(1);   // Railway marks the cron run as failed — good for alerting
  });


// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS ROUTE — add this block to your main server.js / index.js
// alongside your existing Kai webhook routes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paste into server.js:
 *
 * import { runMemberSync } from './jobs/memberSync.js';
 *
 * // Manual trigger — staff portal "Sync Members" button
 * app.post('/flash-fill/sync-members', async (req, res) => {
 *   // Optional: light auth check — same pattern as your other staff routes
 *   const token = req.headers['x-staff-token'];
 *   if (token !== process.env.STAFF_API_TOKEN) {
 *     return res.status(401).json({ error: 'Unauthorized' });
 *   }
 *
 *   try {
 *     const result = await runMemberSync();
 *     res.json({ success: true, ...result });
 *   } catch (err) {
 *     res.status(500).json({ success: false, error: err.message });
 *   }
 * });
 */
