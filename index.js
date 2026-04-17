// ─────────────────────────────────────────────────────────────────────────────
// Awaken Zen Spa — Kai Webhook Server
// Full build: time routing, SMS tools, Square availability + booking
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const twilio  = require("twilio");
const path    = require("path");
const https   = require("https");
const http    = require("http");
const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase  = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false, limit: "10mb" }));

// ── CORS for flash-fill routes (staff portal cross-origin requests) ─────────
app.use("/flash-fill", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-staff-token");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── CORS for social-flash routes ─────────────────────────────────────────────
app.use("/social-flash", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, x-staff-token, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Static: serve rendered social images so Meta can curl them ───────────────
app.use(
  "/social-flash/images",
  express.static(path.join(__dirname, "public", "social-images"))
);

const VoiceResponse = twilio.twiml.VoiceResponse;
const twilioClient  = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const TWILIO_NUMBER   = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_MSG_SVC  = process.env.TWILIO_MESSAGING_SERVICE_SID || "MG85a61647a288e50f86d21f447a498f8a";
const VAPI_NUMBER     = process.env.VAPI_PHONE_NUMBER;
const OWNER_CELL      = "+16232196907";
const BOOKING_URL     = "https://awakenzenspa.com/booking";
const GIFT_CARD_URL   = "https://awakenzenspa.com/gift-cards";
const LOCATION_ID     = "TMRQ3D20EFD1X";
const SQUARE_TOKEN    = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_BASE     = "https://connect.squareup.com/v2";
const SQUARE_VERSION  = "2024-01-18";
const SITE_URL        = process.env.SITE_URL   || "https://awakenzenspa.com";
const CRON_SECRET     = process.env.CRON_SECRET || "";

// ── Team Members ──────────────────────────────────────────────────────────────
const TEAM_MEMBERS = {
  brant:   { id: "OVUiDLRyxkDxB12f_8w9", name: "Brant" },
  trevor:  { id: "TMvKNbcHqsI4aECK",     name: "Trevor" }
};

// ── Service Variation IDs for bookable services ───────────────────────────────
const SERVICES = {
  // ── SWEDISH / RELAXATION ──────────────────────────────────────────────────
  "european royalty": { label: "European Royalty: Classic Swedish", variations: { "60":"TIB77G2AIP7GABDSWZFXN6FF","90":"QAVQO7BGDYOVEI65CWUCOWY7","120":"W7KH4DISA5C7BQMNED2OIGKM" } },
  "swedish":          { label: "European Royalty: Classic Swedish", variations: { "60":"TIB77G2AIP7GABDSWZFXN6FF","90":"QAVQO7BGDYOVEI65CWUCOWY7","120":"W7KH4DISA5C7BQMNED2OIGKM" } },

  // ── DEEP TISSUE ───────────────────────────────────────────────────────────
  "muscle mender":    { label: "Muscle Mender: Deep Tissue", variations: { "60":"BIWQQPHXSAC25JHMLKEIYVVV","90":"F4D4WJDBUV6VPW3NZ5WUPAWA","120":"XP5NCMNL7ZSPKK44GFN46BW3" } },
  "deep tissue":      { label: "Muscle Mender: Deep Tissue", variations: { "60":"BIWQQPHXSAC25JHMLKEIYVVV","90":"F4D4WJDBUV6VPW3NZ5WUPAWA","120":"XP5NCMNL7ZSPKK44GFN46BW3" } },

  // ── SHIATSU / TUINA ───────────────────────────────────────────────────────
  "shiatsu":          { label: "Eastern Harmony: Shiatsu & Tuina", variations: { "60":"QRVM73MP3TPGM4IFJ47I7B3W","90":"NI74FXF72PRLKZF6W5KHCR7S","120":"6TO5OY53LGNJYGYDMA4T6L2U" } },
  "eastern harmony":  { label: "Eastern Harmony: Shiatsu & Tuina", variations: { "60":"QRVM73MP3TPGM4IFJ47I7B3W","90":"NI74FXF72PRLKZF6W5KHCR7S","120":"6TO5OY53LGNJYGYDMA4T6L2U" } },
  "tuina":            { label: "Eastern Harmony: Shiatsu & Tuina", variations: { "60":"QRVM73MP3TPGM4IFJ47I7B3W","90":"NI74FXF72PRLKZF6W5KHCR7S","120":"6TO5OY53LGNJYGYDMA4T6L2U" } },

  // ── THAI MASSAGE ─────────────────────────────────────────────────────────
  "thai":             { label: "Siam Serenity: Classic Thai Massage", variations: { "60":"IEIDIRFVYPSQGY3GEDEZKVRX","90":"OZLVEP7YLLOAXKXXLMV7SOJA","120":"IL2P4A5MRVHZG3OYP7632EJU" } },
  "siam serenity":    { label: "Siam Serenity: Classic Thai Massage", variations: { "60":"IEIDIRFVYPSQGY3GEDEZKVRX","90":"OZLVEP7YLLOAXKXXLMV7SOJA","120":"IL2P4A5MRVHZG3OYP7632EJU" } },
  "thai massage":     { label: "Siam Serenity: Classic Thai Massage", variations: { "60":"IEIDIRFVYPSQGY3GEDEZKVRX","90":"OZLVEP7YLLOAXKXXLMV7SOJA","120":"IL2P4A5MRVHZG3OYP7632EJU" } },

  // ── ASSISTED STRETCHING ───────────────────────────────────────────────────
  "stretching":       { label: "Flex & Flow: Assisted Stretching", variations: { "60":"6OJZSUSZ74MTWUIGPBDLVQSP","90":"WPPWDDRJABDAM2FIVFW4GRQB","120":"SO7XPJBMSTISOEUTQV4VGDBW" } },
  "flex and flow":    { label: "Flex & Flow: Assisted Stretching", variations: { "60":"6OJZSUSZ74MTWUIGPBDLVQSP","90":"WPPWDDRJABDAM2FIVFW4GRQB","120":"SO7XPJBMSTISOEUTQV4VGDBW" } },
  "flex flow":        { label: "Flex & Flow: Assisted Stretching", variations: { "60":"6OJZSUSZ74MTWUIGPBDLVQSP","90":"WPPWDDRJABDAM2FIVFW4GRQB","120":"SO7XPJBMSTISOEUTQV4VGDBW" } },

  // ── ASHIATSU ──────────────────────────────────────────────────────────────
  "sole symphony":    { label: "Sole Symphony: Ashiatsu Barefoot Massage", variations: { "60":"P347T32CDIANCUFTNRFR573O","90":"Q5RG75PJSA432POINYAKY24A","120":"73Z3KGC536LSV32TXW6XP4AW" } },
  "ashiatsu":         { label: "Sole Symphony: Ashiatsu Barefoot Massage", variations: { "60":"P347T32CDIANCUFTNRFR573O","90":"Q5RG75PJSA432POINYAKY24A","120":"73Z3KGC536LSV32TXW6XP4AW" } },

  // ── ZEN MEND ─────────────────────────────────────────────────────────────
  "zen mend":         { label: "Zen Mend: Injury & Problem Focused", variations: { "60":"PMBP2MICUCXV7H3XGHFIEVPG","90":"G3CPUXWTQ3TI4EBNLPDDNDHQ","120":"GKC4T6MPO2BRL3LDQHL6Z5PH" } },
  "injury massage":   { label: "Zen Mend: Injury & Problem Focused", variations: { "60":"PMBP2MICUCXV7H3XGHFIEVPG","90":"G3CPUXWTQ3TI4EBNLPDDNDHQ","120":"GKC4T6MPO2BRL3LDQHL6Z5PH" } },

  // ── LOMI LOMI ────────────────────────────────────────────────────────────
  "lomi lomi":        { label: "Hakuna Hawaii: Lomi Lomi Massage", variations: { "60":"N3BPNN2GCWWYWW3ARDWCZZ2Z","90":"NBE4XVSEH6HWFO4KASXNF2TZ","120":"CDMTSDB4FTO23EQS4O26E5ZG" } },
  "hakuna hawaii":    { label: "Hakuna Hawaii: Lomi Lomi Massage", variations: { "60":"N3BPNN2GCWWYWW3ARDWCZZ2Z","90":"NBE4XVSEH6HWFO4KASXNF2TZ","120":"CDMTSDB4FTO23EQS4O26E5ZG" } },
  "hawaiian massage": { label: "Hakuna Hawaii: Lomi Lomi Massage", variations: { "60":"N3BPNN2GCWWYWW3ARDWCZZ2Z","90":"NBE4XVSEH6HWFO4KASXNF2TZ","120":"CDMTSDB4FTO23EQS4O26E5ZG" } },

  // ── BLISSFUL SLUMBER ─────────────────────────────────────────────────────
  "blissful slumber": { label: "Blissful Slumber: Tranquil Dream Therapy", variations: { "60":"WWWM6R2XIC32UCNWZYITGPTP","90":"IKSBJBHA7HNKOEICJ26VENLW","120":"I7MFRKOXE66OW4SXG5L26ABU" } },
  "dream therapy":    { label: "Blissful Slumber: Tranquil Dream Therapy", variations: { "60":"WWWM6R2XIC32UCNWZYITGPTP","90":"IKSBJBHA7HNKOEICJ26VENLW","120":"I7MFRKOXE66OW4SXG5L26ABU" } },

  // ── LYMPHATIC ────────────────────────────────────────────────────────────
  "spring senses":    { label: "Spring Senses: Lymphatic Drainage", variations: { "60":"K2W6NJ6KSTSVZWPKE3L7WIWD","90":"TIQJY3TSW6ZWJ27X2ENK2LKF","120":"6VULYOQRLLMEWRZBM5DEWVQE" } },
  "lymphatic":        { label: "Spring Senses: Lymphatic Drainage", variations: { "60":"K2W6NJ6KSTSVZWPKE3L7WIWD","90":"TIQJY3TSW6ZWJ27X2ENK2LKF","120":"6VULYOQRLLMEWRZBM5DEWVQE" } },

  // ── HOT STONE ────────────────────────────────────────────────────────────
  "warm stone":       { label: "Warm Stone Retreat", variations: { "90":"6XAXNAZIE3MDEZBLB3GD5UYU","120":"K7XIEBQ2DTYB4YF5TCHLNMXJ" } },
  "hot stone":        { label: "Warm Stone Retreat", variations: { "90":"6XAXNAZIE3MDEZBLB3GD5UYU","120":"K7XIEBQ2DTYB4YF5TCHLNMXJ" } },

  // ── SPECIAL BODY ─────────────────────────────────────────────────────────
  "cupping":          { label: "Restorative Cupping Experience", variations: { "90":"LJSAWYLX3FS74TTGPCUZR6Y2","120":"BDNNHYJOSKLHBLIHA4KYHEQ6" } },
  "wood sculpt":      { label: "Wood Sculpt Body Bliss", variations: { "90":"PSYGTY4YX6SI5KOM7IPPBECQ" } },
  "sound bowl":       { label: "Flowing Sound Bowl Experience", variations: { "90":"KBOKT2637R2TUKE3NXGEZHF3","120":"N63Y4LXB4JQ6W6YMGSPAV56X" } },
  "hot cold":         { label: "Hot and Cold Body Relief", variations: { "90":"GUMXTMQH6WDJK65H6QPOEXQQ" } },
  "luxury spa":       { label: "Luxury Spa Experience", variations: { "120":"TIC4IYJZHISU4ZCBHZIYKTUT" } },
  "head scalp":       { label: "Radiant Head & Scalp Experience", variations: { "120":"ZQQHCBPQNW2HCHKYW7HQ3VWX" } },
  "radiant head":     { label: "Radiant Head & Scalp Experience", variations: { "120":"ZQQHCBPQNW2HCHKYW7HQ3VWX" } },
  "pregnancy":        { label: "Pregnancy Massage", variations: { "60":"DB7UZCLRCRBATKQ3IXUNYZVE","90":"JULOSEYZYI7WG2VNGNSILO7P" } },

  // ── FACIALS ───────────────────────────────────────────────────────────────
  "calm and clear":    { label: "Calm and Clear: Relaxation Facial", variations: { "60":"HAAWAKV7TD7L6OD27CNZ2A33","90":"UUNTT5FDE6MYNJGEMLEB7STI" } },
  "relaxation facial": { label: "Calm and Clear: Relaxation Facial", variations: { "60":"HAAWAKV7TD7L6OD27CNZ2A33","90":"UUNTT5FDE6MYNJGEMLEB7STI" } },
  "derm renew":        { label: "Derm-Renew: Deep Cleansing Facial", variations: { "60":"UOS7AIXM6ERKPL4ZASOXSJIX","90":"OARGO2BE4MUNMGU3F33CA3JX" } },
  "deep cleansing":    { label: "Derm-Renew: Deep Cleansing Facial", variations: { "60":"UOS7AIXM6ERKPL4ZASOXSJIX","90":"OARGO2BE4MUNMGU3F33CA3JX" } },
  "hydro refresh":     { label: "Hydro Refresh: Deep Hydration Facial", variations: { "60":"YRDVMESJV6BFOKQPGR22OK5O","90":"EATHH5MRZCDEILNWGLJPMDFM" } },
  "hydration facial":  { label: "Hydro Refresh: Deep Hydration Facial", variations: { "60":"YRDVMESJV6BFOKQPGR22OK5O","90":"EATHH5MRZCDEILNWGLJPMDFM" } },
  "youthful glow":     { label: "Youthful Glow: Anti-Aging Facial", variations: { "60":"LAEOGJ23JVQGXQ2SD4UWECJV","90":"33L2RRNH6UCPWLUTEZFRHTEM" } },
  "anti aging":        { label: "Youthful Glow: Anti-Aging Facial", variations: { "60":"LAEOGJ23JVQGXQ2SD4UWECJV","90":"33L2RRNH6UCPWLUTEZFRHTEM" } },
  "thermal vitality":  { label: "Thermal Vitality: Zen Glow Facial", variations: { "60":"PAQPHP2D6TAOO3CJ7CU5E5QE","90":"KE23O6OICRLL56PKMWJNZGTU" } },
  "glow facial":       { label: "Thermal Vitality: Zen Glow Facial", variations: { "60":"PAQPHP2D6TAOO3CJ7CU5E5QE","90":"KE23O6OICRLL56PKMWJNZGTU" } },
  "back facial":       { label: "Clear Back Revive: Back Facial", variations: { "60":"ZPGHOXIVQJ7LCFKQ76CZPSGN" } },
  "teen facial":       { label: "AZS Teen Facial", variations: { "45":"3B44VH333QX5FSXMQQMWOGVG" } },
  "mens facial":       { label: "Men's Facial", variations: { "60":"UOS7AIXM6ERKPL4ZASOXSJIX" } },

  // ── SPECIAL FACIAL TREATMENTS ────────────────────────────────────────────
  "microdermabrasion": { label: "Micro-Dermabrasion Treatment", variations: { "60":"4LWHUA7X53NZFBT3FB54J272","90":"SYT7F6KBIPDXRN5KFXCKWE5U" } },
  "microderm":         { label: "Micro-Dermabrasion Treatment", variations: { "60":"4LWHUA7X53NZFBT3FB54J272","90":"SYT7F6KBIPDXRN5KFXCKWE5U" } },
  "dermaplane":        { label: "Dermaplane Treatment", variations: { "60":"DQVFGWUDTDG3ID5VDHD2FORT","90":"EG3TALRSZNFYB6FIURQ6URS6" } },
  "jelly mask":        { label: "Jelly Mask Treatment", variations: { "60":"LHXGL7H5DXSRD2RNXRKS6NVF","90":"35XEYOKDGPPQMLGFZDCEHXKR" } },
  "radio frequency":   { label: "Radio-Frequency Treatment", variations: { "60":"NHS7WFYMN4BMKYG32YTDFADK","90":"XUJMPZYEKTCFX7V7A2EUYPDS" } },
  "galvanic":          { label: "Galvanic Frequency Treatment", variations: { "60":"LCA4GDPYHFHWD2CUKJDCBR34","90":"67X6E7D7X2IRR243GMG47SJI" } },
  "microcurrent":      { label: "Micro-Current Treatment", variations: { "60":"34ITCQOIPLCNQY3F4OR6VAT2" } },
  "nano tech":         { label: "Nano-Tech Treatment", variations: { "60":"3XES27A5JN6IWGL3KOGSLXKW" } },
  "microneedling":     { label: "Micro-Needling Treatment", variations: { "60":"3DYWCG6NEV3PBAUXHMNYWT4V" } },

  // ── WAXING & BROW ────────────────────────────────────────────────────────
  "waxing brows":      { label: "Waxing - Brows", variations: { "20":"KXXXZFA5YVEKGKFEF2I2PWUZ" } },
  "brow tint":         { label: "Brow Tint", variations: { "15":"KP4LPKGVQAQ3ZLOY5QQP2XOL" } },
  "waxing lip":        { label: "Waxing - Lip & Chin", variations: { "15":"CPBUQUO4JTD24G5ULN2AE7WW" } },
  "full face wax":     { label: "Full Face Wax", variations: { "30":"ILEAGQTQEJMAP7KJH527CHUA" } },
  "brow lamination":   { label: "Brow Lamination", variations: { "45":"UMOB6VGE2XHHMX3S3AYVG4SX" } },
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

// Normalize service key — handle hyphens, underscores, camelCase from Claude
function normalizeServiceKey(key) {
  if (!key) return "";
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")  // camelCase → spaced
    .replace(/[-_]+/g, " ")                // hyphens/underscores → space
    .toLowerCase()
    .trim();
}

function lookupService(key) {
  return SERVICES[normalizeServiceKey(key)] || null;
}

// Ensure ISO datetime has AZ timezone offset — Square rejects naive datetimes
function ensureAzTimezone(iso) {
  if (!iso) return iso;
  const s = String(iso).trim();
  // Already has offset or Z
  if (/[Zz]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) return s;
  // Has date and time but no offset — append AZ offset
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return `${s}-07:00`;
  return s;
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
      messagingServiceSid: TWILIO_MSG_SVC,
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
      messagingServiceSid: TWILIO_MSG_SVC,
      to: phoneNumber,
      body: `Hi, it's Awaken Zen Spa! Gift cards available here:\n\n${GIFT_CARD_URL}\n\nA beautiful gift ✨`
    });
    vapiResponse(res, toolCallId, "Gift card link sent successfully.");
  } catch (err) {
    console.error("sendGiftCardLink error:", err.message);
    vapiResponse(res, toolCallId, "Failed to send gift card link.");
  }
});

// ── Slot filtering: prefer on-the-hour, cap at 3, drop :15/:45 intervals ──────
function filterSlots(slots) {
  // Prefer on-the-hour slots only (drop :15 and :45)
  const hourSlots = slots.filter(s => {
    const azMin = new Date(new Date(s.start_at).getTime() - 7 * 60 * 60 * 1000).getUTCMinutes();
    return azMin === 0;
  });
  // Fall back to :00 or :30 if we don't have enough on-the-hour slots
  const halfSlots = slots.filter(s => {
    const azMin = new Date(new Date(s.start_at).getTime() - 7 * 60 * 60 * 1000).getUTCMinutes();
    return azMin === 0 || azMin === 30;
  });
  const pool = hourSlots.length >= 2 ? hourSlots : (halfSlots.length > 0 ? halfSlots : slots);
  return [...new Set(pool.map(s => formatTimeForDisplay(s.start_at)))].slice(0, 3);
}

// ── Route: Check Availability ─────────────────────────────────────────────────
app.post("/check-availability", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const params = extractParams(req.body);
    const { serviceKey, duration, date, facialKey } = params;

    const service = lookupService(serviceKey);
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
    const dateDisplay = resolved.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    // ── Combo: massage + facial ───────────────────────────────────────────────
    const isCombo = !!(facialKey && facialKey.trim());
    let segmentFilters, endAt, serviceLabel;

    if (isCombo) {
      const facialSvc = lookupService(facialKey);
      if (!facialSvc) return vapiResponse(res, toolCallId, "I wasn't able to find that facial. Could you clarify?");
      const facialVariationId = facialSvc.variations["60"];
      if (!facialVariationId) return vapiResponse(res, toolCallId, `${facialSvc.label} isn't available in a 60-minute session.`);

      // Last safe start = close (8 PM) - massage dur - 60 min facial
      const lastStartMin = 20 * 60 - parseInt(dur) - 60;
      const lsHour = String(Math.floor(lastStartMin / 60)).padStart(2, "0");
      const lsMin  = String(lastStartMin % 60).padStart(2, "0");
      endAt = `${dateStr}T${lsHour}:${lsMin}:00-07:00`;

      segmentFilters = [
        { service_variation_id: variationId,       team_member_id_filter: { any: [TEAM_MEMBERS.brant.id]  } },
        { service_variation_id: facialVariationId, team_member_id_filter: { any: [TEAM_MEMBERS.trevor.id] } }
      ];
      serviceLabel = `${service.label} + ${facialSvc.label}`;
    } else {
      endAt = `${dateStr}T19:00:00-07:00`;
      segmentFilters = [
        { service_variation_id: variationId, team_member_id_filter: { any: Object.values(TEAM_MEMBERS).map(m => m.id) } }
      ];
      serviceLabel = service.label;
    }

    const data = await squareRequest("POST", "/bookings/availability/search", {
      query: {
        filter: {
          start_at_range: { start_at: `${dateStr}T08:00:00-07:00`, end_at: endAt },
          location_id: LOCATION_ID,
          segment_filters: segmentFilters
        }
      }
    });

    const slots = data.availabilities || [];
    if (slots.length === 0) {
      return vapiResponse(res, toolCallId, `We don't have any openings for ${serviceLabel} on that day. Would you like to try a different day?`);
    }

    const uniqueTimes = filterSlots(slots);
    const timeList = uniqueTimes.join(", ");

    vapiResponse(res, toolCallId, `For ${serviceLabel} (${isCombo ? `${dur} min massage + 60 min facial` : `${dur} min`}) on ${dateDisplay}, we have: ${timeList}. Which works best for you?`);

  } catch (err) {
    console.error("check-availability error:", err);
    vapiResponse(res, toolCallId, "I had trouble checking availability. Would you like me to send you our booking link instead?");
  }
});

// ── Route: Book Appointment ───────────────────────────────────────────────────
app.post("/book-appointment", async (req, res) => {
  const toolCallId = extractToolCallId(req.body);
  try {
    const { serviceKey, duration, startAt, customerName, customerPhone, customerEmail, facialKey } = extractParams(req.body);

    const service = lookupService(serviceKey);
    if (!service) return vapiResponse(res, toolCallId, "Service not found.");

    const dur = String(duration || "60");
    const variationId = service.variations[dur];
    if (!variationId) return vapiResponse(res, toolCallId, "Duration not available for this service.");

    // ── Combo: resolve facial service if provided ─────────────────────────────
    const isCombo = !!(facialKey && facialKey.trim());
    let facialSvc = null, facialVariationId = null;
    if (isCombo) {
      facialSvc = lookupService(facialKey);
      if (!facialSvc) return vapiResponse(res, toolCallId, "Facial service not found.");
      facialVariationId = facialSvc.variations["60"];
      if (!facialVariationId) return vapiResponse(res, toolCallId, "That facial isn't available in a 60-minute session.");
    }

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

    // ── Build appointment segments ─────────────────────────────────────────────
    const appointmentSegments = [
      {
        service_variation_id: variationId,
        service_variation_version: 0,
        duration_minutes: parseInt(dur),
        team_member_id: TEAM_MEMBERS.brant.id
      }
    ];
    if (isCombo) {
      appointmentSegments.push({
        service_variation_id: facialVariationId,
        service_variation_version: 0,
        duration_minutes: 60,
        team_member_id: TEAM_MEMBERS.trevor.id
      });
    }

    const serviceLabel = isCombo ? `${service.label} + ${facialSvc.label}` : service.label;

    // Create booking
    const bookingRes = await squareRequest("POST", "/bookings", {
      booking: {
        location_id: LOCATION_ID,
        start_at: ensureAzTimezone(startAt),
        customer_id: customerId,
        customer_note: `Booked via Kai AI phone concierge. Card on file required per cancellation policy.`,
        appointment_segments: appointmentSegments
      },
      idempotency_key: `kai-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
    });

    // Success = Square returned a booking object; errors field alone is not definitive
    const booking = bookingRes.booking;
    if (!booking) {
      console.error("Booking error:", bookingRes.errors);
      return vapiResponse(res, toolCallId, "I wasn't able to complete that booking — please use our booking page at awakenzenspa.com/booking or I can send you the link.");
    }
    const displayTime = formatTimeForDisplay(booking.start_at);
    const displayDate = new Date(booking.start_at).toLocaleDateString("en-US", {
      timeZone: "America/Phoenix",
      weekday: "long",
      month: "long",
      day: "numeric"
    });
    const firstName = customerName?.split(" ")[0] || "there";

    // ── Send "complete your booking" SMS — own try/catch so it never breaks Kai's response
    if (customerPhone) {
      try {
        const saveCardUrl = `${SITE_URL}/save-card.html` +
          `?cid=${encodeURIComponent(customerId || "")}` +
          `&bid=${encodeURIComponent(booking.id)}` +
          `&svc=${encodeURIComponent(serviceLabel)}` +
          `&date=${encodeURIComponent(displayDate)}` +
          `&time=${encodeURIComponent(displayTime)}`;

        await twilioClient.messages.create({
          messagingServiceSid: TWILIO_MSG_SVC,
          to: customerPhone,
          body: `Hi ${firstName}! We've reserved your spot at Awaken Zen Spa.\n\n` +
                `📅 ${serviceLabel}\n` +
                `🕐 ${displayDate} at ${displayTime}\n` +
                `📍 2830 E Brown Rd, Suite 10, Mesa AZ\n\n` +
                `One last step — tap the link below to save a card on file (required by our cancellation policy) and you'll be all set:\n\n` +
                `${saveCardUrl}\n\n` +
                `Questions? Call or text (602) 688-2578 ✨`
        });
        console.log(`[book-appointment] Save-card SMS sent to ${customerPhone} for booking ${booking.id}`);
      } catch (smsErr) {
        // SMS failure is non-fatal — booking is confirmed in Square
        console.error("[book-appointment] SMS send failed:", smsErr.message);
      }
    }

    // Notify owner
    try {
      await twilioClient.messages.create({
        messagingServiceSid: TWILIO_MSG_SVC,
        to: OWNER_CELL,
        body: `📋 AZS: Kai booked ${serviceLabel} for ${customerName} on ${displayDate} at ${displayTime}. Booking ID: ${booking.id}. Awaiting card on file.`
      });
    } catch (e) { /* non-fatal */ }

    vapiResponse(res, toolCallId, `We've got you reserved! ${firstName}, your ${serviceLabel} is held for ${displayDate} at ${displayTime}. I just sent you a text with a link to save a card on file — that's the last step to lock it in. Once that's done you'll get a confirmation. We look forward to seeing you at Awaken Zen Spa!`);

  } catch (err) {
    console.error("book-appointment error:", err);
    vapiResponse(res, toolCallId, "I had trouble reserving that appointment. Let me send you our booking link instead.");
  }
});

// ── Route: Confirm Booking — called by Netlify after card is saved ────────────
// Netlify functions (complete-booking.js, square-book.js) POST here once Square
// booking + card-on-file are both confirmed.  Railway sends the final SMS.
app.post("/confirm-booking", async (req, res) => {
  // Verify shared secret
  const incomingSecret = req.headers["x-cron-token"] || "";
  if (CRON_SECRET && incomingSecret !== CRON_SECRET) {
    console.warn("[confirm-booking] Unauthorized — bad token");
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      squareBookingId,
      squareCustomerId,
      serviceName,
      durationMins,
      startAt,
      therapist,
      bookedSource,
      customer = {}
    } = req.body;

    const { firstName, lastName, phone, email, contactPreference } = customer;
    const customerPhone = phone || null;
    const customerName  = [firstName, lastName].filter(Boolean).join(" ") || "there";
    const firstNameOnly = firstName || "there";

    // Format date/time for display
    const startDate = new Date(startAt);
    const displayTime = startDate.toLocaleTimeString("en-US", {
      timeZone: "America/Phoenix",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
    const displayDate = startDate.toLocaleDateString("en-US", {
      timeZone: "America/Phoenix",
      weekday: "long",
      month: "long",
      day: "numeric"
    });

    console.log(`[confirm-booking] Sending confirmation for booking ${squareBookingId} — ${customerName} — ${serviceName} ${displayDate} ${displayTime}`);

    // Send confirmation SMS
    if (customerPhone) {
      try {
        await twilioClient.messages.create({
          messagingServiceSid: TWILIO_MSG_SVC,
          to: customerPhone,
          body: `You're confirmed at Awaken Zen Spa! 🎉\n\n` +
                `📅 ${serviceName}${durationMins ? ` (${durationMins} min)` : ""}\n` +
                `🕐 ${displayDate} at ${displayTime}\n` +
                `👤 With ${therapist || "your therapist"}\n` +
                `📍 2830 E Brown Rd, Suite 10, Mesa AZ\n\n` +
                `Please arrive 5–10 min early. To cancel or reschedule (24-hr notice required) call or text:\n` +
                `(602) 688-2578\n\nSee you soon, ${firstNameOnly} ✨`
        });
        console.log(`[confirm-booking] Confirmation SMS sent to ${customerPhone}`);
      } catch (smsErr) {
        console.error("[confirm-booking] SMS failed:", smsErr.message);
      }
    }

    // Notify owner
    try {
      await twilioClient.messages.create({
        messagingServiceSid: TWILIO_MSG_SVC,
        to: OWNER_CELL,
        body: `✅ AZS: Booking complete — ${customerName} · ${serviceName} · ${displayDate} at ${displayTime} · Card on file saved. Source: ${bookedSource || "unknown"}`
      });
    } catch (e) { /* non-fatal */ }

    res.json({ ok: true });
  } catch (err) {
    console.error("[confirm-booking] Error:", err.message);
    res.status(500).json({ error: err.message });
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
      messagingServiceSid: TWILIO_MSG_SVC,
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
- Never ask the caller what day it is. You always know.

TONE AND STYLE:
You're a warm, friendly front desk team member — not a corporate phone system. Speak the way a real person would on the phone. Use contractions (you're, we've, that's, I'll). Keep sentences short. Never open with "Certainly!", "Of course!", "Absolutely!", or "I'd be happy to assist you with that." Just respond naturally and get to the point. Allow a natural pause before responding — never cut the caller off mid-sentence.

EMAIL:
Never ask for an email address on a voice call. Email is not collected over the phone. If the caller offers one, acknowledge it politely and move on — do not use it for booking.

NAMES:
When a caller gives their name, repeat it back exactly as they said it — do not alter spelling or add letters. If they say "Brant", confirm "Brant". If they say "Jan", confirm "Jan". Never guess at spelling.

COMBO BOOKINGS (massage + facial):
When a caller wants both a massage and a facial, check availability and book as a combo. Pass both serviceKey and facialKey. Brant does the massage, Trevor does the facial. The facial is always 60 min. Never offer a combo start time later than:
- 60 min massage: 6:00 PM
- 90 min massage: 5:30 PM
- 120 min massage: 5:00 PM

AFTER A BOOKING IS CONFIRMED:
Always tell the caller: "To hold your spot, we require a card on file for our no-show policy — I'm sending you a secure link right now via text to save your card. It only takes a second." Then trigger the save-card SMS tool.`
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

// ─────────────────────────────────────────────────────────────────────────────
// SMS AI SYSTEM — Kai text concierge
// ─────────────────────────────────────────────────────────────────────────────

// ── Conversation memory (in-memory, persists for session duration) ────────────
const smsConversations = new Map(); // phone -> [{ role, content }]
const SMS_MAX_HISTORY = 20; // keep last 20 messages per client

function getConversation(phone) {
  if (!smsConversations.has(phone)) {
    smsConversations.set(phone, []);
  }
  return smsConversations.get(phone);
}

function addToConversation(phone, role, content) {
  const convo = getConversation(phone);
  convo.push({ role, content });
  // Keep last N messages
  if (convo.length > SMS_MAX_HISTORY) {
    convo.splice(0, convo.length - SMS_MAX_HISTORY);
  }
}

// ── Square: Get upcoming bookings for a phone number ─────────────────────────
async function getUpcomingBookings(phoneNumber) {
  // Search for customer by phone
  const customerRes = await squareRequest("POST", "/customers/search", {
    query: { filter: { phone_number: { exact: phoneNumber } } }
  });

  if (!customerRes.customers?.length) return [];

  const customerId = customerRes.customers[0].id;

  // Get upcoming bookings
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

// ── Square: Cancel a booking ──────────────────────────────────────────────────
async function cancelBooking(bookingId, version) {
  return squareRequest("POST", `/bookings/${bookingId}/cancel`, {
    booking_version: version,
    idempotency_key: `cancel-${bookingId}-${Date.now()}`
  });
}

// ── Format booking for display ────────────────────────────────────────────────
function formatBookingForDisplay(booking) {
  const dt = new Date(booking.start_at);
  const date = dt.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long", month: "long", day: "numeric"
  });
  const time = dt.toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric", minute: "2-digit", hour12: true
  });
  const service = booking.appointment_segments?.[0]?.service_variation_id || "Service";
  return `${date} at ${time}`;
}

// ── SMS System Prompt ─────────────────────────────────────────────────────────
function buildSmsSystemPrompt(clientPhone) {
  const now = new Date();
  const azDate = now.toLocaleDateString("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const azTime = now.toLocaleTimeString("en-US", {
    timeZone: "America/Phoenix",
    hour: "numeric", minute: "2-digit", hour12: true
  });

  // Check if within 24 hours of any upcoming booking (for cancellation warning)
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

BOOKING FLOW:
When someone wants to book a new appointment, follow these steps in order — never skip:
1. Confirm service type (if not given)
2. Confirm duration (60, 90, or 120 min — if not given)
3. Ask for their preferred date and time (if not given)
4. Check availability: [CHECK_AVAILABILITY: serviceKey|duration|date]
5. Present up to 3 time options and ask which works
6. Ask for their full name (if not already given)
7. Ask for their cell phone number (if not already given — you need it to send the save-card link)
8. Then book: [BOOK_APPOINTMENT: serviceKey|duration|isoDateTime|name|phone]
Do not skip steps 6 and 7. Never book without both name and phone number.

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
[CHECK_AVAILABILITY: massageKey|duration|date] — single service
[CHECK_AVAILABILITY: massageKey|duration|date|facialKey] — combo (massage + facial back-to-back)
[BOOK_APPOINTMENT: massageKey|duration|isoDateTime|customerName|customerPhone] — single service
[BOOK_APPOINTMENT: massageKey|duration|isoDateTime|customerName|customerPhone|facialKey] — combo
isoDateTime MUST include the Arizona timezone offset, e.g. 2026-04-17T08:00:00-07:00
[CANCEL_BOOKING: bookingId|version] — cancel a booking
[SEND_BOOKING_LINK] — send the booking link via text

COMBO BOOKINGS:
When a client wants both a massage and a facial, you MUST collect both before checking availability:
1. Ask which massage type and duration (if not given)
2. Ask which facial (if not given) — options: Calm & Clear, Derm-Renew, Hydro Refresh, Youthful Glow, Thermal Vitality
3. Only then run [CHECK_AVAILABILITY: massageKey|duration|date|facialKey]
4. Book with [BOOK_APPOINTMENT: massageKey|duration|isoDateTime|name|phone|facialKey]
Brant does the massage, Trevor does the facial. Facial is always 60 min. Last start times:
- 60 min massage: 6:00 PM latest
- 90 min massage: 5:30 PM latest
- 120 min massage: 5:00 PM latest

SERVICES — use these EXACT serviceKey strings in action commands (no hyphens, no camelCase):
"swedish" — 60/90/120 min — $85/$115/$145
"deep tissue" — 60/90/120 min — $85/$115/$145
"lymphatic" — 60/90/120 min — $85/$115/$145
"ashiatsu" — 60/90/120 min — $85/$115/$145
"hot stone" — 90/120 min — $130/$170
"shiatsu" — 60/90/120 min — $85/$115/$145
"thai" — 60/90/120 min — $85/$115/$145
"lomi lomi" — 60/90/120 min — $85/$115/$145
"pregnancy" — 60/90 min — $85/$115
"calm and clear" — facial 60/90 min — $85/$115
"derm renew" — facial 60/90 min — $85/$115
"hydro refresh" — facial 60/90 min — $85/$115
"youthful glow" — facial 60/90 min — $85/$115
"thermal vitality" — facial 60/90 min — $85/$115
"microdermabrasion" — 60/90 min — $95/$125
"dermaplane" — 60/90 min — $100/$130
"microneedling" — 60 min — $130

TONE:
- Warm and personal, like a trusted front desk person who texts back
- Brief — this is text, not email. Use contractions.
- Keep every response under 300 characters whenever possible. Never exceed 2 SMS segments (~320 characters). If you need to share a link, that counts toward the limit — write less prose around it.
- Avoid stiff openers like "Certainly!" or "Of course!" — just respond naturally
- Never ask for an email address over text — it's handled elsewhere
- Sign off warmly on first message: "— Kai at Awaken Zen"`;
}

// ── Process AI action commands from Claude's response ─────────────────────────
async function processActions(responseText, clientPhone, clientName) {
  let finalText = responseText;
  const actions = [];

  // Extract all action commands
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
        if (bookings.length === 0) {
          result = "No upcoming appointments found for this number.";
        } else {
          result = bookings.map((b, i) =>
            `${i + 1}. ${formatBookingForDisplay(b)} (ID: ${b.id}, v${b.version})`
          ).join("\n");
        }
        // Replace action with result context for Claude to use
        finalText = finalText.replace(action.full, `[Bookings found: ${result}]`);
      }

      else if (action.name === "CHECK_AVAILABILITY") {
        const [svcKey, dur, date, facialKeyArg] = action.args;
        const service = lookupService(svcKey);
        if (service) {
          const variationId = service.variations[dur || "60"];
          if (variationId) {
            const resolved = resolveDate(date || "tomorrow");
            if (resolved) {
              const dateStr = formatDateForSquare(resolved);
              const isCombo = !!(facialKeyArg && facialKeyArg.trim());
              let segmentFilters, endAt;

              if (isCombo) {
                const facialSvc = lookupService(facialKeyArg);
                const facialVariationId = facialSvc?.variations?.["60"];
                if (facialSvc && facialVariationId) {
                  const lastStartMin = 20 * 60 - parseInt(dur || "60") - 60;
                  const lsHour = String(Math.floor(lastStartMin / 60)).padStart(2, "0");
                  const lsMin  = String(lastStartMin % 60).padStart(2, "0");
                  endAt = `${dateStr}T${lsHour}:${lsMin}:00-07:00`;
                  segmentFilters = [
                    { service_variation_id: variationId,       team_member_id_filter: { any: [TEAM_MEMBERS.brant.id]  } },
                    { service_variation_id: facialVariationId, team_member_id_filter: { any: [TEAM_MEMBERS.trevor.id] } }
                  ];
                }
              }

              if (!segmentFilters) {
                endAt = `${dateStr}T19:00:00-07:00`;
                segmentFilters = [{ service_variation_id: variationId, team_member_id_filter: { any: Object.values(TEAM_MEMBERS).map(m => m.id) } }];
              }

              const data = await squareRequest("POST", "/bookings/availability/search", {
                query: {
                  filter: {
                    start_at_range: { start_at: `${dateStr}T08:00:00-07:00`, end_at: endAt },
                    location_id: LOCATION_ID,
                    segment_filters: segmentFilters
                  }
                }
              });
              const slots = data.availabilities || [];
              const uniqueTimes = filterSlots(slots);
              result = slots.length === 0
                ? "No availability on that day."
                : `Available: ${uniqueTimes.join(", ")}. Slots: ${JSON.stringify(slots.filter(s => {
                    const azMin = new Date(new Date(s.start_at).getTime() - 7 * 60 * 60 * 1000).getUTCMinutes();
                    return azMin === 0 || azMin === 30;
                  }).slice(0, 3).map(s => s.start_at))}`;
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
          // Notify owner
          await twilioClient.messages.create({
            messagingServiceSid: TWILIO_MSG_SVC,
            to: OWNER_CELL,
            body: `📋 AZS: Kai cancelled booking ${bookingId} for ${clientPhone} via SMS.`
          });
        }
        finalText = finalText.replace(action.full, `[Cancel result: ${result}]`);
      }

      else if (action.name === "BOOK_APPOINTMENT") {
        const [svcKey, dur, isoDateTime, name, phone, facialKeyArg] = action.args;
        const service = lookupService(svcKey);
        if (service) {
          const variationId = service.variations[dur || "60"];
          if (variationId) {
            // ── Combo: resolve facial if provided ─────────────────────────────
            const isCombo = !!(facialKeyArg && facialKeyArg.trim());
            let facialSvc = null, facialVariationId = null;
            if (isCombo) {
              facialSvc = lookupService(facialKeyArg);
              facialVariationId = facialSvc?.variations?.["60"] || null;
            }

            // Find/create customer
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

            const appointmentSegments = [
              { service_variation_id: variationId, service_variation_version: 0, duration_minutes: parseInt(dur || "60"), team_member_id: TEAM_MEMBERS.brant.id }
            ];
            if (isCombo && facialVariationId) {
              appointmentSegments.push({
                service_variation_id: facialVariationId, service_variation_version: 0, duration_minutes: 60, team_member_id: TEAM_MEMBERS.trevor.id
              });
            }

            const serviceLabel = (isCombo && facialSvc) ? `${service.label} + ${facialSvc.label}` : service.label;

            const bookingRes = await squareRequest("POST", "/bookings", {
              booking: {
                location_id: LOCATION_ID,
                start_at: ensureAzTimezone(isoDateTime),
                customer_id: customerId,
                customer_note: "Booked via Kai SMS concierge.",
                appointment_segments: appointmentSegments
              },
              idempotency_key: `sms-${Date.now()}-${Math.random().toString(36).substr(2,9)}`
            });

            const booking = bookingRes.booking;
            if (!booking) {
              const errDetail = bookingRes.errors?.[0]?.detail || "Could not book";
              console.error(`[SMS BOOK_APPOINTMENT] Square error — svc:${svcKey} dur:${dur} start:${isoDateTime} facial:${facialKeyArg || "none"} — ${errDetail}`, JSON.stringify(bookingRes.errors));
              result = `Error: ${errDetail}`;
            } else {
              const displayTime = formatTimeForDisplay(booking.start_at);
              const displayDate = new Date(booking.start_at).toLocaleDateString("en-US", {
                timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric"
              });
              console.log(`[SMS BOOK_APPOINTMENT] Success — ${serviceLabel} on ${displayDate} at ${displayTime} for ${name} (${booking.id})`);
              result = `Booked! ${serviceLabel} on ${displayDate} at ${displayTime}. Booking ID: ${booking.id}`;
            }
          }
        }
        finalText = finalText.replace(action.full, `[Booking result: ${result}]`);
      }

      else if (action.name === "SEND_BOOKING_LINK") {
        await twilioClient.messages.create({
          messagingServiceSid: TWILIO_MSG_SVC,
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

// ── Call Claude API for SMS response ─────────────────────────────────────────
async function getKaiSmsResponse(clientPhone, userMessage, clientName) {
  const history = getConversation(clientPhone);

  // Build messages array
  const messages = [
    ...history,
    { role: "user", content: userMessage }
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
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

    // Add user message to history
    addToConversation(clientPhone, "user", incomingMsg);

    // Get Claude's response
    let aiResponse = await getKaiSmsResponse(clientPhone, incomingMsg, clientName);
    console.log(`[SMS] Raw AI response for ${clientPhone}: ${aiResponse.slice(0, 200)}`);

    // Process any action commands in the response
    aiResponse = await processActions(aiResponse, clientPhone, clientName);
    console.log(`[SMS] After actions for ${clientPhone}: ${aiResponse.slice(0, 300)}`);

    // Strip action tags from whatever gets stored in history — never store raw results
    const cleanForHistory = t => t.replace(/\[(?:Bookings found|Availability|Cancel result|Booking result|Action failed):[^\]]*\]/g, "").trim();

    // If response has action result placeholders, do a second Claude pass to convert to natural language
    if (aiResponse.includes("[Bookings found:") || aiResponse.includes("[Availability:") ||
        aiResponse.includes("[Cancel result:") || aiResponse.includes("[Booking result:") ||
        aiResponse.includes("[Action failed:")) {

      // Store the raw result so Claude can read it, then immediately add a strict instruction
      addToConversation(clientPhone, "assistant", aiResponse);
      addToConversation(clientPhone, "user", "Now reply to the client in plain conversational text based on those results. Do not include any action commands or bracket syntax in your reply. Just natural language.");

      let finalResponse = await getKaiSmsResponse(clientPhone, "Reply in plain text only — no action commands.", clientName);
      // Strip any action tags Claude snuck in anyway
      finalResponse = finalResponse.replace(/\[[A-Z_]+(?::[^\]]+)?\]/g, "").trim();
      console.log(`[SMS] Final response for ${clientPhone}: ${finalResponse.slice(0, 200)}`);

      // Replace the raw result entry in history with clean version before storing final reply
      const convo = getConversation(clientPhone);
      if (convo.length >= 2) convo[convo.length - 2].content = cleanForHistory(convo[convo.length - 2].content);
      // Replace the "now reply" instruction too — not useful for future context
      convo.splice(convo.length - 1, 1);

      const safeResponse = finalResponse || "Sorry, I hit a snag — can you try again or call us at (602) 688-2578?";
      addToConversation(clientPhone, "assistant", safeResponse);
      twiml.message(safeResponse);
    } else {
      const cleanResponse = aiResponse.replace(/\[[A-Z_]+(?::[^\]]+)?\]/g, "").trim();
      console.log(`[SMS] Clean response for ${clientPhone}: ${cleanResponse.slice(0, 200)}`);
      const safeResponse = cleanResponse || "Sorry, I hit a snag — can you try again or call us at (602) 688-2578?";
      addToConversation(clientPhone, "assistant", safeResponse);
      twiml.message(safeResponse);
    }

  } catch (err) {
    console.error("SMS error:", err);
    twiml.message("Hi! This is Awaken Zen Spa. We're having a moment — please call us at (602) 688-2578 or visit awakenzenspa.com/booking. Sorry for the inconvenience!");
  }

  res.type("text/xml").send(twiml.toString());
});

// ── Route: Facebook OAuth — one-time page token generator ────────────────────
app.get("/auth/fb", (req, res) => {
  const APP_ID      = process.env.META_APP_ID;
  const REDIRECT    = `${process.env.BASE_URL || "https://awaken-zen-kai-production.up.railway.app"}/auth/fb/callback`;
  const SCOPE       = "pages_manage_posts,pages_read_engagement,pages_show_list";
  const url = `https://www.facebook.com/dialog/oauth?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=${SCOPE}&response_type=code`;
  res.redirect(url);
});

app.get("/auth/fb/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.send("No code returned from Facebook.");

  const APP_ID     = process.env.META_APP_ID;
  const APP_SECRET = process.env.META_APP_SECRET;
  const REDIRECT   = `${process.env.BASE_URL || "https://awaken-zen-kai-production.up.railway.app"}/auth/fb/callback`;
  const PAGE_ID    = process.env.META_FB_PAGE_ID;

  try {
    // Exchange code for user token
    const tokenRes  = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT)}&client_secret=${APP_SECRET}&code=${code}`);
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.send(`Token exchange failed: ${JSON.stringify(tokenData)}`);

    // Exchange user token for page token
    const pageRes  = await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}?fields=access_token,name&access_token=${tokenData.access_token}`);
    const pageData = await pageRes.json();

    // Debug: show scopes
    const debugRes  = await fetch(`https://graph.facebook.com/debug_token?input_token=${pageData.access_token}&access_token=${pageData.access_token}`);
    const debugData = await debugRes.json();

    res.send(`<pre>
Page: ${pageData.name}
Page Token: ${pageData.access_token}

Scopes: ${JSON.stringify(debugData?.data?.scopes, null, 2)}

Copy the Page Token above into Railway as META_PAGE_ACCESS_TOKEN
</pre>`);
  } catch (e) {
    res.send(`Error: ${e.message}`);
  }
});

// ── Route: Test social post — fires a real IG + FB post with provided caption ─
app.post("/test-social-post", async (req, res) => {
  const { caption, imageUrl } = req.body;
  if (!caption) return res.status(400).json({ error: "caption is required" });

  const GRAPH     = "https://graph.facebook.com/v19.0";
  const IG_ID     = process.env.META_IG_ACCOUNT_ID;
  const FB_ID     = process.env.META_FB_PAGE_ID;
  const TOKEN     = process.env.META_PAGE_ACCESS_TOKEN;
  // Use provided imageUrl or fall back to the AZS logo served from the site
  const imgUrl    = imageUrl || `${SITE_URL}/images/azs-logo-social.jpg`;

  const results = {};

  // Resolve redirects using Node http/https (fetch redirect:"manual" hides Location headers)
  const getLocation = (url) => new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, (res) => { res.destroy(); resolve(res.headers["location"] || null); });
    req.setTimeout(5000, () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
  });
  let resolvedImg = imgUrl;
  try {
    let current = imgUrl;
    for (let hop = 0; hop < 5; hop++) {
      const loc = await getLocation(current);
      if (!loc) break;
      current = loc.startsWith("http") ? loc : new URL(loc, current).href;
    }
    resolvedImg = current;
  } catch (e) {
    console.warn("[test-social-post] redirect resolve failed:", e.message);
  }
  results.resolvedImageUrl = resolvedImg;

  // ── IG Feed ────────────────────────────────────────────────────────────────
  try {
    const containerRes = await fetch(`${GRAPH}/${IG_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: resolvedImg, caption, access_token: TOKEN })
    });
    const container = await containerRes.json();
    if (!container.id) throw new Error(JSON.stringify(container));

    // Poll until IG finishes processing the image (up to ~30s)
    let statusCode = "IN_PROGRESS";
    for (let i = 0; i < 10 && statusCode === "IN_PROGRESS"; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes = await fetch(
        `${GRAPH}/${container.id}?fields=status_code&access_token=${TOKEN}`
      );
      const statusData = await statusRes.json();
      statusCode = statusData.status_code || "ERROR";
    }
    if (statusCode !== "FINISHED") throw new Error(`Container status: ${statusCode}`);

    const publishRes = await fetch(`${GRAPH}/${IG_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: TOKEN })
    });
    const published = await publishRes.json();
    results.instagram = published.id ? `posted: ${published.id}` : JSON.stringify(published);
  } catch (e) {
    results.instagram = `error: ${e.message}`;
  }

  // ── Facebook Feed ──────────────────────────────────────────────────────────
  // Requires META_FB_PAGE_ID to be a Page ID (not a user ID) and
  // META_PAGE_ACCESS_TOKEN to be a Page Access Token with pages_manage_posts scope.
  try {
    const fbRes = await fetch(`${GRAPH}/${FB_ID}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: caption, link: resolvedImg, access_token: TOKEN })
    });
    const fbData = await fbRes.json();
    if (fbData.error) {
      results.facebook = JSON.stringify(fbData);
    } else {
      const fbId = fbData.post_id || fbData.id;
      results.facebook = fbId ? `posted: ${fbId}` : JSON.stringify(fbData);
    }
  } catch (e) {
    results.facebook = `error: ${e.message}`;
  }

  console.log("[test-social-post]", results);
  res.json({ results, imageUrl: imgUrl });
});

// ── Route: Social Flash — manual post trigger ────────────────────────────────
app.post("/social-flash/post", async (req, res) => {
  const { service, serviceName, slotTime, flashPrice, addon } = req.body;

  if (!slotTime || (!service && !serviceName)) {
    return res.status(400).json({ success: false, error: "slotTime and service are required" });
  }

  try {
    // Create flash offer record so triggerSocialFlash can track it
    const { data: offer, error: offerErr } = await supabase
      .from("flash_offers")
      .insert({
        service_name: serviceName || service,
        slot_time:    slotTime,
        flash_price:  flashPrice  || null,
        addon:        addon       || null,
        status:       "active",
        created_at:   new Date().toISOString()
      })
      .select()
      .single();

    if (offerErr) throw new Error(`Could not create flash offer: ${offerErr.message}`);

    const { triggerSocialFlash } = require("./jobs/socialPost.js");

    // Fire-and-forget — posting happens asynchronously (stories/feed on delay)
    triggerSocialFlash(offer.id, slotTime, {
      serviceName:        serviceName || service,
      serviceDescription: "",
      flashPrice:         flashPrice  || "",
      regPrice:           "",
      addon:              addon       || ""
    }).catch(err =>
      console.error("[social-flash/post] Background posting error:", err.message)
    );

    res.json({ success: true, offerId: offer.id, message: "Social flash queued" });
  } catch (err) {
    console.error("[social-flash/post] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Route: Social Flash — render HTML template → PNG ─────────────────────────
// Called internally by triggerSocialFlash via socialPost.js → renderTemplate()
app.post("/social-flash/render", async (req, res) => {
  const { html, format } = req.body;

  if (!html || !format) {
    return res.status(400).json({ error: "html and format are required" });
  }

  try {
    const { renderHtmlToPng } = require("./jobs/socialImageGen.js");
    const result = await renderHtmlToPng(html, format);
    res.json({ imageUrl: result.imageUrl });
  } catch (err) {
    console.error("[social-flash/render] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Route: Flash Fill — trigger member sync ───────────────────────────────────
app.post("/flash-fill/trigger", async (req, res) => {
  try {
    const { runMemberSync } = require("./jobs/memberSync.js");
    const result = await runMemberSync();
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Flash Fill trigger error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Email handler (Gmail draft responses) ────────────────────────────────────
const emailRoutes = require('./email-handler');
app.use(emailRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// AZS Content Engine — Weekly Social Post Generator
// POST /generate-content  (called by Railway cron, requires x-cron-token header)
// ─────────────────────────────────────────────────────────────────────────────

const AZS_VOICE = `You are writing social media content for Awaken Zen Spa (AZS) — a boutique massage and esthetics spa in Mesa, Arizona.

BRAND VOICE:
- Warm, grounded, expert — never salesy or pushy
- Draws from somatic awareness, nervous system science, and holistic wellness
- Conversational but elevated — like a knowledgeable friend, not a corporate brand
- Uses sensory language — what things feel like, not just what they are
- Occasionally references breathwork, fascia, the parasympathetic system, embodiment
- Short, punchy sentences. White space. Never more than 4-5 sentences per post.

ABOUT AZS:
- Brant (LMT, owner) and Trevor (LE, esthetician)
- Mesa, AZ — boutique, appointment-only
- Services: deep tissue, Swedish, hot stone, Ashiatsu, lymphatic drainage, prenatal massage, custom facials, HydraFacial, dermaplaning, microneedling
- Philosophy: the body holds everything — stress, grief, tension, joy. Skilled touch is medicine.
- Booking: awakenzenspa.com or text (602) 688-2578

HASHTAG STRATEGY:
- Mix: 2-3 niche (#mesaLMT, #arizonaspa, #mesaesthetician), 3-4 mid (#massagetherapy, #skincare), 2-3 broad (#selfcare, #wellness)
- Never more than 10 hashtags total
- Always include #awakenzen`;

const WEEKLY_PLAN = [
  { day: 'Monday',    platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  theme: 'intention setting, beginning of week, presence' },
  { day: 'Monday',    platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    theme: 'nervous system, stress physiology, why rest matters' },
  { day: 'Tuesday',   platform: 'instagram_reel', pillar: 'service_showcase', post_type: 'reel',   theme: 'deep tissue massage benefits, muscle tension release' },
  { day: 'Tuesday',   platform: 'instagram_feed', pillar: 'monthly_special',  post_type: 'promo',  theme: 'current monthly special, booking CTA' },
  { day: 'Wednesday', platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  theme: 'midweek reset, stillness, letting go' },
  { day: 'Wednesday', platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    theme: 'fascia, skin health, or trending wellness topic', isTrending: true },
  { day: 'Thursday',  platform: 'instagram_reel', pillar: 'service_showcase', post_type: 'reel',   theme: 'facial treatments, skin transformation, esthetics' },
  { day: 'Thursday',  platform: 'instagram_feed', pillar: 'bts',              post_type: 'photo',  theme: 'behind the scenes, spa preparation, intentional space' },
  { day: 'Friday',    platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  theme: 'treat yourself, self-care friday, permission to rest' },
  { day: 'Friday',    platform: 'instagram_feed', pillar: 'monthly_special',  post_type: 'promo',  theme: 'weekend booking push, urgency, availability' },
  { day: 'Friday',    platform: 'instagram_feed', pillar: 'social_proof',     post_type: 'photo',  theme: 'client transformation, results, trust building' },
  { day: 'Saturday',  platform: 'instagram_feed', pillar: 'bts',              post_type: 'photo',  theme: 'spa ambiance, treatment room, calm environment' },
  { day: 'Saturday',  platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    theme: 'zen tip, recentering, finding calm in chaos' },
  { day: 'Sunday',    platform: 'instagram_feed', pillar: 'inspiration',      post_type: 'quote',  theme: 'slow sunday, rest as medicine, preparing for the week' },
  { day: 'Sunday',    platform: 'instagram_feed', pillar: 'education',        post_type: 'tip',    theme: 'self-care tip, breathwork, body awareness for the week ahead' },
];

const HASHTAGS = {
  inspiration:      '#awakenzen #selfcare #wellnesslifestyle #zenlife #mesaspa #restisproductive #slowdown #mindbody #arizonaspa #presentmoment',
  education:        '#awakenzen #wellnesstip #massagetherapist #skincare #nervoussystem #somatichealing #mesaLMT #therapeuticmassage #bodywork #healthyhabits',
  service_showcase: '#awakenzen #massagetherapy #deeptissue #facials #mesaspa #arizonaspa #mesaLMT #massagemesa #spaday #treatyourself',
  monthly_special:  '#awakenzen #mesaspa #massagetherapy #selfcarefriday #arizonaspa #mesaarizona #relaxation #treatyourself #massagemesa #spaday',
  bts:              '#awakenzen #spatime #behindthescenes #mesaspa #boutiquespa #zenspace #arizonaspa #massagetherapist #esthetician #smallbusiness',
  social_proof:     '#awakenzen #clientlove #massageresults #skintransformation #mesaspa #realresults #massagetherapy #facialresults #arizonaspa #testimonial',
};

const TRENDING_TOPICS = [
  'cortisol and chronic stress 2026',
  'lymphatic drainage benefits trending',
  'fascia and emotional release bodywork',
  'skin barrier health trending skincare',
  'nervous system regulation techniques',
  'breathwork benefits science 2025 2026',
  'HydraFacial vs traditional facial benefits',
  'massage for sleep quality research',
  'Ashiatsu barefoot massage benefits',
  'prenatal massage benefits second trimester',
];

async function generatePost(slot, monthlySpecial, trendingContext) {
  const isPromo    = slot.pillar === 'monthly_special';
  const isTrending = slot.isTrending;
  const isReel     = slot.post_type === 'reel';

  let contextBlock = '';
  if (isPromo && monthlySpecial) {
    contextBlock = `CURRENT MONTHLY SPECIAL:\n${monthlySpecial}\n\n`;
  }
  if (isTrending && trendingContext) {
    contextBlock = `TRENDING TOPIC RESEARCH:\n${trendingContext}\n\n`;
  }

  const prompt = `${contextBlock}Write a ${slot.platform.replace('_', ' ')} caption for Awaken Zen Spa.

PILLAR: ${slot.pillar.replace('_', ' ')}
POST TYPE: ${slot.post_type}
DAY: ${slot.day}
THEME: ${slot.theme}
${isReel ? 'NOTE: This is for a Reel — the caption supports a video. Write as if a massage or facial clip is playing.' : ''}
${slot.pillar === 'social_proof' ? 'NOTE: Write as a social proof post — frame around client results and transformation. Do not fabricate specific client names or quotes.' : ''}

Write ONLY:
1. The caption (no label, just the text)
2. A blank line
3. The hashtags on one line

Keep caption under 100 words. Make it feel human, not generated.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: AZS_VOICE,
    messages: [{ role: 'user', content: prompt }],
  });

  const full     = response.content[0].text.trim();
  const parts    = full.split(/\n\s*\n/);
  const caption  = parts[0]?.trim() || full;
  const hashtags = parts[parts.length - 1]?.startsWith('#')
    ? parts[parts.length - 1].trim()
    : HASHTAGS[slot.pillar] || '';

  return { caption, hashtags };
}

async function researchTrend() {
  const topic = TRENDING_TOPICS[Math.floor(Math.random() * TRENDING_TOPICS.length)];
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      system: 'You are a wellness content researcher. Find recent, credible information about the given topic and summarize the key findings in 3-4 sentences that could inform a spa social media post.',
      messages: [{ role: 'user', content: `Research this wellness topic for a spa social post: ${topic}` }],
    });
    const textBlock = response.content.find(b => b.type === 'text');
    return textBlock ? `Topic: ${topic}\n\n${textBlock.text}` : null;
  } catch (err) {
    console.error('[generate-content] Trend research error:', err.message);
    return null;
  }
}

async function getMonthlySpecial() {
  try {
    const { data } = await supabase
      .from('monthly_specials')
      .select('*')
      .eq('active', true)
      .single();
    if (!data) return null;
    return `${data.title}: ${data.discount_text}. ${data.booking_cta}`;
  } catch {
    return null;
  }
}

function getNextWeekDates() {
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const now  = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Phoenix' }));
  const dates = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i + 1);
    dates[days[d.getDay()]] = d.toISOString().split('T')[0];
  }
  return dates;
}

app.post('/generate-content', async (req, res) => {
  const token = req.headers['x-cron-token'] || req.query.token;
  if (token !== process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  console.log('[generate-content] Starting weekly content generation…');

  try {
    const [monthlySpecial, trendingContext, weekDates] = await Promise.all([
      getMonthlySpecial(),
      researchTrend(),
      Promise.resolve(getNextWeekDates()),
    ]);

    console.log(`[generate-content] Context: special=${!!monthlySpecial}, trend=${!!trendingContext}`);

    const results = [];
    const errors  = [];

    for (const slot of WEEKLY_PLAN) {
      try {
        const scheduledDate = weekDates[slot.day];
        if (!scheduledDate) continue;

        const { caption, hashtags } = await generatePost(slot, monthlySpecial, trendingContext);

        const { data: existing } = await supabase
          .from('approval_queue')
          .select('id')
          .eq('platform', slot.platform)
          .eq('scheduled_for', scheduledDate)
          .eq('status', 'pending')
          .single();

        if (existing) {
          console.log(`[generate-content] Skipping ${slot.day} ${slot.platform} — already queued`);
          continue;
        }

        const { data: scheduleRow } = await supabase
          .from('post_schedule')
          .upsert({
            scheduled_for: scheduledDate,
            platform:      slot.platform,
            pillar:        slot.pillar,
            post_type:     slot.post_type,
            title:         slot.theme.split(',')[0].trim(),
            status:        'pending_approval',
          }, { onConflict: 'scheduled_for,platform' })
          .select()
          .single();

        const { error: qErr } = await supabase
          .from('approval_queue')
          .insert({
            post_schedule_id:  scheduleRow?.id || null,
            caption_text:      caption,
            hashtags:          hashtags,
            platform:          slot.platform,
            scheduled_for:     scheduledDate,
            status:            'pending',
            generation_prompt: `${slot.pillar} | ${slot.post_type} | ${slot.theme}`,
          });

        if (qErr) {
          errors.push({ slot: `${slot.day}-${slot.platform}`, error: qErr.message });
        } else {
          results.push({ day: slot.day, platform: slot.platform, pillar: slot.pillar });
          console.log(`[generate-content] ✓ ${slot.day} ${slot.platform} (${slot.pillar})`);
        }

        await new Promise(r => setTimeout(r, 800));

      } catch (slotErr) {
        console.error(`[generate-content] Error on ${slot.day}:`, slotErr.message);
        errors.push({ slot: `${slot.day}-${slot.platform}`, error: slotErr.message });
      }
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`[generate-content] Done — ${results.length} posts generated in ${elapsed}s`);

    res.json({
      success:   true,
      generated: results.length,
      skipped:   WEEKLY_PLAN.length - results.length - errors.length,
      errors:    errors.length > 0 ? errors : undefined,
      elapsed:   `${elapsed}s`,
    });

  } catch (err) {
    console.error('[generate-content] Fatal error:', err.message);
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
