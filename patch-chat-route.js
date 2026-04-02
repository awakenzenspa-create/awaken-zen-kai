/**
 * Run this in your Kai Codespace:
 *   node patch-chat-route.js
 *
 * What it does:
 * 1. Updates CHAT_SYSTEM prompt — new booking flow (no Square from chat)
 * 2. Replaces book_appointment tool handler — builds URL instead of booking Square
 * 3. Updates final response — returns bookingLink separately
 */

const fs = require('fs');
let code = fs.readFileSync('index.js', 'utf8');

// ── 1. Update CHAT_SYSTEM prompt ─────────────────────────────────────────────
const oldPrompt = `- You CAN check real-time availability and book appointments using your tools
- When someone wants to book: get their preferred service, date, and duration first
- Then check availability, confirm a time with them, then collect name and phone to book
- Always confirm details before booking
- After booking, let them know a confirmation text is on its way
BOOKING FLOW:
1. Ask: what service, what date, how long (60/90/120 min)?
2. Use check_availability tool → show available times
3. Confirm their chosen time
4. Collect: full name and phone number (email optional) 
5. Use book_appointment tool → confirm booking
6. Tell them to expect a confirmation text\``;

const newPrompt = `- You CAN check real-time availability using your tools
- When someone wants to book: get their preferred service, date, and duration first
- Then check availability, confirm a time, collect their name and phone number
- Use the book_appointment tool to generate their booking link — do NOT tell them you are "booking" it
- The booking link is how they confirm — they save a card on file and it locks in their appointment
BOOKING FLOW:
1. Ask: what service, what date, how long (60/90/120 min)?
2. Use check_availability tool → show available times
3. Confirm their chosen time
4. Collect: full name and phone number (email optional)
5. Use book_appointment tool → get their personalized booking link
6. Present the link in chat AND offer to text it to their phone
7. Tell them: "Tap the button below (or check your texts) to save a card on file and confirm your appointment — no charge today"\``;

code = code.replace(oldPrompt, newPrompt);

// ── 2. Replace book_appointment tool handler ─────────────────────────────────
const oldBooking = `        else if (name === "book_appointment") {
          const { serviceKey, duration, startAt, customerName, customerPhone, customerEmail } = input;
          const svcKey = (serviceKey || "").toLowerCase();
          const service = SERVICES[svcKey];

          if (!service) {
            toolResult = "Service not found.";
          } else {
            const dur = String(duration || "60");
            const variationId = service.variations[dur];

            // Find or create customer
            let customerId = null;
            if (customerPhone) {
              const searchRes = await squareRequest("POST", "/customers/search", {
                query: { filter: { phone_number: { exact: customerPhone } } }
              });
              if (searchRes.customers?.length > 0) {
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
                customer_note: "Booked via Kai website chat widget.",
                appointment_segments: [{
                  service_variation_id: variationId,
                  service_variation_version: 0,
                  duration_minutes: parseInt(dur),
                  team_member_id: TEAM_MEMBERS.brant.id
                }]
              },
              idempotency_key: \`kai-chat-\${Date.now()}-\${Math.random().toString(36).substr(2,9)}\`
            });

            if (bookingRes.errors) {
              toolResult = "I wasn't able to complete that booking — you can book directly at awakenzenspa.com/booking or text (602) 688-2578.";
            } else {
              const booking = bookingRes.booking;
              const displayTime = formatTimeForDisplay(booking.start_at);
              const displayDate = new Date(booking.start_at).toLocaleDateString("en-US", {
                timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric"
              });
              // Send confirmation SMS
              if (customerPhone) {
                await twilioClient.messages.create({
                  from: TWILIO_NUMBER,
                  to: customerPhone.replace(/[^0-9+]/g,'').replace(/^([0-9]{10})$/,'+1$1'),
                  body: \`Hi \${customerName?.split(" ")[0] || "there"}, you're confirmed at Awaken Zen Spa!\\n\\n\` +
                        \`📅 \${service.label}\\n🕐 \${displayDate} at \${displayTime}\\n\` +
                        \`📍 2830 E Brown Rd, Suite 10, Mesa AZ\\n\\n\` +
                        \`One last step — save a card on file for our 24-hour cancellation policy (no charge today):\\n\${buildCardOnFileUrl(customerId, booking.id, service.label, displayDate, displayTime, customerName)}\\n\\n\` +
                        \`Questions? Text (602) 688-2578. See you soon ✨\`
                });
              }
              toolResult = \`BOOKING_CONFIRMED: \${service.label} on \${displayDate} at \${displayTime} for \${customerName}. Confirmation text sent to \${customerPhone}.\`;
            }
          }
        }`;

const newBooking = `        else if (name === "book_appointment") {
          const { serviceKey, duration, startAt, customerName, customerPhone, customerEmail } = input;
          const svcKey = (serviceKey || "").toLowerCase();
          const service = SERVICES[svcKey];

          if (!service) {
            toolResult = "Service not found. Please clarify the service name.";
          } else {
            const dur = String(duration || "60");
            const variationId = service.variations[dur];
            if (!variationId) {
              const available = Object.keys(service.variations).join(", ");
              toolResult = \`\${service.label} is available in \${available} minute sessions.\`;
            } else {
              // Build display strings from startAt ISO string
              const displayTime = formatTimeForDisplay(startAt);
              const displayDate = new Date(startAt).toLocaleDateString("en-US", {
                timeZone: "America/Phoenix", weekday: "long", month: "long", day: "numeric"
              });

              // Encode all booking params into the save-card URL
              // The save-card page will do the actual Square booking + card save
              const bookingParams = new URLSearchParams({
                service:   svcKey,
                variation: variationId,
                duration:  dur,
                startAt:   startAt,
                name:      customerName || "",
                phone:     customerPhone || "",
                email:     customerEmail || "",
                label:     service.label,
                date:      displayDate,
                time:      displayTime,
              });
              const bookingUrl = \`https://awakenzenspa.com/save-card?\${bookingParams.toString()}\`;

              // Send SMS with the link if phone provided
              if (customerPhone) {
                const normalizedPhone = customerPhone.replace(/[^0-9+]/g,'').replace(/^([0-9]{10})$/,'+1$1');
                try {
                  await twilioClient.messages.create({
                    from: TWILIO_NUMBER,
                    to: normalizedPhone,
                    body: \`Hi \${customerName?.split(" ")[0] || "there"}! Here are the details for your Awaken Zen Spa appointment:\\n\\n\` +
                          \`📅 \${service.label}\\n\` +
                          \`🕐 \${displayDate} at \${displayTime}\\n\` +
                          \`📍 2830 E Brown Rd, Suite 10, Mesa AZ\\n\\n\` +
                          \`Tap the link to save a card on file and confirm your appointment (no charge today):\\n\` +
                          \`\${bookingUrl}\\n\\n\` +
                          \`Questions? Text (602) 688-2578 ✨\`
                  });
                } catch (smsErr) {
                  console.error("[chat] SMS send error:", smsErr.message);
                }
              }

              // Return the booking URL with a special marker so the widget renders a button
              toolResult = \`BOOKING_LINK:\${bookingUrl}||\${service.label} on \${displayDate} at \${displayTime} for \${customerName}.\`;
            }
          }
        }`;

code = code.replace(oldBooking, newBooking);

// ── 3. Update final response to extract and pass bookingLink separately ───────
const oldResponse = `    // ── Extract final text reply ──
    const reply = response.content.find(b => b.type === "text")?.text
      || "I'm sorry, something went wrong. Please reach us at (602) 688-2578.";
    // Strip internal SLOTS_DATA markers from reply
    const cleanReply = reply.replace(/\\[SLOTS_DATA:[^\\]]+\\]/g, "").trim();
    res.set(corsHeaders).json({ reply: cleanReply });`;

const newResponse = `    // ── Extract final text reply ──
    const rawReply = response.content.find(b => b.type === "text")?.text
      || "I'm sorry, something went wrong. Please reach us at (602) 688-2578.";

    // Strip SLOTS_DATA markers
    let cleanReply = rawReply.replace(/\\[SLOTS_DATA:[^\\]]+\\]/g, "").trim();

    // Extract BOOKING_LINK if present in any tool result message
    let bookingLink = null;
    for (const msg of toolMessages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_result" && typeof block.content === "string") {
            const match = block.content.match(/^BOOKING_LINK:(.+?)\\|\\|/);
            if (match) {
              bookingLink = match[1];
              break;
            }
          }
        }
      }
      if (bookingLink) break;
    }

    res.set(corsHeaders).json({ reply: cleanReply, bookingLink });`;

code = code.replace(oldResponse, newResponse);

fs.writeFileSync('index.js', code);
console.log('✓ index.js patched successfully');
console.log('');
console.log('Changes made:');
console.log('  1. Updated CHAT_SYSTEM booking flow instructions');
console.log('  2. book_appointment tool now builds URL instead of booking Square');
console.log('  3. Final response passes bookingLink separately to widget');
console.log('');
console.log('Next: git add -A && git commit -m "Chat booking: URL flow instead of direct Square" && git push');