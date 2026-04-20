/**
 * AZS Kai — Daily Digest Email
 * file: jobs/dailyDigest.js
 *
 * Wired two ways:
 *   1. Railway cron — runs nightly at 10:00 PM Arizona time (05:00 UTC)
 *      Railway schedule: 0 5 * * *
 *   2. POST /digest/send — manual trigger (with x-cron-token auth)
 *
 * Sends a formatted HTML summary email to DIGEST_EMAIL covering:
 *   - Calls answered (Kai/owner/voicemail breakdown)
 *   - SMS conversations (with outcomes)
 *   - Emails handled (draft vs. sent, classification)
 *   - New bookings made today (same-day bookings prominently flagged)
 *   - Any errors logged
 *
 * Env vars required (Railway):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   DIGEST_EMAIL   — recipient (e.g. brant@awakenzenspa.com)
 *                    falls back to GMAIL_ADDRESS if not set
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FROM_EMAIL  = 'hello@awakenzenspa.com';
const SPA_NAME    = 'Awaken Zen Spa';
const AZ_TZ       = 'America/Phoenix';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the start (midnight) and end (next midnight) of today in Arizona
 * time, expressed as UTC ISO strings for Supabase queries.
 * Arizona is always UTC-7 (no DST).
 */
function getAzTodayRange() {
  const now = new Date();
  const azStr = now.toLocaleDateString('en-US', {
    timeZone: AZ_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  // azStr is "MM/DD/YYYY"
  const [month, day, year] = azStr.split('/');
  // Arizona = UTC-7 always.  Midnight AZ = 07:00 UTC.
  const startUTC = new Date(`${year}-${month}-${day}T07:00:00.000Z`);
  const endUTC   = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  return {
    start: startUTC.toISOString(),
    end:   endUTC.toISOString(),
    label: now.toLocaleDateString('en-US', {
      timeZone: AZ_TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    }),
  };
}

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: AZ_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function fmtPhone(p) {
  if (!p) return '—';
  const d = p.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  return p;
}

function outcomeLabel(outcome) {
  const map = {
    routed_vapi:     'Answered by Kai',
    routed_owner:    'Forwarded to Owner',
    voicemail:       'Voicemail / Fallback',
    booked:          'Booking Made',
    same_day_booked: 'SAME-DAY Booking',
    info_provided:   'Info Provided',
    cancelled:       'Cancellation Handled',
    draft_created:   'Draft Created',
    auto_sent:       'Auto-Sent',
    spam:            'Spam / Skipped',
    error:           'Error',
  };
  return map[outcome] || outcome || '—';
}

function outcomeColor(outcome) {
  if (outcome === 'same_day_booked') return '#c0392b';
  if (outcome === 'booked')          return '#27ae60';
  if (outcome === 'error')           return '#e74c3c';
  if (outcome === 'voicemail')       return '#e67e22';
  if (outcome === 'cancelled')       return '#8e44ad';
  if (outcome === 'spam')            return '#95a5a6';
  return '#2c3e50';
}

// ─── Data fetching ─────────────────────────────────────────────────────────────

async function fetchActivityLog(start, end) {
  const { data, error } = await supabase
    .from('kai_activity_log')
    .select('*')
    .gte('created_at', start)
    .lt('created_at', end)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`activity_log query failed: ${error.message}`);
  return data || [];
}

async function fetchTodaysBookings(start, end) {
  // Bookings where the appointment itself is today (starts_at)
  // AND bookings created today (created_at) — union via OR
  const { data, error } = await supabase
    .from('appointments')
    .select('id, square_booking_id, service_name, service_type, duration_mins, starts_at, therapist, price_usd, status, booked_source, created_at')
    .or(`starts_at.gte.${start},starts_at.lt.${end}`)
    .order('starts_at', { ascending: true });

  if (error) throw new Error(`appointments query failed: ${error.message}`);
  return data || [];
}

// ─── HTML builder ──────────────────────────────────────────────────────────────

function buildEmail(activities, appointments, dateLabel) {
  // ── Segment activities ──
  const calls   = activities.filter(a => a.event_type === 'call');
  const smsMsgs = activities.filter(a => a.event_type === 'sms');
  const emails  = activities.filter(a => a.event_type === 'email');
  const bookings = activities.filter(a => a.event_type === 'booking');

  // Same-day booking warnings (from both activity log and appointments table)
  const sameDayFromLog   = bookings.filter(b => b.same_day);
  const sameDayAppts     = appointments.filter(a => {
    if (!a.starts_at) return false;
    const apptDate  = new Date(a.starts_at).toLocaleDateString('en-US', { timeZone: AZ_TZ });
    const todayDate = new Date().toLocaleDateString('en-US', { timeZone: AZ_TZ });
    return apptDate === todayDate;
  });

  // Stats
  const callsToVapi  = calls.filter(c => c.outcome === 'routed_vapi').length;
  const callsToOwner = calls.filter(c => c.outcome === 'routed_owner').length;
  const callsVM      = calls.filter(c => c.outcome === 'voicemail').length;
  const totalCalls   = calls.length;

  const smsBooked    = smsMsgs.filter(s => s.outcome === 'booked' || s.outcome === 'same_day_booked').length;
  const smsCancelled = smsMsgs.filter(s => s.outcome === 'cancelled').length;
  const smsInfo      = smsMsgs.filter(s => s.outcome === 'info_provided').length;
  const smsError     = smsMsgs.filter(s => s.outcome === 'error').length;

  const emailDrafts  = emails.filter(e => e.outcome === 'draft_created').length;
  const emailSent    = emails.filter(e => e.outcome === 'auto_sent').length;
  const emailSpam    = emails.filter(e => e.outcome === 'spam').length;

  const newBookingsToday = bookings.filter(b => !b.same_day).length;
  const sameDayCount     = sameDayFromLog.length;

  const hasSameDayAlert  = sameDayCount > 0 || sameDayAppts.length > 0;

  // ── CSS helpers ──
  const pillStyle = (bg, fg = '#fff') =>
    `display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${bg};color:${fg};`;

  const cardStyle =
    'background:#fff;border-radius:8px;padding:16px 20px;margin:0 0 16px;border:1px solid #e8ecf0;';

  const sectionHeadStyle =
    'font-size:13px;font-weight:700;color:#5a6475;letter-spacing:.6px;text-transform:uppercase;margin:0 0 12px;';

  const tableStyle =
    'width:100%;border-collapse:collapse;font-size:13px;';

  const thStyle =
    'text-align:left;padding:6px 10px;background:#f5f7fa;color:#5a6475;font-weight:600;font-size:11px;letter-spacing:.4px;text-transform:uppercase;border-bottom:2px solid #e8ecf0;';

  const tdStyle =
    'padding:7px 10px;border-bottom:1px solid #f0f2f5;color:#2c3e50;vertical-align:top;';

  const tdMutedStyle =
    `${tdStyle}color:#8895a7;`;

  function rowsFor(items, cols) {
    if (items.length === 0) {
      return `<tr><td colspan="${cols}" style="${tdMutedStyle}font-style:italic;">None recorded today</td></tr>`;
    }
    return items.map(item => cols(item)).join('');
  }

  // ── Stat boxes ──
  function statBox(value, label, color = '#2c3e50') {
    return `
      <td style="width:25%;padding:0 8px;text-align:center;vertical-align:top;">
        <div style="background:#fff;border:1px solid #e8ecf0;border-radius:8px;padding:14px 8px;">
          <div style="font-size:28px;font-weight:700;color:${color};line-height:1;">${value}</div>
          <div style="font-size:11px;color:#8895a7;margin-top:4px;font-weight:500;letter-spacing:.3px;">${label}</div>
        </div>
      </td>`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SAME-DAY ALERT BANNER
  // ─────────────────────────────────────────────────────────────────────────────
  const sameDayBanner = hasSameDayAlert ? `
    <div style="background:#fdf2f2;border:2px solid #e74c3c;border-radius:8px;padding:16px 20px;margin:0 0 20px;">
      <div style="font-size:15px;font-weight:700;color:#c0392b;margin:0 0 8px;">
        ⚠️ Same-Day Booking Alert — Manual Verification Required
      </div>
      <div style="font-size:13px;color:#922b21;line-height:1.5;">
        Kai booked <strong>${Math.max(sameDayCount, sameDayAppts.length)} appointment(s) for today</strong>.
        Same-day bookings occasionally have sync issues with Square — please verify each one below
        is confirmed in your Square dashboard before the client arrives.
      </div>
      ${sameDayAppts.length > 0 ? `
      <table style="${tableStyle}margin-top:12px;">
        <tr>
          <th style="${thStyle}">Service</th>
          <th style="${thStyle}">Time Today</th>
          <th style="${thStyle}">Therapist</th>
          <th style="${thStyle}">Square Booking ID</th>
        </tr>
        ${sameDayAppts.map(a => `
        <tr>
          <td style="${tdStyle}font-weight:600;">${a.service_name || '—'}</td>
          <td style="${tdStyle}color:#c0392b;font-weight:600;">${fmt(a.starts_at)}</td>
          <td style="${tdStyle}">${a.therapist || '—'}</td>
          <td style="${tdStyle}font-size:11px;color:#666;">${a.square_booking_id || '—'}</td>
        </tr>`).join('')}
      </table>` : ''}
    </div>` : '';

  // ─────────────────────────────────────────────────────────────────────────────
  // CALLS SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  const callsSection = `
    <div style="${cardStyle}">
      <div style="${sectionHeadStyle}">📞 Calls — ${totalCalls} total</div>
      <table style="${tableStyle}">
        <tr>
          <th style="${thStyle}">Time</th>
          <th style="${thStyle}">From</th>
          <th style="${thStyle}">Routing</th>
          <th style="${thStyle}">Location</th>
        </tr>
        ${rowsFor(calls, c => `
        <tr>
          <td style="${tdStyle}white-space:nowrap;">${fmt(c.created_at)}</td>
          <td style="${tdStyle}">${fmtPhone(c.client_phone)}</td>
          <td style="${tdStyle}">
            <span style="${pillStyle(outcomeColor(c.outcome))}">${outcomeLabel(c.outcome)}</span>
          </td>
          <td style="${tdMutedStyle}">${[c.details?.callerCity, c.details?.callerState].filter(Boolean).join(', ') || '—'}</td>
        </tr>`)}
      </table>
      <div style="margin-top:10px;font-size:11px;color:#8895a7;">
        Kai: ${callsToVapi} &nbsp;·&nbsp; Owner: ${callsToOwner} &nbsp;·&nbsp; Voicemail: ${callsVM}
      </div>
    </div>`;

  // ─────────────────────────────────────────────────────────────────────────────
  // SMS SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  const smsSection = `
    <div style="${cardStyle}">
      <div style="${sectionHeadStyle}">💬 Texts — ${smsMsgs.length} conversations</div>
      <table style="${tableStyle}">
        <tr>
          <th style="${thStyle}">Time</th>
          <th style="${thStyle}">From</th>
          <th style="${thStyle}">Outcome</th>
        </tr>
        ${rowsFor(smsMsgs, s => `
        <tr>
          <td style="${tdStyle}white-space:nowrap;">${fmt(s.created_at)}</td>
          <td style="${tdStyle}">${fmtPhone(s.client_phone)}</td>
          <td style="${tdStyle}">
            <span style="${pillStyle(outcomeColor(s.outcome))}">${outcomeLabel(s.outcome)}</span>
          </td>
        </tr>`)}
      </table>
      <div style="margin-top:10px;font-size:11px;color:#8895a7;">
        Booked: ${smsBooked} &nbsp;·&nbsp; Info: ${smsInfo} &nbsp;·&nbsp; Cancelled: ${smsCancelled} &nbsp;·&nbsp; Errors: ${smsError}
      </div>
    </div>`;

  // ─────────────────────────────────────────────────────────────────────────────
  // EMAIL SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  const emailSection = `
    <div style="${cardStyle}">
      <div style="${sectionHeadStyle}">✉️ Emails — ${emails.length} processed</div>
      <table style="${tableStyle}">
        <tr>
          <th style="${thStyle}">Time</th>
          <th style="${thStyle}">From</th>
          <th style="${thStyle}">Subject</th>
          <th style="${thStyle}">Status</th>
        </tr>
        ${rowsFor(emails, e => `
        <tr>
          <td style="${tdStyle}white-space:nowrap;">${fmt(e.created_at)}</td>
          <td style="${tdMutedStyle}">${e.details?.from || e.client_name || '—'}</td>
          <td style="${tdStyle}">${e.details?.subject || '—'}</td>
          <td style="${tdStyle}">
            <span style="${pillStyle(outcomeColor(e.outcome))}">${outcomeLabel(e.outcome)}</span>
            ${e.details?.classification ? `<span style="font-size:10px;color:#8895a7;margin-left:4px;">${e.details.classification}</span>` : ''}
          </td>
        </tr>`)}
      </table>
      <div style="margin-top:10px;font-size:11px;color:#8895a7;">
        Drafts: ${emailDrafts} &nbsp;·&nbsp; Auto-sent: ${emailSent} &nbsp;·&nbsp; Spam/skipped: ${emailSpam}
      </div>
    </div>`;

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOKINGS SECTION
  // ─────────────────────────────────────────────────────────────────────────────
  // Show bookings from the appointments table (most complete data)
  const bookingsSection = `
    <div style="${cardStyle}">
      <div style="${sectionHeadStyle}">📅 Bookings on the Schedule Today — ${appointments.length} appointment${appointments.length !== 1 ? 's' : ''}</div>
      ${appointments.length === 0
        ? `<p style="color:#8895a7;font-style:italic;font-size:13px;margin:0;">No appointments scheduled for today.</p>`
        : `<table style="${tableStyle}">
          <tr>
            <th style="${thStyle}">Time</th>
            <th style="${thStyle}">Service</th>
            <th style="${thStyle}">Therapist</th>
            <th style="${thStyle}">Duration</th>
            <th style="${thStyle}">Source</th>
            <th style="${thStyle}">Status</th>
          </tr>
          ${appointments.map(a => {
            const isToday = (() => {
              const apptDate  = new Date(a.starts_at).toLocaleDateString('en-US', { timeZone: AZ_TZ });
              const todayDate = new Date().toLocaleDateString('en-US', { timeZone: AZ_TZ });
              return apptDate === todayDate;
            })();
            return `
          <tr style="${isToday ? 'background:#fef9f9;' : ''}">
            <td style="${tdStyle}white-space:nowrap;${isToday ? 'font-weight:700;color:#c0392b;' : ''}">${fmt(a.starts_at)}</td>
            <td style="${tdStyle}font-weight:500;">${a.service_name || '—'}${a.duration_mins ? ` (${a.duration_mins}m)` : ''}</td>
            <td style="${tdStyle}">${a.therapist || '—'}</td>
            <td style="${tdStyle}">${a.duration_mins ? `${a.duration_mins} min` : '—'}</td>
            <td style="${tdMutedStyle}">${a.booked_source || '—'}</td>
            <td style="${tdStyle}">
              <span style="${pillStyle(a.status === 'confirmed' ? '#27ae60' : a.status === 'cancelled' ? '#e74c3c' : '#8895a7')}">
                ${a.status || 'unknown'}
              </span>
              ${isToday ? `<span style="${pillStyle('#c0392b')} margin-left:4px;">TODAY</span>` : ''}
            </td>
          </tr>`;
          }).join('')}
        </table>`
      }
    </div>`;

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW BOOKINGS LOGGED TODAY (from activity log — captures source + time)
  // ─────────────────────────────────────────────────────────────────────────────
  const newBookingsSection = bookings.length > 0 ? `
    <div style="${cardStyle}">
      <div style="${sectionHeadStyle}">🆕 New Bookings Created Today — ${bookings.length} booking${bookings.length !== 1 ? 's' : ''}</div>
      <table style="${tableStyle}">
        <tr>
          <th style="${thStyle}">Logged At</th>
          <th style="${thStyle}">Client</th>
          <th style="${thStyle}">Service</th>
          <th style="${thStyle}">Appt Time</th>
          <th style="${thStyle}">Channel</th>
          <th style="${thStyle}">Status</th>
        </tr>
        ${bookings.map(b => `
        <tr style="${b.same_day ? 'background:#fef9f9;' : ''}">
          <td style="${tdStyle}white-space:nowrap;">${fmt(b.created_at)}</td>
          <td style="${tdStyle}">${b.client_name || fmtPhone(b.client_phone)}</td>
          <td style="${tdStyle}font-weight:500;">${b.service_name || '—'}</td>
          <td style="${tdStyle}${b.same_day ? 'color:#c0392b;font-weight:700;' : ''}">
            ${b.starts_at ? new Date(b.starts_at).toLocaleDateString('en-US', { timeZone: AZ_TZ, month: 'short', day: 'numeric' }) + ' ' + fmt(b.starts_at) : '—'}
            ${b.same_day ? ' ⚠️' : ''}
          </td>
          <td style="${tdMutedStyle}">${b.channel === 'phone' ? '📞 Call' : b.channel === 'sms' ? '💬 Text' : b.channel}</td>
          <td style="${tdStyle}">
            <span style="${pillStyle(outcomeColor(b.outcome))}">${outcomeLabel(b.outcome)}</span>
          </td>
        </tr>`).join('')}
      </table>
    </div>` : '';

  // ─────────────────────────────────────────────────────────────────────────────
  // ERRORS / ISSUES
  // ─────────────────────────────────────────────────────────────────────────────
  const errors = activities.filter(a => a.outcome === 'error');
  const errorsSection = errors.length > 0 ? `
    <div style="${cardStyle}border-color:#fad7d7;">
      <div style="${sectionHeadStyle}color:#c0392b;">⚠️ Errors &amp; Issues — ${errors.length}</div>
      <table style="${tableStyle}">
        <tr>
          <th style="${thStyle}">Time</th>
          <th style="${thStyle}">Channel</th>
          <th style="${thStyle}">Type</th>
          <th style="${thStyle}">Details</th>
        </tr>
        ${errors.map(e => `
        <tr>
          <td style="${tdStyle}white-space:nowrap;">${fmt(e.created_at)}</td>
          <td style="${tdStyle}">${e.channel}</td>
          <td style="${tdStyle}">${e.event_type}</td>
          <td style="${tdStyle}font-size:12px;color:#c0392b;">${e.details?.error || '—'}</td>
        </tr>`).join('')}
      </table>
    </div>` : '';

  // ─────────────────────────────────────────────────────────────────────────────
  // FULL EMAIL
  // ─────────────────────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:700px;margin:0 auto;padding:24px 16px;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,#1a2332 0%,#2c3e50 100%);border-radius:10px 10px 0 0;padding:24px 28px;margin:0 0 0;">
    <div style="font-size:11px;color:#7f8c8d;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 6px;">Daily Activity Report</div>
    <div style="font-size:22px;font-weight:700;color:#fff;margin:0 0 2px;">Kai — ${dateLabel}</div>
    <div style="font-size:13px;color:#bdc3c7;">Awaken Zen Spa · Automated summary generated at ${new Date().toLocaleTimeString('en-US', { timeZone: AZ_TZ, hour: 'numeric', minute: '2-digit' })} AZ</div>
  </div>

  <!-- Summary stats -->
  <div style="background:#fff;border-left:1px solid #e8ecf0;border-right:1px solid #e8ecf0;padding:20px 20px 16px;">
    <table style="width:100%;border-collapse:separate;border-spacing:8px 0;">
      <tr>
        ${statBox(totalCalls, 'Calls', '#2980b9')}
        ${statBox(smsMsgs.length, 'Texts', '#8e44ad')}
        ${statBox(emails.length, 'Emails', '#16a085')}
        ${statBox(bookings.length, 'New Bookings', sameDayCount > 0 ? '#c0392b' : '#27ae60')}
      </tr>
    </table>
  </div>

  <!-- Main content -->
  <div style="background:#f0f2f5;padding:16px 0;">

    ${sameDayBanner}
    ${callsSection}
    ${smsSection}
    ${emailSection}
    ${newBookingsSection}
    ${bookingsSection}
    ${errorsSection}

  </div>

  <!-- Footer -->
  <div style="background:#fff;border:1px solid #e8ecf0;border-radius:0 0 10px 10px;padding:14px 20px;text-align:center;">
    <div style="font-size:11px;color:#95a5a6;">
      Generated by Kai · Awaken Zen Spa · ${dateLabel}<br>
      <span style="color:#bdc3c7;">This report covers midnight–midnight Arizona time (UTC-7).</span>
    </div>
  </div>

</div>
</body>
</html>`;
}

// ─── Send via Resend ──────────────────────────────────────────────────────────

async function sendDigestEmail(html, dateLabel) {
  const to = process.env.DIGEST_EMAIL || process.env.GMAIL_ADDRESS || 'awakenzenspa@gmail.com';

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from:    `${SPA_NAME} — Kai <${FROM_EMAIL}>`,
      to:      [to],
      subject: `Kai Daily Summary — ${dateLabel}`,
      html,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  console.log(`[digest] Email sent to ${to} — Resend ID: ${data.id}`);
  return data.id;
}

// ─── Main export ──────────────────────────────────────────────────────────────

async function runDailyDigest() {
  const log = [];
  const stamp = () => `[INFO] ${new Date().toISOString()}`;

  log.push(`${stamp()} Daily digest started`);

  const { start, end, label } = getAzTodayRange();
  log.push(`${stamp()} Querying activity from ${start} to ${end} (${label})`);

  const [activities, appointments] = await Promise.all([
    fetchActivityLog(start, end),
    fetchTodaysBookings(start, end),
  ]);

  log.push(`${stamp()} Fetched ${activities.length} activity events, ${appointments.length} appointments`);

  const html = buildEmail(activities, appointments, label);

  const resendId = await sendDigestEmail(html, label);

  log.push(`${stamp()} Digest sent — Resend ID: ${resendId}`);
  log.push(`${stamp()} Summary — Calls: ${activities.filter(a => a.event_type === 'call').length}, SMS: ${activities.filter(a => a.event_type === 'sms').length}, Emails: ${activities.filter(a => a.event_type === 'email').length}, Bookings: ${activities.filter(a => a.event_type === 'booking').length}`);

  return { success: true, resendId, activityCount: activities.length, appointmentCount: appointments.length, log };
}

module.exports = { runDailyDigest };
