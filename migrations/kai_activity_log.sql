-- ─────────────────────────────────────────────────────────────────────────────
-- Kai Activity Log — tracks all Kai interactions for the daily digest email
-- Run this once in the Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists kai_activity_log (
  id           uuid        primary key default gen_random_uuid(),

  -- What kind of event and which channel it came through
  event_type   text        not null,   -- 'call' | 'sms' | 'email' | 'booking'
  channel      text        not null,   -- 'phone' | 'sms' | 'email'

  -- What happened
  outcome      text,
  -- call:    'routed_vapi' | 'routed_owner' | 'voicemail'
  -- sms:     'booked' | 'info_provided' | 'cancelled' | 'error'
  -- email:   'draft_created' | 'auto_sent' | 'spam' | 'error'
  -- booking: 'booked' | 'same_day_booked' | 'error'

  client_phone text,        -- caller/texter phone number
  client_name  text,        -- name if known

  -- Booking-specific fields (populated for booking events and SMS/call bookings)
  service_name text,        -- e.g. "Muscle Mender: Deep Tissue (90 min)"
  booking_id   text,        -- Square booking ID
  same_day     boolean      not null default false,  -- true = appointment is today
  starts_at    timestamptz, -- appointment start time (ISO8601)

  -- Catch-all for additional context (email subject, error message, etc.)
  details      jsonb,

  created_at   timestamptz not null default now()
);

-- Fast lookups for the daily digest query
create index if not exists kai_activity_log_created_at_idx
  on kai_activity_log (created_at desc);

create index if not exists kai_activity_log_event_type_idx
  on kai_activity_log (event_type, created_at desc);

create index if not exists kai_activity_log_same_day_idx
  on kai_activity_log (same_day, created_at desc)
  where same_day = true;
