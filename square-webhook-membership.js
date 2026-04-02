const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const SQUARE_WEBHOOK_SIGNATURE_KEY = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MEMBER_DISCOUNT_NAMES = ['member service','membership service','zen core service','member redemption'];
function verifySquareSignature(body, signature, url) {
  if (!SQUARE_WEBHOOK_SIGNATURE_KEY) return true;
  const hmac = crypto.createHmac('sha256', SQUARE_WEBHOOK_SIGNATURE_KEY);
  hmac.update(url + body);
  const expected = hmac.digest('base64');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
async function handleSquareWebhook(req, res) {
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const sig = req.headers['x-square-hmacsha256-signature'] || '';
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  if (!verifySquareSignature(rawBody, sig, url)) return res.status(401).json({ error: 'Invalid signature' });
  const event = req.body;
  const type = event?.type;
  const isPaymentEvent = type === 'payment.updated' || type === 'payment.created';
  if (!isPaymentEvent) return res.status(200).json({ ok: true, skipped: type });
  const paymentStatus = event?.data?.object?.payment?.status;
  if (paymentStatus !== 'COMPLETED') return res.status(200).json({ ok: true, skipped: `status: ${paymentStatus}` });
  const payment = event?.data?.object?.payment;
  const customerId = payment?.customer_id;
  const orderId = payment?.order_id;
  if (!customerId) return res.status(200).json({ ok: true, skipped: 'no customer_id' });
  const discounts = extractDiscounts(payment);
  const isMemberRedemption = discounts.some(d => MEMBER_DISCOUNT_NAMES.some(name => (d.name || '').toLowerCase().includes(name)));
  if (!isMemberRedemption) return res.status(200).json({ ok: true, skipped: 'no member discount' });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: member } = await sb.from('square_member_sync').select('*').eq('square_customer_id', customerId).maybeSingle();
  if (!member) return res.status(200).json({ ok: true, skipped: 'no member record' });
  if (member.status !== 'active' && member.status !== 'paused') return res.status(200).json({ ok: true, skipped: 'member not active' });
  const serviceName = extractServiceName(payment) || 'Member Service';
  const now = new Date().toISOString();
  const newBanked = Math.max(0, (member.banked_services || 0) - 1);
  const shouldAutoPause = newBanked >= 3;
  const memberUpdates = { banked_services: newBanked, last_booked_at: now, synced_at: now };
  if (shouldAutoPause && member.status === 'active') { memberUpdates.status = 'paused'; memberUpdates.pause_reason = 'auto_banked_limit'; memberUpdates.auto_paused_at = now; }
  await sb.from('square_member_sync').update(memberUpdates).eq('square_customer_id', customerId);
  await sb.from('membership_transactions').insert({ client_id: member.client_id, transaction_type: 'redemption', amount: 0, description: 'Member service redemption', service_name: serviceName, payment_status: 'collected', transaction_date: now, note: `Square order: ${orderId || 'unknown'}` });
  return res.status(200).json({ ok: true, service: serviceName, banked_now: newBanked, auto_paused: !!shouldAutoPause });
}
function extractDiscounts(payment) {
  const discounts = [];
  (payment?.line_items || []).forEach(item => (item.discounts || []).forEach(d => discounts.push(d)));
  (payment?.discounts || []).forEach(d => discounts.push(d));
  (payment?.applied_discounts || []).forEach(d => discounts.push(d));
  return discounts;
}
function extractServiceName(payment) {
  const item = (payment?.line_items || []).find(i => !i.item_type || i.item_type === 'ITEM');
  return item?.name || null;
}
module.exports = { handleSquareWebhook };
