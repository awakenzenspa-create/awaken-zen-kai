/**
 * AZS Flash Fill — Member Sync Job
 * file: jobs/memberSync.js
 *
 * Wired two ways:
 *   1. Railway cron — runs nightly at midnight
 *   2. POST /flash-fill/sync-members — manual trigger from staff portal
 *
 * Flow:
 *   Square Subscriptions API → upsert square_member_sync → sync_member_exclusions()
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // service role — bypasses RLS for cron writes
);

const SQUARE_BASE = 'https://connect.squareup.com/v2';
const SQUARE_HEADERS = {
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
  'Square-Version': '2024-01-17'
};

// ─── Main export ─────────────────────────────────────────────────────────────

export async function runMemberSync() {
  const log = makeLogger();
  log.info('Member sync started');

  try {
    // 1. Pull all subscriptions from Square
    const subscriptions = await fetchAllSubscriptions(log);
    log.info(`Fetched ${subscriptions.length} subscriptions from Square`);

    if (subscriptions.length === 0) {
      log.info('No subscriptions found — skipping upsert');
      return { synced: 0, flagsUpdated: 0 };
    }

    // 2. Resolve Square customer IDs → AZS client IDs
    const enriched = await resolveClientIds(subscriptions, log);

    // 3. Upsert into square_member_sync
    const synced = await upsertMemberSync(enriched, log);

    // 4. Call DB function to flip is_member flags on flash_group_members
    const flagsUpdated = await syncMemberFlags(log);

    log.info(`Sync complete — ${synced} subscriptions upserted, ${flagsUpdated} member flags updated`);

    return { synced, flagsUpdated, log: log.entries };

  } catch (err) {
    log.error(`Member sync failed: ${err.message}`);
    throw err;
  }
}

// ─── Step 1: Fetch all Square subscriptions (paginated) ──────────────────────

async function fetchAllSubscriptions(log) {
  const subscriptions = [];
  let cursor = null;

  do {
    const body = {
      limit: 100,
      ...(cursor && { cursor })
    };

    const res = await fetch(`${SQUARE_BASE}/subscriptions/search`, {
      method: 'POST',
      headers: SQUARE_HEADERS,
      body: JSON.stringify({ query: {}, limit: 100, ...(cursor && { cursor }) })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Square Subscriptions API error: ${JSON.stringify(err.errors)}`);
    }

    const data = await res.json();
    const batch = data.subscriptions || [];
    subscriptions.push(...batch);
    cursor = data.cursor || null;

    log.info(`  Fetched batch of ${batch.length} (total so far: ${subscriptions.length})`);

  } while (cursor);

  return subscriptions;
}

// ─── Step 2: Resolve Square customer IDs to AZS client UUIDs ─────────────────

async function resolveClientIds(subscriptions, log) {
  // Get all square_customer_ids we need to resolve
  const squareIds = [...new Set(subscriptions.map(s => s.customer_id).filter(Boolean))];

  // Batch lookup from clients table
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, square_customer_id')
    .in('square_customer_id', squareIds);

  if (error) {
    log.warn(`Could not resolve client IDs: ${error.message}`);
    return subscriptions.map(s => ({ ...s, client_id: null }));
  }

  const clientMap = {};
  (clients || []).forEach(c => { clientMap[c.square_customer_id] = c.id; });

  const unresolved = squareIds.filter(id => !clientMap[id]);
  if (unresolved.length > 0) {
    log.warn(`${unresolved.length} Square customer IDs not found in clients table — they will sync without client_id link`);
  }

  return subscriptions.map(s => ({
    ...s,
    client_id: clientMap[s.customer_id] || null
  }));
}

// ─── Step 3: Upsert into square_member_sync ───────────────────────────────────

async function upsertMemberSync(subscriptions, log) {
  const rows = subscriptions.map(s => ({
    square_customer_id:  s.customer_id,
    client_id:           s.client_id || null,
    membership_plan:     s.plan_variation_data?.name || s.plan_id || 'AZS Membership',
    status:              normalizeStatus(s.status),
    square_started_at:   s.start_date ? new Date(s.start_date).toISOString() : null,
    square_cancelled_at: s.canceled_date ? new Date(s.canceled_date).toISOString() : null,
    synced_at:           new Date().toISOString()
  }));

  const { error } = await supabase
    .from('square_member_sync')
    .upsert(rows, { onConflict: 'square_customer_id' });

  if (error) throw new Error(`Supabase upsert error: ${error.message}`);

  log.info(`Upserted ${rows.length} rows into square_member_sync`);
  return rows.length;
}

// Square subscription statuses → our normalized values
function normalizeStatus(squareStatus) {
  const map = {
    'ACTIVE':             'active',
    'CANCELED':           'cancelled',
    'PAUSED':             'paused',
    'PENDING':            'active',     // treat pending as active (just started)
    'DEACTIVATED':        'cancelled',
    'SUSPENDED':          'paused',
  };
  return map[squareStatus] || 'cancelled';
}

// ─── Step 4: Flip is_member flags via DB function ─────────────────────────────

async function syncMemberFlags(log) {
  const { data, error } = await supabase
    .rpc('sync_member_exclusions');

  if (error) throw new Error(`sync_member_exclusions() failed: ${error.message}`);

  // Returns count of newly excluded members
  log.info(`sync_member_exclusions() updated ${data} member flags`);
  return data;
}

// ─── Logger ──────────────────────────────────────────────────────────────────

function makeLogger() {
  const entries = [];
  const stamp = () => new Date().toISOString();

  return {
    entries,
    info:  (msg) => { const e = `[INFO]  ${stamp()} ${msg}`; entries.push(e); console.log(e); },
    warn:  (msg) => { const e = `[WARN]  ${stamp()} ${msg}`; entries.push(e); console.warn(e); },
    error: (msg) => { const e = `[ERROR] ${stamp()} ${msg}`; entries.push(e); console.error(e); },
  };
}
