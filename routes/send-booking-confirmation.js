/**
 * AZS — Booking Confirmation Sender
 * ─────────────────────────────────────────────────────────────────
 * File: routes/send-booking-confirmation.js   (Kai / Railway)
 *
 * Called by complete-booking.js (Netlify) immediately after a
 * Square booking is created. Does:
 *   1. Upsert client row in Supabase (match by phone or email)
 *   2. Upsert appointment row
 *   3. Generate booking_tokens (intake + save_card + manage)
 *   4. Determine new vs returning client
 *   5. Send Resend email (branded HTML)
 *   6. Send Twilio SMS (short, link-first)
 *
 * POST /send-booking-confirmation
 * Auth: x-cron-token header === process.env.CRON_SECRET
 *
 * Body:
 * {
 *   squareBookingId, squareCustomerId, squareAppointmentId?,
 *   serviceType,      // 'massage' | 'facial'
 *   serviceName,
 *   durationMins,
 *   startAt,          // ISO8601
 *   priceUsd,
 *   addOns,           // string[]
 *   therapist,
 *   locationId,
 *   customer: {
 *     firstName, lastName, email, phone,
 *     contactPreference  // 'email'|'sms'|'both'  (default: 'email')
 *   }
 * }
 *
 * Env vars (Railway):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 *   CRON_SECRET
 *   BASE_URL   (https://awakenzenspa.com)
 */

const express  = require('express');
const router   = express.Router();
const { createClient } = require('@supabase/supabase-js');

const BASE_URL      = process.env.BASE_URL  || 'https://awakenzenspa.com';
const SPA_PHONE     = '(602) 688-2578';
const SPA_NAME      = 'Awaken Zen Spa';
const FROM_EMAIL    = 'hello@awakenzenspa.com';
const PORTAL_URL    = `${process.env.BASE_URL || 'https://awakenzenspa.com'}/portal`;
const TWILIO_MSG_SVC = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MG85a61647a288e50f86d21f447a498f8a';

// ── Supabase (service role) ───────────────────────────────────────────────────
const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── Auth guard ────────────────────────────────────────────────────────────────
function authGuard(req, res, next) {
  const token = req.headers['x-cron-token'] || req.headers['authorization']?.replace('Bearer ', '');
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cleanPhone(p) {
  if (!p) return null;
  const digits = String(p).replace(/[^\d]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  return p;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
    timeZone: 'America/Phoenix'
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix'
  });
}

function addToCalUrl(appt) {
  const start = new Date(appt.startAt).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const end   = new Date(new Date(appt.startAt).getTime() + appt.durationMins * 60000)
                  .toISOString().replace(/[-:]/g, '').replace('.000', '');
  const text  = encodeURIComponent(`${appt.serviceName} @ ${SPA_NAME}`);
  const loc   = encodeURIComponent('2830 E. Brown Rd. Suite 10, Mesa, AZ 85213');
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&location=${loc}`;
}

// ── ICS calendar attachment (triggers Gmail "Add to Calendar" widget) ──────────
function generateIcs({ serviceName, startAt, durationMins }) {
  const fmt = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace('.000Z', 'Z');
  const start = fmt(startAt);
  const end   = fmt(new Date(new Date(startAt).getTime() + durationMins * 60000).toISOString());
  const uid   = `${Date.now()}@awakenzenspa.com`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Awaken Zen Spa//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${serviceName} @ Awaken Zen Spa`,
    'LOCATION:2830 E. Brown Rd. Suite 10\\, Mesa\\, AZ 85213',
    'DESCRIPTION:Your appointment at Awaken Zen Spa. Questions? Call (602) 688-2578.',
    `UID:${uid}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

// ── Clean Square service name — strip " — Variation - Xm" duplication ─────────
function cleanServiceName(name) {
  if (!name) return name;
  const dashIdx = name.indexOf(' — ');
  if (dashIdx !== -1) return name.substring(0, dashIdx).trim();
  return name;
}

// ── Supabase: upsert client ───────────────────────────────────────────────────
async function upsertClient(customer, squareCustomerId) {
  const phone = cleanPhone(customer.phone);
  const email = customer.email?.toLowerCase().trim() || null;

  // Try match by square_customer_id first, then email, then phone
  let existing = null;
  if (squareCustomerId) {
    const { data } = await sb.from('clients').select('*')
      .eq('square_customer_id', squareCustomerId).maybeSingle();
    existing = data;
  }
  if (!existing && email) {
    const { data } = await sb.from('clients').select('*')
      .eq('email', email).maybeSingle();
    existing = data;
  }
  if (!existing && phone) {
    const { data } = await sb.from('clients').select('*')
      .eq('phone', phone).maybeSingle();
    existing = data;
  }

  const isNew = !existing;

  const payload = {
    first_name:          customer.firstName || existing?.first_name || 'Guest',
    last_name:           customer.lastName  || existing?.last_name  || null,
    email,
    phone,
    square_customer_id:  squareCustomerId   || existing?.square_customer_id || null,
    contact_preference:  customer.contactPreference || existing?.contact_preference || 'email',
    updated_at:          new Date().toISOString(),
  };

  let clientRow;
  if (existing) {
    const { data, error } = await sb.from('clients')
      .update(payload).eq('id', existing.id).select().single();
    if (error) throw new Error(`Client update failed: ${error.message}`);
    clientRow = data;
  } else {
    payload.created_at = new Date().toISOString();
    const { data, error } = await sb.from('clients')
      .insert(payload).select().single();
    if (error) throw new Error(`Client insert failed: ${error.message}`);
    clientRow = data;
  }

  return { client: clientRow, isNew };
}

// ── Supabase: upsert appointment ──────────────────────────────────────────────
async function upsertAppointment(clientId, body) {
  const startsAt = new Date(body.startAt).toISOString();

  // Check for existing by square_booking_id
  if (body.squareBookingId) {
    const { data: existing } = await sb.from('appointments')
      .select('id').eq('square_booking_id', body.squareBookingId).maybeSingle();
    if (existing) return existing.id;
  }

  const payload = {
    client_id:             clientId,
    square_booking_id:     body.squareBookingId    || null,
    square_appointment_id: body.squareAppointmentId|| null,
    square_customer_id:    body.squareCustomerId   || null,
    service_name:          body.serviceName,
    service_type:          body.serviceType        || 'massage',
    duration_mins:         body.durationMins,
    starts_at:             startsAt,
    therapist:             body.therapist          || 'Brant',
    price_usd:             body.priceUsd           || null,
    add_ons:               body.addOns             || [],
    status:                'upcoming',
    booked_source:         body.bookedSource       || 'website',
    location_id:           body.locationId         || null,
    created_at:            new Date().toISOString(),
    updated_at:            new Date().toISOString(),
  };

  const { data, error } = await sb.from('appointments').insert(payload).select('id').single();
  if (error) throw new Error(`Appointment insert failed: ${error.message}`);
  return data.id;
}

// ── Supabase: generate tokens ─────────────────────────────────────────────────
async function createTokens(clientId, appointmentId, squareBookingId, needsIntake, needsCard) {
  const tokens = [];
  const purposes = ['manage'];
  if (needsIntake) purposes.push('intake');
  if (needsCard)   purposes.push('save_card');

  for (const purpose of purposes) {
    const { data, error } = await sb.from('booking_tokens').insert({
      client_id:         clientId,
      appointment_id:    appointmentId,
      square_booking_id: squareBookingId,
      purpose,
      expires_at:        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).select('token, purpose').single();
    if (error) throw new Error(`Token create failed (${purpose}): ${error.message}`);
    tokens.push(data);
  }

  return tokens.reduce((acc, t) => ({ ...acc, [t.purpose]: t.token }), {});
}

// ── Resend email ──────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, icsContent }) {
  const payload = {
    from: `${SPA_NAME} <${FROM_EMAIL}>`,
    to: [to],
    subject,
    html,
  };
  if (icsContent) {
    payload.attachments = [{
      filename: 'appointment.ics',
      content: Buffer.from(icsContent).toString('base64'),
    }];
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend failed: ${txt}`);
  }
  return true;
}

// ── Twilio SMS ────────────────────────────────────────────────────────────────
async function sendSms(to, body) {
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !auth) {
    console.warn('[confirm] Twilio not configured — skipping SMS');
    return;
  }
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${sid}:${auth}`).toString('base64')}`,
      },
      body: new URLSearchParams({ To: to, MessagingServiceSid: TWILIO_MSG_SVC, Body: body }).toString(),
    }
  );
  if (!res.ok) {
    const txt = await res.text();
    console.error('[confirm] SMS error:', txt);
  }
}

// ── Email HTML builders ───────────────────────────────────────────────────────
// Location image is served from your site as a static asset
// Drop the PNG at /images/location-map.png on Netlify

function emailHtmlNew({ firstName, serviceName, durationMins, dateStr, timeStr,
                         therapist, addOns, priceUsd, tokens, calUrl }) {
  const manageUrl = PORTAL_URL;
  const intakeUrl = `${BASE_URL}/intake.html?token=${tokens.intake}`;
  const cardUrl   = `${BASE_URL}/save-card.html?token=${tokens.save_card}`;

  const addOnHtml = addOns?.length
    ? `<p style="margin:4px 0 0;font-size:12px;color:#8a7f78;">Add-ons: ${addOns.join(', ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#1a1714;padding:28px 36px;text-align:center;border-radius:4px 4px 0 0;">
    <p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#faf7f2;letter-spacing:3px;text-transform:uppercase;">Awaken Zen Spa</p>
    <p style="margin:5px 0 0;font-size:10px;color:#c4a882;letter-spacing:4px;text-transform:uppercase;">Mesa · Arizona</p>
  </td></tr>

  <!-- Confirmation band -->
  <tr><td style="background:#c4a882;padding:14px 36px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#1a1714;letter-spacing:4px;text-transform:uppercase;font-weight:500;">Booking Confirmed</p>
  </td></tr>

  <!-- Main body -->
  <tr><td style="background:#ffffff;padding:36px 36px 28px;border:1px solid #e8e2d9;border-top:none;">

    <p style="margin:0 0 20px;font-size:15px;color:#1a1714;line-height:1.6;">Hi ${firstName},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b6560;line-height:1.75;">
      You're all set. We're looking forward to seeing you and making sure your experience is exactly what you need. Here are your booking details:
    </p>

    <!-- Booking card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;border:1px solid #e8e2d9;border-radius:4px;margin-bottom:28px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Service</p>
        <p style="margin:0 0 2px;font-size:16px;color:#1a1714;font-family:Georgia,serif;">${serviceName}</p>
        <p style="margin:0 0 16px;font-size:12px;color:#8a7f78;">${durationMins} min · with ${therapist}${priceUsd ? ' · $' + priceUsd : ''}</p>
        ${addOnHtml}
        <hr style="border:none;border-top:1px solid #e8e2d9;margin:16px 0;">
        <table width="100%"><tr>
          <td style="width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Date</p>
            <p style="margin:0;font-size:13px;color:#1a1714;">${dateStr}</p>
          </td>
          <td style="width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Time</p>
            <p style="margin:0;font-size:13px;color:#1a1714;">${timeStr}</p>
          </td>
        </tr></table>
      </td></tr>
    </table>

    <!-- Arrival note -->
    <div style="border-left:3px solid #c4a882;padding:12px 16px;margin-bottom:28px;background:#faf7f2;">
      <p style="margin:0;font-size:13px;color:#6b6560;line-height:1.7;">
        Plan to arrive <strong style="color:#1a1714;">5–10 minutes early</strong> so you have a moment to settle in and we can discuss your service before we begin. We're a by-appointment boutique — your time is protected.
      </p>
    </div>

    <!-- Intake CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;background:#faf7f2;border:1px solid #e8e2d9;border-radius:4px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 6px;font-size:13px;color:#1a1714;font-weight:500;">Complete your intake form</p>
        <p style="margin:0 0 14px;font-size:12px;color:#8a7f78;line-height:1.6;">
          Takes about 3 minutes. Filling it out in advance means more time on the table and a session truly tailored to you.
        </p>
        <a href="${intakeUrl}" style="display:inline-block;background:#1a1714;color:#faf7f2;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;border-radius:2px;">Complete Intake →</a>
      </td></tr>
    </table>

    <!-- Save card CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;background:#faf7f2;border:1px solid #e8e2d9;border-radius:4px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 6px;font-size:13px;color:#1a1714;font-weight:500;">Save a card on file</p>
        <p style="margin:0 0 14px;font-size:12px;color:#8a7f78;line-height:1.6;">
          We require a card on file to hold your appointment. It is only charged in the event of a late cancellation (under 24 hours) or no-show per our policy.
        </p>
        <a href="${cardUrl}" style="display:inline-block;background:#c4a882;color:#1a1714;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:10px 20px;border-radius:2px;">Save Card →</a>
      </td></tr>
    </table>

    <!-- Actions row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-right:6px;">
          <a href="${calUrl}" style="display:block;text-align:center;border:1px solid #e8e2d9;border-radius:2px;padding:10px 12px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1a1714;background:#fff;">+ Google Calendar</a>
        </td>
        <td style="padding-left:6px;">
          <a href="${manageUrl}" style="display:block;text-align:center;border:1px solid #e8e2d9;border-radius:2px;padding:10px 12px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1a1714;background:#fff;">Manage Booking</a>
        </td>
      </tr>
    </table>

    <!-- Location image -->
    <p style="margin:0 0 12px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Finding Us</p>
    <img src="${BASE_URL}/images/location-map.png" alt="Awaken Zen Spa location map" width="488" style="width:100%;max-width:488px;border-radius:4px;border:1px solid #e8e2d9;display:block;margin-bottom:16px;">
    <p style="margin:0 0 4px;font-size:12px;color:#6b6560;line-height:1.6;">
      We're located at <strong style="color:#1a1714;">2830 E. Brown Rd., Suite 10, Mesa, AZ 85213</strong> — behind Sense Wellness Clinic (Suite 9). Park in any available spot and come around back.
    </p>
    <p style="margin:0;font-size:12px;color:#6b6560;">
      Questions? Text or call us at <a href="tel:+16026882578" style="color:#c4a882;text-decoration:none;">${SPA_PHONE}</a>.
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#faf7f2;border:1px solid #e8e2d9;border-top:none;padding:20px 36px;text-align:center;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:10px;color:#8a7f78;letter-spacing:1px;">© ${new Date().getFullYear()} ${SPA_NAME} · Mesa, AZ · <a href="https://awakenzenspa.com" style="color:#8a7f78;">awakenzenspa.com</a></p>
    <p style="margin:4px 0 0;font-size:10px;color:#8a7f78;"><a href="mailto:hello@awakenzenspa.com" style="color:#c4a882;text-decoration:none;">hello@awakenzenspa.com</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function emailHtmlReturning({ firstName, serviceName, durationMins, dateStr, timeStr,
                               therapist, addOns, priceUsd, tokens, calUrl }) {
  const manageUrl = PORTAL_URL;
  const addOnHtml = addOns?.length
    ? `<p style="margin:4px 0 0;font-size:12px;color:#8a7f78;">Add-ons: ${addOns.join(', ')}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf7f2;font-family:'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;padding:32px 16px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#1a1714;padding:28px 36px;text-align:center;border-radius:4px 4px 0 0;">
    <p style="margin:0;font-family:Georgia,serif;font-size:20px;color:#faf7f2;letter-spacing:3px;text-transform:uppercase;">Awaken Zen Spa</p>
    <p style="margin:5px 0 0;font-size:10px;color:#c4a882;letter-spacing:4px;text-transform:uppercase;">Mesa · Arizona</p>
  </td></tr>

  <!-- Confirmation band -->
  <tr><td style="background:#c4a882;padding:14px 36px;text-align:center;">
    <p style="margin:0;font-size:11px;color:#1a1714;letter-spacing:4px;text-transform:uppercase;font-weight:500;">Booking Confirmed</p>
  </td></tr>

  <!-- Main body -->
  <tr><td style="background:#ffffff;padding:36px 36px 28px;border:1px solid #e8e2d9;border-top:none;">

    <p style="margin:0 0 20px;font-size:15px;color:#1a1714;line-height:1.6;">Welcome back, ${firstName}.</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b6560;line-height:1.75;">
      Great to have you back. Your appointment is confirmed — here's everything you need.
    </p>

    <!-- Booking card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf7f2;border:1px solid #e8e2d9;border-radius:4px;margin-bottom:28px;">
      <tr><td style="padding:20px 22px;">
        <p style="margin:0 0 3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Service</p>
        <p style="margin:0 0 2px;font-size:16px;color:#1a1714;font-family:Georgia,serif;">${serviceName}</p>
        <p style="margin:0 0 16px;font-size:12px;color:#8a7f78;">${durationMins} min · with ${therapist}${priceUsd ? ' · $' + priceUsd : ''}</p>
        ${addOnHtml}
        <hr style="border:none;border-top:1px solid #e8e2d9;margin:16px 0;">
        <table width="100%"><tr>
          <td style="width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Date</p>
            <p style="margin:0;font-size:13px;color:#1a1714;">${dateStr}</p>
          </td>
          <td style="width:50%;vertical-align:top;">
            <p style="margin:0 0 3px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a7f78;">Time</p>
            <p style="margin:0;font-size:13px;color:#1a1714;">${timeStr}</p>
          </td>
        </tr></table>
      </td></tr>
    </table>

    <!-- Arrival note -->
    <div style="border-left:3px solid #c4a882;padding:12px 16px;margin-bottom:28px;background:#faf7f2;">
      <p style="margin:0;font-size:13px;color:#6b6560;line-height:1.7;">
        Plan to arrive <strong style="color:#1a1714;">5–10 minutes early</strong> so you have a moment to settle in before we begin.
      </p>
    </div>

    <!-- Actions row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-right:6px;">
          <a href="${calUrl}" style="display:block;text-align:center;border:1px solid #e8e2d9;border-radius:2px;padding:10px 12px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#1a1714;background:#fff;">+ Google Calendar</a>
        </td>
        <td style="padding-left:6px;">
          <a href="${manageUrl}" style="display:block;text-align:center;border:1px solid #1a1714;border-radius:2px;padding:10px 12px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#faf7f2;background:#1a1714;">Manage Booking</a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:12px;color:#6b6560;">
      Need to make changes? Text or call us at <a href="tel:+16026882578" style="color:#c4a882;text-decoration:none;">${SPA_PHONE}</a> or use the Manage Booking link above (cancel/reschedule up to 24 hours before).
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#faf7f2;border:1px solid #e8e2d9;border-top:none;padding:20px 36px;text-align:center;border-radius:0 0 4px 4px;">
    <p style="margin:0;font-size:10px;color:#8a7f78;letter-spacing:1px;">© ${new Date().getFullYear()} ${SPA_NAME} · Mesa, AZ · <a href="https://awakenzenspa.com" style="color:#8a7f78;">awakenzenspa.com</a></p>
    <p style="margin:4px 0 0;font-size:10px;color:#8a7f78;"><a href="mailto:hello@awakenzenspa.com" style="color:#c4a882;text-decoration:none;">hello@awakenzenspa.com</a></p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── SMS builders ──────────────────────────────────────────────────────────────
function smsNew({ firstName, serviceName, dateStr, timeStr, tokens }) {
  const intakeUrl = tokens.intake ? `${BASE_URL}/intake.html?token=${tokens.intake}` : null;
  const cardUrl   = tokens.save_card ? `${BASE_URL}/save-card.html?token=${tokens.save_card}` : null;

  let msg = `Hi ${firstName}! Your ${serviceName} is confirmed for ${dateStr} at ${timeStr} — Awaken Zen Spa.\n\nArrive 5–10 min early.\n\nManage: ${PORTAL_URL}`;
  if (intakeUrl) msg += `\nIntake form: ${intakeUrl}`;
  if (cardUrl)   msg += `\nSave card: ${cardUrl}`;
  msg += `\n\nQuestions? ${SPA_PHONE}`;
  return msg;
}

function smsReturning({ firstName, serviceName, dateStr, timeStr }) {
  return `Welcome back ${firstName}! ${serviceName} confirmed — ${dateStr} at ${timeStr}.\n\nArrive 5–10 min early. Manage/cancel: ${PORTAL_URL}\n\nSee you soon — Awaken Zen Spa`;
}

// ── Route handler ─────────────────────────────────────────────────────────────
router.post('/', authGuard, async (req, res) => {
  const body = req.body;

  try {
    const { customer, squareCustomerId, squareBookingId, squareAppointmentId,
            serviceType, serviceName, durationMins, startAt,
            priceUsd, addOns, therapist, locationId, bookedSource } = body;

    if (!customer || !serviceName || !startAt) {
      return res.status(400).json({ error: 'Missing required fields: customer, serviceName, startAt' });
    }

    const cleanedServiceName = cleanServiceName(serviceName);

    // 1. Upsert client
    const { client, isNew } = await upsertClient(customer, squareCustomerId);
    console.log(`[confirm] Client ${isNew ? 'created' : 'found'}: ${client.id}`);

    // 2. Upsert appointment
    const appointmentId = await upsertAppointment(client.id, {
      squareBookingId, squareAppointmentId, squareCustomerId,
      serviceName, serviceType, durationMins, startAt,
      therapist, priceUsd, addOns, locationId, bookedSource,
    });
    console.log(`[confirm] Appointment: ${appointmentId}`);

    // 3. Determine what tokens are needed
    const needsIntake = isNew || (!client.intake_massage && serviceType !== 'facial') || (!client.intake_facial && serviceType === 'facial');
    const needsCard   = !client.has_card_on_file;

    // 4. Create tokens
    const tokens = await createTokens(client.id, appointmentId, squareBookingId, needsIntake, needsCard);
    console.log(`[confirm] Tokens created: ${Object.keys(tokens).join(', ')}`);

    // 5. Build display strings
    const dateStr  = formatDate(startAt);
    const timeStr  = formatTime(startAt);
    const calUrl   = addToCalUrl({ startAt, durationMins, serviceName: cleanedServiceName });
    const icsContent = generateIcs({ serviceName: cleanedServiceName, startAt, durationMins });
    const pref     = client.contact_preference || 'email';

    const emailArgs = {
      firstName:   client.first_name,
      serviceName: cleanedServiceName,
      durationMins,
      dateStr, timeStr,
      therapist:   therapist || 'Brant',
      addOns:      addOns || [],
      priceUsd,
      tokens, calUrl,
    };

    // 6. Send email
    if ((pref === 'email' || pref === 'both') && client.email) {
      const subject = isNew
        ? `Your booking at ${SPA_NAME} is confirmed — a few things before you arrive`
        : `You're confirmed for ${cleanedServiceName} — ${dateStr}`;
      const html = isNew ? emailHtmlNew(emailArgs) : emailHtmlReturning(emailArgs);
      await sendEmail({ to: client.email, subject, html, icsContent });
      console.log(`[confirm] Email sent to ${client.email}`);
    }

    // 7. Send SMS
    const phone = cleanPhone(client.phone);
    if ((pref === 'sms' || pref === 'both') && phone) {
      const smsBody = isNew
        ? smsNew({ firstName: client.first_name, serviceName: cleanedServiceName, dateStr, timeStr, tokens })
        : smsReturning({ firstName: client.first_name, serviceName: cleanedServiceName, dateStr, timeStr });
      await sendSms(phone, smsBody);
      console.log(`[confirm] SMS sent to ${phone}`);
    }

    return res.json({
      ok: true,
      clientId:      client.id,
      isNew,
      appointmentId,
      tokensPrepared: Object.keys(tokens),
    });

  } catch (err) {
    console.error('[confirm] Fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
