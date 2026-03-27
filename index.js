// ─────────────────────────────────────────────────────────────────────────────
// Awaken Zen Spa — Kai Webhook Server (Updated with Time-Based Routing)
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const twilio  = require("twilio");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const VoiceResponse = twilio.twiml.VoiceResponse;
const twilioClient  = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const TWILIO_NUMBER  = process.env.TWILIO_PHONE_NUMBER; // your Twilio number
const VAPI_NUMBER    = process.env.VAPI_PHONE_NUMBER;   // Vapi assigns this
const OWNER_CELL     = "+16232196907";                   // Mint phone
const BOOKING_URL    = "https://awakenzenspa.com/booking";
const GIFT_CARD_URL  = "https://awakenzenspa.com/gift-cards";

// ── Time-based routing helper ─────────────────────────────────────────────────
// Arizona = America/Phoenix = UTC-7 year-round (no DST)
function isLiveWindow() {
  const now = new Date();
  // Convert to Arizona time
  const azTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Phoenix" }));
  const hours   = azTime.getHours();
  const minutes = azTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  // 8:00 AM = 480 min, 9:30 AM = 570 min
  return totalMinutes >= 480 && totalMinutes < 570;
}

// ── Route: Inbound call from Google Voice ─────────────────────────────────────
// Point your Twilio number's "A Call Comes In" webhook here
app.post("/incoming", (req, res) => {
  const twiml = new VoiceResponse();

  if (isLiveWindow()) {
    // 8:00–9:30 AM → ring owner cell directly with whisper
    console.log("[ROUTING] Live window — forwarding to owner cell");
    const dial = twiml.dial({ timeout: 20, action: "/no-answer" });
    dial.number(
      { url: `${process.env.BASE_URL}/whisper` },
      OWNER_CELL
    );
  } else {
    // All other times → send to Kai on Vapi
    console.log("[ROUTING] Outside live window — forwarding to Kai (Vapi)");
    const dial = twiml.dial({ timeout: 30, action: "/no-answer" });
    dial.number(VAPI_NUMBER);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ── Route: No answer fallback ─────────────────────────────────────────────────
// If owner doesn't pick up during live window, roll over to Kai
app.post("/no-answer", (req, res) => {
  const twiml = new VoiceResponse();
  const dialStatus = req.body.DialCallStatus;

  if (dialStatus !== "completed" && dialStatus !== "answered") {
    // Owner didn't pick up — send to Kai
    console.log("[ROUTING] No answer — rolling over to Kai");
    const dial = twiml.dial();
    dial.number(VAPI_NUMBER);
  }

  res.type("text/xml");
  res.send(twiml.toString());
});

// ── Route: Whisper (plays to owner before connecting caller) ──────────────────
app.post("/whisper", (req, res) => {
  res.type("text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">Awaken Zen Spa call.</Say>
</Response>`);
});

// ── Route: Send Booking Link via SMS ─────────────────────────────────────────
app.post("/send-booking-link", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    await twilioClient.messages.create({
      from: TWILIO_NUMBER,
      to:   phoneNumber,
      body: `Hi, it's Awaken Zen Spa! Here's your booking link — grab your spot in seconds:\n\n${BOOKING_URL}\n\nSee you soon ✨`
    });
    res.json({ result: "Booking link sent successfully." });
  } catch (err) {
    console.error("sendBookingLink error:", err);
    res.status(500).json({ result: "Failed to send booking link." });
  }
});

// ── Route: Send Gift Card Link via SMS ───────────────────────────────────────
app.post("/send-gift-card-link", async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    await twilioClient.messages.create({
      from: TWILIO_NUMBER,
      to:   phoneNumber,
      body: `Hi, it's Awaken Zen Spa! Here's the link to purchase a gift card:\n\n${GIFT_CARD_URL}\n\nA beautiful gift for someone special ✨`
    });
    res.json({ result: "Gift card link sent successfully." });
  } catch (err) {
    console.error("sendGiftCardLink error:", err);
    res.status(500).json({ result: "Failed to send gift card link." });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("Awaken Zen Spa — Kai webhook active."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Kai webhook running on port ${PORT}`));
