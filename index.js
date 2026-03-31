// ─────────────────────────────────────────────────────────────────────────────
// v2
// ─────────────────────────────────────────────────────────────────────────────
// Awaken Zen Spa — Kai Webhook Server
// Full build: time routing, SMS tools, Square availability + booking
// Flash Fill: member sync, group management
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const twilio  = require("twilio");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

const VoiceResponse = twilio.twiml.VoiceResponse;
const twilioClient  = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TWILIO_NUMBER   = process.env.TWILIO_PHONE_NUMBER;
const VAPI_NUMBER     = process.env.VAPI_PHONE_NUMBER;
const OWNER_CELL      = "+16232196907";
const BOOKING_URL     = "https://awakenzenspa.com/booking";
const GIFT_CARD_URL   = "https://awakenzenspa.com/gift-cards";
const LOCATION_ID     = "TMRQ3D20EFD1X";
const SQUARE_TOKEN    = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_BASE     = "https://connect.squareup.com/v2";
const SQUARE_VERSION  = "2024-01-18";

// ── Team Members ──────────────────────────────────────────────────────────────
const TEAM_MEMBERS = {
  brant:   { id: "OVUiDLRyxkDxB12f_8w9", name: "Brant" },
  trevor:  { id: "TMvKNbcHqsI4aECK",     name: "Trevor" }
};

// ── Service Variation IDs for bookable services ───────────────────────────────
const SERVICES = {
  "european royalty": {
    label: "European Royalty: Classic Swedish",
    variations: {
      "60":  "TIB77G2AIP7GABDSWZFXN6FF",
      "90":  "QAVQO7BGDYOVEI65CWUCOWY7",
      "120": "W7KH4DISA5C7BQMNED2OIGKM"
    }
  },
  "swedish": {
    label: "European Royalty: Classic Swedish",
    variations: {
      "60":  "TIB77G2AIP7GABDSWZFXN6FF",
      "90":  "QAVQO7BGDYOVEI65CWUCOWY7",
      "120": "W7KH4DISA5C7BQMNED2OIGKM"
    }
  },
  "muscle mender": {
    label: "Muscle Mender: Deep Tissue",
    variations: {
      "60":  "BIWQQPHXSAC25JHMLKEIYVVV",
      "90":  "F4D4WJDBUV6VPW3NZ5WUPAWA",
      "120": "XP5NCMNL7ZSPKK44GFN46BW3"
    }
  },
  "deep tissue": {
    label: "Muscle Mender: Deep Tissue",
    variations: {
      "60":  "BIWQQPHXSAC25JHMLKEIYVVV",
      "90":  "F4D4WJDBUV6VPW3NZ5WUPAWA",
      "120": "XP5NCMNL7ZSPKK44GFN46BW3"
    }
  },
  "spring senses": {
    label: "Spring Senses: Lymphatic Drainage",
    variations: {
      "60":  "K2W6NJ6KSTSVZWPKE3L7WIWD",
      "90":  "TIQJY3TSW6ZWJ27X2ENK2LKF",
      "120": "6VULYOQRLLMEWRZBM5DEWVQE"
    }
  },
  "lymphatic": {
    label: "Spring Senses: Lymphatic Drainage",
    variations: {
      "60":  "K2W6NJ6KSTSVZWPKE3L7WIWD",
      "90":  "TIQJY3TSW6ZWJ27X2ENK2LKF",
      "120": "6VULYOQRLLMEWRZBM5DEWVQE"
    }
  },
  "sole symphony": {
    label: "Sole Symphony: Ashiatsu Barefoot Massage",
    variations: {
      "60":  "P347T32CDIANCUFTNRFR573O",
      "90":  "Q5RG75PJSA432POINYAKY24A",
      "120": "73Z3KGC536LSV32TXW6XP4AW"
    }
  },
  "ashiatsu": {
    label: "Sole Symphony: Ashiatsu Barefoot Massage",
    variations: {
      "60":  "P347T32CDIANCUFTNRFR573O",
      "90":  "Q5RG75PJSA432POINYAKY24A",
      "120": "73Z3KGC536LSV32TXW6XP4AW"
    }
  },
  "warm stone": {
    label: "Warm Stone Retreat",
    variations: {
      "90":  "6XAXNAZIE3MDEZBLB3GD5UYU",
      "120": "K7XIEBQ2DTYB4YF5TCHLNMXJ"
    }
  },
  "hot stone": {
    label: "Warm Stone Retreat",
    variations: {
      "90":  "6XAXNAZIE3MDEZBLB3GD5UYU",
      "120": "K7XIEBQ2DTYB4YF5TCHLNMXJ"
    }
  },
  "luxury spa": {
    label: "Luxury Spa Experience",
    variations: {
      "120": "TIC4IYJZHISU4ZCBHZIYKTUT"
    }
  },
  "head scalp": {
    label: "Radiant Head & Scalp Experience",
    variations: {
      "120": "ZQQHCBPQNW2HCHKYW7HQ3VWX"
    }
  },
  "radiant head": {
    label: "Radiant Head & Scalp Experience",
    variations: {
      "120": "ZQQHCBPQNW2HCHKYW7HQ3VWX"
    }
  },
  "calm and clear": {
    label: "Calm and Clear: Relaxation Facial",
    variations: {
      "60": "HAAWAKV7TD7L6OD27CNZ2A33",
      "90": "UUNTT5FDE6MYNJGEMLEB7STI"
    }
  },
  "relaxation facial": {
    label: "Calm and Clear: Relaxation Facial",
    variations: {
      "60": "HAAWAKV7TD7L6OD27CNZ2A33",
      "90": "UUNTT5FDE6MYNJGEMLEB7STI"
    }
  },
  "youthful glow": {
    label: "Youthful Glow: Anti-Aging Facial",
    variations: {
      "60": "LAEOGJ23JVQGXQ2SD4UWECJV",
      "90": "33L2RRNH6UCPWLUTEZFRHTEM"
    }
  },
  "anti aging": {
    label: "Youthful Glow: Anti-Aging Facial",
    variations: {
      "60": "LAEOGJ23JVQGXQ2SD4UWECJV",
      "90": "33L2RRNH6UCPWLUTEZFRHTEM"
    }
  },
  "microdermabrasion": {
    label: "Micro-Dermabrasion Treatment",
    variations: {
      "60": "4LWHUA7X53NZFBT3FB54J272",
      "90": "SYT7F6KBIPDXRN5KFXCKWE5U"
    }
  },
  "microderm": {
    label: "Micro-Dermabrasion Treatment",
    variations: {
      "60": "4LWHUA7X53NZFBT3FB54J272",
      "90": "SYT7F6KBIPDXRN5KFXCKWE5U"
    }
  },
  "dermaplane": {
    label: "Dermaplane Treatment",
    variations: {
      "60": "DQVFGWUDTDG3ID5VDHD2FORT",
      "90": "EG3TALRSZNFYB6FIURQ6URS6"
    }
  },
  "microneedling": {
    label: "Micro-Needling Treatment",
    variations: {
      "60": "3DYWCG6NEV3PBAUXHMNYWT4V"
    }
  },
  "waxing brows": {
    label: "Waxing - Brows",
    variations: { "20": "KXXXZFA5YVEKGKFEF2I2PWUZ" }
  },
  "waxing lip": {
    label: "Waxing - Lip & Chin",
    variations: { "15": "CPBUQUO4JTD24G5ULN2AE7WW" }
  },
  "full face wax": {
    label: "Full Face Wax",
    variations: { "30": "ILEAGQTQEJMAP7KJH527CHUA" }
  },
  "brow lamination": {
    label: "Brow Lamination",
    variations: { "45": "UMOB6VGE2XHHMX3S3AYVG4SX" }
  }
};

// ── Square API helper ─────────────────────────────────────────────────────────
async function squareRequest(method, path, body = null) {
  const opts = {
    method,
    headers: {
      "Square-Version": SQUARE_VERSION,
      "Authorization": `Bearer ${SQUARE_TOKEN}`,
      "Content-Type": "application/json"
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${SQUARE_BASE}${path}`, opts);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// FLASH FILL — Member Sync
// ─────────────────────────────────────────────────────────────────────────────

async function runMemberSync() {
  const log = makeSyncLogger();
  log.info("Member sync started");

  try {
    const subscriptions = await fetchAllSubscriptions(log);
    log.info(`Fetched ${subscriptions.length} subscriptions from Square`);

    if (subscriptions.length === 0) {
      log.info("No subscriptions found");
      return { synced: 0, clientsUpdated: 0, flagsUpdated: 0 };
    }

    const enriched       = await resolveClientIds(subscriptions, log);
    const synced         = await upsertMemberSync(enriched, log);
    const clientsUpdated = await updateClientsTable(enriched, log);
    const flagsUpdated   = await syncMemberFlags(log);

    log.info(`Done — ${synced} subscriptions | ${clientsUpdated} clients | ${flagsUpdated} flags`);
    return { synced, clientsUpdated, flagsUpdated, log: log.entries };

  } catch (err) {
    log.error(`Member sync failed: ${err.message}`);
    throw err;
  }
}

async function fetchAllSubscriptions(log) {
  const subscriptions = [];
  let cursor = null;
  do {
    const res = await fetch(`${SQUARE_BASE}/subscriptions/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SQUARE_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": SQUARE_VERSION
      },
      body: JSON.stringify({ limit: 100, ...(cursor && { cursor }) })
    });
    if (!res.ok) throw new Error(`Square Subscriptions API ${res.status}: ${await res.text()}`);
    const data = await res.json();
    (data.subscriptions || []).forEach(s => subscriptions.push(s));
    cursor = data.cursor || null;
    log.info(`  Batch: ${data.subscriptions?.length || 0} (total: ${subscriptions.length})`);
  } while (cursor);
  return subscriptions;
}

async function resolveClientIds(subscriptions, log) {
  const squareIds = [...new Set(subscriptions.map(s => s.customer_id).filter(Boolean))];
  const { data: clients, error } = await supabase
    .from("clients")
    .select("id, square_customer_id")
    .in("square_customer_id", squareIds);

  if (error) {
    log.warn(`Client lookup failed: ${error.message}`);
    return subscriptions.map(s => ({ ...s, client_id: null }));
  }

  const clientMap = {};
  (clients || []).forEach(c => { clientMap[c.square_customer_id] = c.id; });

  const unresolved = squareIds.filter(id => !clientMap[id]);
  if (unresolved.length > 0) log.warn(`${unresolved.length} Square IDs not found in clients table`);

  return subscriptions.map(s => ({ ...s, client_id: clientMap[s.customer_id] || null }));
}

async function upsertMemberSync(subscriptions, log) {
  const allRows = subscriptions.map(s => ({
    square_customer_id:  s.customer_id,
    client_id:           s.client_id || null,
    membership_plan:     s.plan_variation_data?.name || s.plan_id || "AZS Membership",
    status:              normalizeMemberStatus(s.status),
    square_started_at:   s.start_date    ? new Date(s.start_date).toISOString()    : null,
    square_cancelled_at: s.canceled_date ? new Date(s.canceled_date).toISOString() : null,
    synced_at:           new Date().toISOString()
  }));

  // Dedup by square_customer_id — keep active over cancelled, then most recent start date
  const deduped = Object.values(
    allRows.reduce((acc, row) => {
      const existing = acc[row.square_customer_id];
      if (!existing) { acc[row.square_customer_id] = row; return acc; }
      const rowIsActive      = row.status === "active";
      const existingIsActive = existing.status === "active";
      if (rowIsActive && !existingIsActive) { acc[row.square_customer_id] = row; return acc; }
      if (!rowIsActive && existingIsActive) return acc;
      if (row.square_started_at > (existing.square_started_at || "")) {
        acc[row.square_customer_id] = row;
      }
      return acc;
    }, {})
  );

  if (allRows.length !== deduped.length) {
    log.info(`Deduped ${allRows.length} subscriptions to ${deduped.length} unique customers`);
  }

  const { error } = await supabase
    .from("square_member_sync")
    .upsert(deduped, { onConflict: "square_customer_id" });
  if (error) throw new Error(`square_member_sync upsert error: ${error.message}`);
  log.info(`Upserted ${deduped.length} rows into square_member_sync`);
  return deduped.length;
}

async function updateClientsTable(subscriptions, log) {
  const matched     = subscriptions.filter(s => s.client_id);
  const activeIds   = matched.filter(s => normalizeMemberStatus(s.status) === "active").map(s => s.client_id);
  const inactiveIds = matched.filter(s => normalizeMemberStatus(s.status) !== "active").map(s => s.client_id);
  let updated = 0;

  if (activeIds.length > 0) {
    const { error } = await supabase.from("clients")
      .update({ membership_active: true, updated_at: new Date().toISOString() })
      .in("id", activeIds);
    if (error) log.warn(`Active update error: ${error.message}`);
    else updated += activeIds.length;
  }
  if (inactiveIds.length > 0) {
    const { error } = await supabase.from("clients")
      .update({ membership_active: false, updated_at: new Date().toISOString() })
      .in("id", inactiveIds);
    if (error) log.warn(`Inactive update error: ${error.message}`);
    else updated += inactiveIds.length;
  }

  log.info(`Updated membership_active on ${updated} clients`);
  return updated;
}

async function syncMemberFlags(log) {
  const { data, error } = await supabase.rpc("sync_member_exclusions");
  if (error) throw new Error(`sync_member_exclusions() failed: ${error.message}`);
  log.info(`sync_member_exclusions() flipped ${data} flash_group_members flags`);
  return data;
}

function normalizeMemberStatus(squareStatus) {
  const map = {
    "ACTIVE": "active", "PENDING": "active",
    "PAUSED": "paused", "SUSPENDED": "paused",
    "CANCELED": "cancelled", "DEACTIVATED": "cancelled"
  };
  return map[squareStatus] || "cancelled";
}

function makeSyncLogger() {
  const entries = [];
  const stamp = () => new Date().toISOString();
  return {
    entries,
    info:  (msg) => { const e = `[INFO]  ${stamp()} ${msg}`; entries.push(e); console.log(e); },
    warn:  (msg) => { const e = `[WARN]  ${stamp()} ${msg}`; entries.push(e); console.warn(e); },
    error: (msg) => { const e = `[ERROR] ${stamp()} ${msg}`; entries.push(e); console.error(e); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// END FLASH FILL — Member Sync
// ─────────────────────────────────────────────────────────────────────────────

// ── Format date helper ────────────────────────────────────────────────────────
function resolveDate(input) {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" }));
  const today = now.getDay();
  const lower = input.toLowerCase().trim();

  if (lower === "today") return now;
  if (lower === "tomorrow") {
    const d = new Date(now); d.setDate(d.getDate() + 1); return d;
  }

  const dayIdx = days.indexOf(lower);
  if (dayIdx !== -1) {
    const diff = (dayIdx - today + 7) % 7 || 7;
    const d = new Date(now); d.setDate(d.getDate() + diff); return d;
  }

  const parsed = new Date(input);
  if (!isNaN(parsed)) return parsed;

  return null;
}

function formatDateForSquare(date) {
  return date.toISOString().split("T")[0];
}

function formatTimeForDisplay(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

// ── Time-based routing ────────────────────────────────────────────────────────
function isLiveWindow() {
  const now = new Date();
  const azTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
  const total = azTime.getHours() * 60 + azTime.getMinutes();
  return total >= 480 && total < 570;
}

// ── Route: Inbound call ───────────────────────────────────────────────────────
app.post("/incoming", (req, res) => {
  const twiml = new VoiceResponse();
  if (isLiveWindow()) {
    const dial = twiml.dial({ timeout: 20, action: "/no-answer" });
    dial.number({ url: `${process.env.BASE_URL}/whisper` }, OWNER_CELL);
  } else {
    const dial = twiml.dial({ timeout: 30, action: "/no-answer" });
    dial.number(VAPI_NUMBER);
  }
  res.type("text/xml");
  res.send(twiml.toString());
});

// ── Route: No answer fallback ─────────────────────────────────────────────────
app.post("/no-answer", (req, res) => {
  const twiml = new VoiceResponse();
  if (req.body.DialCallStatus !== "completed" && req.body.DialCallStatus !== "answered") {
    const dial = twiml.dial();
    dial.number(VAPI_NUMBER);
  }
  res.type("text/xml");
  res.send(twiml.toString());
});

// ── Route: Whisper ────────────────────────────────────────────────────────────
app.post("/whisper", (req, res) => {
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="alice">Awaken Zen Spa call.</Say></Response>`);
});

// ── Helper: extract tool parameters ──────────────────────────────────────────
function extractParams(body) {
  if (body.phoneNumber || body.serviceKey || body.date) return body;
  try {
    const args = body?.message?.toolCallList?.[0]?.function?.arguments;
    if (args) return typeof args === "string" ? JSON.parse(args) : args;
  } catch (e) {}
  try {
    const args = body?.message?.toolCalls?.[0]?.function?.arguments;
    if (args) return typeof args === "string" ? JSON.parse(args) : args;
  } catch (e) {}
  try {
    const params = body?.message?.functionCall?.parameters;
    if (params) return typeof params === "string" ? JSON.parse(params) : params;
  } catch (e) {}
  return body;
}

// ── Helper: extract toolCallId ────────────────────────────────────────────────
function extractToolCallId(body) {
  return body?.message?.toolCallList?.[0]?.id ||
         body?.message?.toolCalls?.[0]?.id ||
         body?.message?.functionCall?.id ||
         body?.toolCallId ||
         "unknown";
}

// ── Helper: format response for Vapi ─────────────────────────────────────────
function vapiResponse(res, toolCallId, resultText) {
  const singleLine = String(resultText).replace(/\n/g, " ").replace(/\r/g, "");
  res.json({ results: [{ toolCallId, result: singleLine }] });
}

// ── Route: Send Booking Link ──────────────────────────────────────────────────
app.post("/send-booking-link", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const params = extractParams(req.body);
    const phoneNumber = params.phoneNumber || params.phone_number || params.to;
    if (!phoneNumber) {
      return vapiResponse(res, toolCallId, "Booking link ready — please ask the caller for their phone number to send the link.");
    }
    await twilioClient.messages.create({
      from: TWILIO_NUMBER,
      to: phoneNumber,
      body: `Hi, it's Awaken Zen Spa! Here's your booking link:\n\n${BOOKING_URL}\n\nSee you soon ✨`
    });
    vapiResponse(res, toolCallId, "Booking link sent successfully.");
  } catch (err) {
    console.error("sendBookingLink error:", err.message);
    vapiResponse(res, toolCallId, "Failed to send booking link.");
  }
});

// ── Route: Send Gift Card Link ────────────────────────────────────────────────
app.post("/send-gift-card-link", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const params = extractParams(req.body);
    const phoneNumber = params.phoneNumber || params.phone_number || params.to;
    if (!phoneNumber) {
      return vapiResponse(res, toolCallId, "Gift card link ready — please ask the caller for their phone number.");
    }
    await twilioClient.messages.create({
      from: TWILIO_NUMBER,
      to: phoneNumber,
      body: `Hi, it's Awaken Zen Spa! Gift cards available here:\n\n${GIFT_CARD_URL}\n\nA beautiful gift ✨`
    });
    vapiResponse(res, toolCallId, "Gift card link sent successfully.");
  } catch (err) {
    console.error("sendGiftCardLink error:", err.message);
    vapiResponse(res, toolCallId, "Failed to send gift card link.");
  }
});

// ── Route: Check Availability ─────────────────────────────────────────────────
app.post("/check-availability", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const { serviceKey, duration, date } = extractParams(req.body);

    const svcKey = (serviceKey || "").toLowerCase();
    const service = SERVICES[svcKey];
    if (!service) {
      return vapiResponse(res, toolCallId, "I wasn't able to find that service. Could you clarify which service you're interested in?");
    }

    const dur = String(duration || "60");
    const variationId = service.variations[dur];
    if (!variationId) {
      const available = Object.keys(service.variations).join(", ");
      return vapiResponse(res, toolCallId, `${service.label} is available in ${available} minute sessions.`);
    }

    const resolved = resolveDate(date || "tomorrow");
    if (!resolved) {
      return vapiResponse(res, toolCallId, "I couldn't determine that date — could you clarify?");
    }
    const dateStr = formatDateForSquare(resolved);

    const data = await squareRequest("POST", "/bookings/availability/search", {
      query: {
        filter: {
          start_at_range: {
            start_at: `${dateStr}T08:00:00-07:00`,
            end_at:   `${dateStr}T19:00:00-07:00`
          },
          location_id: LOCATION_ID,
          segment_filters: [
            {
              service_variation_id: variationId,
              team_member_id_filter: {
                any: Object.values(TEAM_MEMBERS).map(m => m.id)
              }
            }
          ]
        }
      }
    });

    const slots = data.availabilities || [];
    if (slots.length === 0) {
      return vapiResponse(res, toolCallId, `We don't have any openings for ${service.label} on that day. Would you like to try a different day?`);
    }

    const uniqueTimes = [...new Set(slots.map(s => formatTimeForDisplay(s.start_at)))].slice(0, 6);
    const timeList = uniqueTimes.join(", ");
    const dateDisplay = resolved.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    vapiResponse(res, toolCallId, `For ${service.label} (${dur} min) on ${dateDisplay}, we have availability at: ${timeList}. Which time works best for you?`);

  } catch (err) {
    console.error("check-availability error:", err);
    vapiResponse(res, toolCallId, "I had trouble checking availability. Would you like me to send you our booking link instead?");
  }
});

// ── Route: Book Appointment ───────────────────────────────────────────────────
app.post("/book-appointment", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const { serviceKey, duration, startAt, customerName, customerPhone, customerEmail } = extractParams(req.body);

    const svcKey = (serviceKey || "").toLowerCase();
    const service = SERVICES[svcKey];
    if (!service) return vapiResponse(res, toolCallId, "Service not found.");

    const dur = String(duration || "60");
    const variationId = service.variations[dur];
    if (!variationId) return vapiResponse(res, toolCallId, "Duration not available for this service.");

    let customerId = null;
    if (customerPhone || customerEmail) {
      const searchRes = await squareRequest("POST", "/customers/search", {
        query: { filter: { phone_number: { exact: customerPhone } } }
      });
      if (searchRes.customers && searchRes.customers.length > 0) {
        customerId = searchRes.customers[0].id;
      } else {
        const createRes = await squareRequest("POST", "/customers", {
          given_name: customerName?.split(" ")[0] || "Guest",
          family_name: customerName?.split(" ").slice(1).join(" ") || "",
          phone_number: customerPhone,
          email_address: customerEmail
        });
        customerId = createRes.customer?.id;
      }
    }

    const bookingRes = await squareRequest("POST", "/bookings", {
      booking: {
        location_id: LOCATION_ID,
        start_at: startAt,
        customer_id: customerId,
        customer_note: `Booked via Kai AI phone concierge. Card on file required per cancellation policy.`,
        appointment_segments: [
          {
            service_variation_id: variationId,
            service_variation_version: 0,
            duration_minutes: parseInt(dur),
            team_member_id: TEAM_MEMBERS.brant.id
          }
        ]
      },
      idempotency_key: `kai-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
    });

    if (bookingRes.errors) {
      console.error("Booking error:", bookingRes.errors);
      return vapiResponse(res, toolCallId, "I wasn't able to complete that booking — please use our booking page at awakenzenspa.com/booking or I can send you the link.");
    }

    const booking = bookingRes.booking;
    const displayTime = formatTimeForDisplay(booking.start_at);
    const displayDate = new Date(booking.start_at).toLocaleDateString("en-US", {
      timeZone: "America/Phoenix",
      weekday: "long",
      month: "long",
      day: "numeric"
    });

    if (customerPhone) {
      await twilioClient.messages.create({
        from: TWILIO_NUMBER,
        to: customerPhone,
        body: `Hi ${customerName?.split(" ")[0] || "there"}, you're confirmed at Awaken Zen Spa!\n\n` +
              `📅 ${service.label}\n` +
              `🕐 ${displayDate} at ${displayTime}\n` +
              `📍 2830 E Brown Rd, Suite 10, Mesa AZ\n\n` +
              `To complete your booking, please add a card on file for our 24-hour cancellation policy ($25 no-show fee):\n\n` +
              `${BOOKING_URL}\n\n` +
              `Questions? Call or text (602) 688-2578. See you soon ✨`
      });
    }

    vapiResponse(res, toolCallId, `Perfect — you're all booked! ${customerName?.split(" ")[0] || "Your appointment"} is confirmed for ${service.label} on ${displayDate} at ${displayTime}. I've sent a confirmation text to ${customerPhone} with your appointment details and a link to add a card on file for our cancellation policy. We look forward to seeing you at Awaken Zen Spa!`);

  } catch (err) {
    console.error("book-appointment error:", err);
    vapiResponse(res, toolCallId, "I had trouble completing that booking. Let me send you our booking link instead.");
  }
});

// ── Route: Send booking confirmation SMS manually ─────────────────────────────
app.post("/send-booking-confirmation", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const params = extractParams(req.body);
    const phoneNumber = params.phoneNumber || params.phone_number;
    const appointmentDetails = params.appointmentDetails || params.appointment_details;
    await twilioClient.messages.create({
      from: TWILIO_NUMBER,
      to: phoneNumber,
      body: `Hi! Your Awaken Zen Spa appointment is confirmed.\n\n${appointmentDetails}\n\nPlease add a card on file:\n${BOOKING_URL}\n\nQuestions? (602) 688-2578 ✨`
    });
    vapiResponse(res, toolCallId, "Confirmation sent.");
  } catch (err) {
    vapiResponse(res, toolCallId, "Failed to send confirmation.");
  }
});

// ── Route: Vapi Server Message ────────────────────────────────────────────────
app.post("/vapi-message", (req, res) => {
  const msg = req.body?.message;

  if (msg?.type === "assistant-request") {
    const now = new Date();
    const azOptions = { timeZone: "America/Phoenix" };
    const azDate = now.toLocaleDateString("en-US", {
      ...azOptions,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const azTime = now.toLocaleTimeString("en-US", {
      ...azOptions,
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });

    return res.json({
      assistant: {
        firstMessage: `Thank you for calling Awaken Zen Spa, this is Kai — how can I take care of you today?`,
        model: {
          messages: [
            {
              role: "system",
              content: `CURRENT DATE AND TIME (Arizona / America/Phoenix timezone, UTC-7, no DST):
Today is ${azDate}.
Current time is ${azTime}.

Use this to resolve any relative date the caller mentions:
- "tomorrow" = the day after ${azDate}
- "next [weekday]" = the upcoming occurrence of that weekday after today
- "this [weekday]" = the nearest upcoming occurrence
- Never ask the caller what day it is. You always know.`
            }
          ]
        }
      }
    });
  }

  res.json({});
});

// ── Route: Square diagnostic ──────────────────────────────────────────────────
app.get("/square-info", async (req, res) => {
  try {
    const teamRes = await squareRequest("POST", "/team-members/search", {
      query: { filter: { location_ids: [LOCATION_ID], status: "ACTIVE" } }
    });
    res.json({ team: teamRes.team_members?.map(m => ({ name: `${m.given_name} ${m.family_name}`, id: m.id })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SMS AI SYSTEM — Kai text concierge
// ─────────────────────────────────────────────────────────────────────────────

const smsConversations = new Map();
const SMS_MAX_HISTORY = 20;

function getConversation(phone) {
  if (!smsConversations.has(phone)) smsConversations.set(phone, []);
  return smsConversations.get(phone);
}

function addToConversation(phone, role, content) {
  const convo = getConversation(phone);
  convo.push({ role, content });
  if (convo.length > SMS_MAX_HISTORY) convo.splice(0, convo.length - SMS_MAX_HISTORY);
}

async function getUpcomingBookings(phoneNumber) {
  const customerRes = await squareRequest("POST", "/customers/search", {
    query: { filter: { phone_number: { exact: phoneNumber } } }
  });
  if (!customerRes.customers?.length) return [];
  const customerId = customerRes.customers[0].id;
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const bookingsRes = await squareRequest("POST", "/bookings/search", {
    query: {
      filter: {
        location_id: LOCATION_ID,
        customer_id_filter: { customer_ids: [customerId] },
        start_at_range: { start_at: now, end_at: future }
      }
    }
  });
  return bookingsRes.bookings || [];
}

async function cancelBooking(bookingId, version) {
  return squareRequest("POST", `/bookings/${bookingId}/cancel`, {
    booking_version: version,
    idempotency_key: `cancel-${bookingId}-${Date.now()}`
  });
}

function formatBookingForDisplay(booking) {
  const dt = new Date(booking.start_at);
  const date = dt.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric"
  });
  const time = dt.toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit", hour12: true
  });
  return `${date} at ${time}`;
}

function buildSmsSystemPrompt(clientPhone) {
  const now = new Date();
  const azDate = now.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix", weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const azTime = now.toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix", hour: "numeric", minute: "2-digit", hour12: true
  });

  return `You are Kai, the front desk concierge at Awaken Zen Spa in Mesa, Arizona. You are responding via SMS/text message. Keep responses warm, concise, and conversational — this is a text exchange, not a phone call. Use short paragraphs. Never use markdown formatting like ** or ##.

Today is ${azDate}. Current time is ${azTime} Arizona time.

The client's phone number is ${clientPhone}. You can use this to look up their appointments.

BUSINESS DETAILS:
Awaken Zen Spa — 2830 E Brown Rd Suite 10, Mesa AZ 85213
Hours: Daily 8AM-8PM, by appointment only
Phone: (602) 688-2578
Booking: ${BOOKING_URL}

CANCELLATION POLICY:
24 hours notice required. Less than 24 hours = $25 fee. Always mention this when someone wants to cancel.

WHAT YOU CAN DO OVER TEXT:
1. Answer questions about services, pricing, hours, location
2. Check availability and quote open times
3. Help reschedule or cancel appointments
4. Send booking link for new appointments
5. Look up their upcoming appointments

RESCHEDULING FLOW:
When someone wants to reschedule:
1. First acknowledge warmly
2. Ask what service and what new day/time works for them
3. Check availability for that service/day using [CHECK_AVAILABILITY: service|duration|date]
4. Once they pick a time, confirm cancellation of old appointment and booking of new one
5. Use [CANCEL_BOOKING: bookingId|version] to cancel old
6. Use [BOOK_APPOINTMENT: service|duration|isoDateTime|name|phone] to book new
7. Send confirmation

CANCELLATION FLOW:
When someone wants to cancel:
1. Look up their booking using [GET_BOOKINGS]
2. Confirm which appointment they mean
3. Warn about 24-hour policy if applicable
4. Ask them to confirm: "Just to confirm — you'd like to cancel your [service] on [date]?"
5. After confirmation, use [CANCEL_BOOKING: bookingId|version]
6. Confirm cancellation and express hope to see them soon

ACTION COMMANDS (use these in your response when needed):
[GET_BOOKINGS] — look up client's upcoming appointments
[CHECK_AVAILABILITY: serviceKey|duration|date] — check open slots
[BOOK_APPOINTMENT: serviceKey|duration|isoDateTime|customerName|customerPhone] — create booking
[CANCEL_BOOKING: bookingId|version] — cancel a booking
[SEND_BOOKING_LINK] — send the booking link via text

SERVICES (common ones):
swedish/european royalty: 60/90/120 min — $85/$115/$145
deep tissue/muscle mender: 60/90/120 min — $85/$115/$145
lymphatic/spring senses: 60/90/120 min — $85/$115/$145
ashiatsu/sole symphony: 60/90/120 min — $85/$115/$145
hot stone/warm stone: 90/120 min — $130/$170
calm and clear facial: 60/90 min — $85/$115
anti aging/youthful glow facial: 60/90 min — $85/$115
microdermabrasion: 60/90 min — $95/$125
dermaplane: 60/90 min — $100/$130
microneedling: 60 min — $130

TONE:
- Warm and personal, like a trusted front desk person
- Brief — this is text, not email
- Never say "No problem" — say "Of course" or "Absolutely"
- Sign off warmly on first message: "— Kai at Awaken Zen"`;
}

async function processActions(responseText, clientPhone, clientName) {
  let finalText = responseText;
  const actions = [];
  const actionRegex = /\[([A-Z_]+)(?::([^\]]+))?\]/g;
  let match;
  while ((match = actionRegex.exec(responseText)) !== null) {
    actions.push({ full: match[0], name: match[1], args: match[2]?.split("|") || [] });
  }

  for (const action of actions) {
    try {
      let result = "";

      if (action.name === "GET_BOOKINGS") {
        const bookings = await getUpcomingBookings(clientPhone);
        result = bookings.length === 0
          ? "No upcoming appointments found for this number."
          : bookings.map((b, i) => `${i + 1}. ${formatBookingForDisplay(b)} (ID: ${b.id}, v${b.version})`).join("\n");
        finalText = finalText.replace(action.full, `[Bookings found: ${result}]`);
      }

      else if (action.name === "CHECK_AVAILABILITY") {
        const [svcKey, dur, date] = action.args;
        const service = SERVICES[(svcKey || "").toLowerCase().trim()];
        if (service) {
          const variationId = service.variations[dur || "60"];
          if (variationId) {
            const resolved = resolveDate(date || "tomorrow");
            if (resolved) {
              const dateStr = formatDateForSquare(resolved);
              const data = await squareRequest("POST", "/bookings/availability/search", {
                query: {
                  filter: {
                    start_at_range: {
                      start_at: `${dateStr}T08:00:00-07:00`,
                      end_at:   `${dateStr}T19:00:00-07:00`
                    },
                    location_id: LOCATION_ID,
                    segment_filters: [{
                      service_variation_id: variationId,
                      team_member_id_filter: { any: Object.values(TEAM_MEMBERS).map(m => m.id) }
                    }]
                  }
                }
              });
              const slots = data.availabilities || [];
              const uniqueTimes = [...new Set(slots.map(s => formatTimeForDisplay(s.start_at)))].slice(0, 6);
              result = slots.length === 0
                ? "No availability on that day."
                : `Available: ${uniqueTimes.join(", ")}. Slots: ${JSON.stringify(slots.slice(0, 6).map(s => s.start_at))}`;
            }
          }
        }
        finalText = finalText.replace(action.full, `[Availability: ${result}]`);
      }

      else if (action.name === "CANCEL_BOOKING") {
        const [bookingId, version] = action.args;
        const cancelRes = await cancelBooking(bookingId, parseInt(version) || 0);
        if (cancelRes.errors) {
          result = `Error: ${cancelRes.errors[0]?.detail || "Could not cancel"}`;
        } else {
          result = "Booking cancelled successfully.";
          await twilioClient.messages.create({
            from: TWILIO_NUMBER,
            to: OWNER_CELL,
            body: `📋 AZS: Kai cancelled booking ${bookingId} for ${clientPhone} via SMS.`
          });
        }
        finalText = finalText.replace(action.full, `[Cancel result: ${result}]`);
      }

      else if (action.name === "BOOK_APPOINTMENT") {
        const [svcKey, dur, isoDateTime, name, phone] = action.args;
        const service = SERVICES[(svcKey || "").toLowerCase().trim()];
        if (service) {
          const variationId = service.variations[dur || "60"];
          if (variationId) {
            let customerId = null;
            const searchRes = await squareRequest("POST", "/customers/search", {
              query: { filter: { phone_number: { exact: phone || clientPhone } } }
            });
            customerId = searchRes.customers?.[0]?.id;
            if (!customerId) {
              const createRes = await squareRequest("POST", "/customers", {
                given_name: (name || "Guest").split(" ")[0],
                family_name: (name || "").split(" ").slice(1).join(" "),
                phone_number: phone || clientPhone
              });
              customerId = createRes.customer?.id;
            }
            const bookingRes = await squareRequest("POST", "/bookings", {
              booking: {
                location_id: LOCATION_ID,
                start_at: isoDateTime,
                customer_id: customerId,
                customer_note: "Booked via Kai SMS concierge.",
                appointment_segments: [{
                  service_variation_id: variationId,
                  service_variation_version: 0,
                  duration_minutes: parseInt(dur || "60"),
                  team_member_id: TEAM_MEMBERS.brant.id
                }]
              },
              idempotency_key: `sms-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
            });
            if (bookingRes.errors) {
              result = `Error: ${bookingRes.errors[0]?.detail || "Could not book"}`;
            } else {
              const booking = bookingRes.booking;
              result = `Booked! ${service.label} on ${formatBookingForDisplay(booking)}. ID: ${booking.id}`;
            }
          }
        }
        finalText = finalText.replace(action.full, `[Booking result: ${result}]`);
      }

      else if (action.name === "SEND_BOOKING_LINK") {
        await twilioClient.messages.create({
          from: TWILIO_NUMBER,
          to: clientPhone,
          body: `Here's the Awaken Zen Spa booking link:\n${BOOKING_URL}`
        });
        finalText = finalText.replace(action.full, "[Booking link sent]");
      }

    } catch (err) {
      console.error(`SMS action ${action.name} error:`, err.message);
      finalText = finalText.replace(action.full, `[Action failed: ${err.message}]`);
    }
  }

  return finalText;
}

async function getKaiSmsResponse(clientPhone, userMessage, clientName) {
  const history = getConversation(clientPhone);
  const messages = [...history, { role: "user", content: userMessage }];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: buildSmsSystemPrompt(clientPhone),
      messages
    })
  });

  const data = await response.json();
  return data.content?.[0]?.text || "I'm sorry, I had trouble with that. Please call us at (602) 688-2578.";
}

// ── Route: Incoming SMS ───────────────────────────────────────────────────────
app.post("/incoming-sms", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();

  try {
    const incomingMsg = req.body.Body?.trim();
    const clientPhone = req.body.From;
    const clientName  = req.body.FromCity || "";

    if (!incomingMsg || !clientPhone) {
      twiml.message("Hi! You've reached Awaken Zen Spa. How can Kai help you today?");
      return res.type("text/xml").send(twiml.toString());
    }

    console.log(`SMS from ${clientPhone}: ${incomingMsg}`);
    addToConversation(clientPhone, "user", incomingMsg);

    let aiResponse = await getKaiSmsResponse(clientPhone, incomingMsg, clientName);
    aiResponse = await processActions(aiResponse, clientPhone, clientName);

    if (aiResponse.includes("[Bookings found:") || aiResponse.includes("[Availability:") ||
        aiResponse.includes("[Cancel result:")  || aiResponse.includes("[Booking result:")) {

      addToConversation(clientPhone, "assistant", aiResponse);
      addToConversation(clientPhone, "user", "Based on the above action results, please respond naturally to the client without showing the raw action output.");

      let finalResponse = await getKaiSmsResponse(clientPhone, "Based on the action results above, give the client a natural, warm response.", clientName);
      finalResponse = finalResponse.replace(/\[[A-Z_]+(?::[^\]]+)?\]/g, "").trim();
      addToConversation(clientPhone, "assistant", finalResponse);
      twiml.message(finalResponse);
    } else {
      const cleanResponse = aiResponse.replace(/\[[A-Z_]+(?::[^\]]+)?\]/g, "").trim();
      addToConversation(clientPhone, "assistant", cleanResponse);
      twiml.message(cleanResponse);
    }

  } catch (err) {
    console.error("SMS error:", err);
    twiml.message("Hi! This is Awaken Zen Spa. We're having a moment — please call us at (602) 688-2578 or visit awakenzenspa.com/booking. Sorry for the inconvenience!");
  }

  res.type("text/xml").send(twiml.toString());
});

// ─────────────────────────────────────────────────────────────────────────────
// FLASH FILL — Routes
// ─────────────────────────────────────────────────────────────────────────────

// Manual trigger — staff portal "Sync Members" button
app.post("/flash-fill/sync-members", async (req, res) => {
  const token = req.headers["x-staff-token"];
  if (token !== process.env.STAFF_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await runMemberSync();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Manual sync error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual trigger — import all Square customers into clients table
app.post("/flash-fill/import-customers", async (req, res) => {
  const token = req.headers["x-staff-token"];
  if (token !== process.env.STAFF_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const log = makeSyncLogger();
    log.info("=== Square Customer Import Started ===");

    // Fetch all customers from Square (paginated via POST search)
    const customers = [];
    let cursor = null;
    do {
      const body = { limit: 100 };
      if (cursor) body.cursor = cursor;
      const sqRes = await fetch(`${SQUARE_BASE}/customers/search`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SQUARE_TOKEN}`, "Square-Version": SQUARE_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!sqRes.ok) throw new Error(`Square API ${sqRes.status}: ${await sqRes.text()}`);
      const data = await sqRes.json();
      (data.customers || []).forEach(c => customers.push(c));
      cursor = data.cursor || null;
      log.info(`  Fetched batch of ${data.customers?.length || 0} (total: ${customers.length})`);
    } while (cursor);

    // Get existing square_customer_ids
    const { data: existing } = await supabase.from("clients").select("square_customer_id").not("square_customer_id", "is", null);
    const existingIds = new Set((existing || []).map(c => c.square_customer_id));
    log.info(`${existingIds.size} already in Supabase, ${customers.length - existingIds.size} new`);

    // Map and insert new customers in chunks
    const newCustomers = customers.filter(c => !existingIds.has(c.id));
    const rows = newCustomers.map(c => {
      if (!c.given_name && !c.company_name) return null;
      const rawPhone = c.phone_number || null;
      const digits = rawPhone ? rawPhone.replace(/\D/g, "") : null;
      const phone = digits ? (digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : rawPhone) : null;
      return {
        square_customer_id: c.id,
        first_name: (c.given_name || c.company_name || "").trim(),
        last_name: (c.family_name || "").trim() || null,
        email: c.email_address?.trim()?.toLowerCase() || null,
        phone,
        therapist_notes: c.note?.trim() || null,
        created_at: c.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }).filter(Boolean);

    let imported = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from("clients").insert(chunk, { returning: "minimal" });
      if (error) log.warn(`Chunk error: ${error.message}`);
      else imported += chunk.length;
    }

    log.info(`Import complete: ${imported} imported, ${existingIds.size} skipped`);
    res.json({ success: true, imported, skipped: existingIds.size, total: customers.length, log: log.entries });
  } catch (err) {
    console.error("Customer import error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// END FLASH FILL — Routes
// ─────────────────────────────────────────────────────────────────────────────

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Awaken Zen Spa — Kai webhook active."));

// ── Catch-all POST for Vapi webhook events ────────────────────────────────────
app.post("/", (req, res) => res.json({ received: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kai webhook running on port ${PORT}`));
