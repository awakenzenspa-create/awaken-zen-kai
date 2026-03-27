// ─────────────────────────────────────────────────────────────────────────────
// Awaken Zen Spa — Kai Webhook Server
// Full build: time routing, SMS tools, Square availability + booking
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const twilio  = require("twilio");

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

const VoiceResponse = twilio.twiml.VoiceResponse;
const twilioClient  = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
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
// Format: serviceName -> { "60": variationId, "90": variationId, "120": variationId }
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

// ── Format date helper ────────────────────────────────────────────────────────
// Accepts: "thursday", "tomorrow", "next monday", "march 28", "3/28"
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

  // Try parsing as a date string
  const parsed = new Date(input);
  if (!isNaN(parsed)) return parsed;

  return null;
}

function formatDateForSquare(date) {
  return date.toISOString().split("T")[0]; // YYYY-MM-DD
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
  return total >= 480 && total < 570; // 8:00–9:30 AM
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

// ── Helper: extract tool parameters and toolCallId from Vapi's payload ───────
function extractParams(body) {
  // Direct params (simple tool call)
  if (body.phoneNumber || body.serviceKey || body.date) return body;
  // Nested in message.toolCallList[0].function.arguments
  try {
    const args = body?.message?.toolCallList?.[0]?.function?.arguments;
    if (args) return typeof args === "string" ? JSON.parse(args) : args;
  } catch (e) {}
  // Nested in message.toolCalls[0].function.arguments
  try {
    const args = body?.message?.toolCalls?.[0]?.function?.arguments;
    if (args) return typeof args === "string" ? JSON.parse(args) : args;
  } catch (e) {}
  // Nested in message.functionCall.parameters
  try {
    const params = body?.message?.functionCall?.parameters;
    if (params) return typeof params === "string" ? JSON.parse(params) : params;
  } catch (e) {}
  return body;
}

// ── Helper: extract toolCallId from Vapi's payload ────────────────────────────
function extractToolCallId(body) {
  return body?.message?.toolCallList?.[0]?.id ||
         body?.message?.toolCalls?.[0]?.id ||
         body?.message?.functionCall?.id ||
         body?.toolCallId ||
         "unknown";
}

// ── Helper: format response for Vapi ─────────────────────────────────────────
// Vapi requires: { results: [{ toolCallId: "...", result: "single-line string" }] }
function vapiResponse(res, toolCallId, resultText) {
  const singleLine = String(resultText).replace(/\n/g, " ").replace(/\r/g, "");
  res.json({
    results: [{ toolCallId, result: singleLine }]
  });
}

// ── Route: Send Booking Link ──────────────────────────────────────────────────
app.post("/send-booking-link", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const params = extractParams(req.body);
    const phoneNumber = params.phoneNumber || params.phone_number || params.to;
    if (!phoneNumber) {
      console.log("sendBookingLink — no phone number. Body:", JSON.stringify(req.body).slice(0, 300));
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

    // Create or find customer
    let customerId = null;
    if (customerPhone || customerEmail) {
      const searchRes = await squareRequest("POST", "/customers/search", {
        query: {
          filter: {
            phone_number: { exact: customerPhone }
          }
        }
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

    // Create booking
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

    // Send confirmation SMS with card-on-file link
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

// ── Route: Vapi Server Message — injects current date/time at call start ──────
// In Vapi: Assistant → Advanced → Server Messages → enable "assistant-request"
// Server URL: https://nodejs-production-2820.up.railway.app/vapi-message
app.post("/vapi-message", (req, res) => {
  const msg = req.body?.message;

  // Fires at the start of every call — inject current Arizona date into system prompt
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

  // For all other message types just acknowledge
  res.json({});
});

// ── Route: Square diagnostic (can remove after setup) ────────────────────────
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

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Awaken Zen Spa — Kai webhook active."));

// ── Catch-all POST for Vapi webhook events (status, speech, etc.) ─────────────
app.post("/", (req, res) => {
  // Vapi sends many event types to the server URL — just acknowledge them all
  res.json({ received: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kai webhook running on port ${PORT}`));
