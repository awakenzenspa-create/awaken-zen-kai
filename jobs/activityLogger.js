/**
 * Kai Activity Logger
 * file: jobs/activityLogger.js
 *
 * Shared helper — called fire-and-forget from all Kai channels.
 * Writes a row to kai_activity_log in Supabase.
 * Never throws — a logging failure must never break Kai's response.
 *
 * Usage:
 *   const { logActivity } = require('./jobs/activityLogger');
 *
 *   logActivity({
 *     eventType:   'call',           // 'call' | 'sms' | 'email' | 'booking'
 *     channel:     'phone',          // 'phone' | 'sms' | 'email'
 *     outcome:     'routed_vapi',    // see SQL schema for full list
 *     clientPhone: '+16025551234',
 *     clientName:  'Sarah',
 *     serviceName: 'Muscle Mender: Deep Tissue',
 *     bookingId:   'SQUARE_BOOKING_ID',
 *     sameDay:     false,
 *     startsAt:    '2026-04-20T14:00:00-07:00',
 *     details:     { subject: 'Inquiry', classification: 'inquiry' }
 *   });
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Log a Kai activity event. Always fire-and-forget — do NOT await unless
 * you explicitly want to wait (e.g. in a test).
 *
 * @param {object} opts
 * @param {string} opts.eventType   - 'call' | 'sms' | 'email' | 'booking'
 * @param {string} opts.channel     - 'phone' | 'sms' | 'email'
 * @param {string} [opts.outcome]
 * @param {string} [opts.clientPhone]
 * @param {string} [opts.clientName]
 * @param {string} [opts.serviceName]
 * @param {string} [opts.bookingId]
 * @param {boolean} [opts.sameDay]
 * @param {string} [opts.startsAt]   - ISO8601 appointment start
 * @param {object} [opts.details]    - any extra JSONB context
 */
async function logActivity({
  eventType,
  channel,
  outcome    = null,
  clientPhone = null,
  clientName  = null,
  serviceName = null,
  bookingId   = null,
  sameDay     = false,
  startsAt    = null,
  details     = null,
}) {
  try {
    const { error } = await supabase.from('kai_activity_log').insert({
      event_type:   eventType,
      channel:      channel,
      outcome:      outcome,
      client_phone: clientPhone,
      client_name:  clientName,
      service_name: serviceName,
      booking_id:   bookingId,
      same_day:     sameDay,
      starts_at:    startsAt || null,
      details:      details || null,
    });
    if (error) {
      console.error('[activityLog] Insert failed:', error.message);
    }
  } catch (err) {
    // Never let logging errors surface to the caller
    console.error('[activityLog] Unexpected error:', err.message);
  }
}

/**
 * Check if a given ISO8601 datetime falls on today in Arizona time.
 * Arizona does not observe DST — always UTC-7.
 */
function isSameDayAz(isoDateTime) {
  if (!isoDateTime) return false;
  try {
    const apptDate = new Date(isoDateTime).toLocaleDateString('en-US', {
      timeZone: 'America/Phoenix',
    });
    const todayDate = new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Phoenix',
    });
    return apptDate === todayDate;
  } catch {
    return false;
  }
}

module.exports = { logActivity, isSameDayAz };
