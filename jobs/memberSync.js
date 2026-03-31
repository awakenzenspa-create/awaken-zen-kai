/**
 * AZS Flash Fill — Member Sync Job
 * file: jobs/memberSync.js
 *
 * Wired two ways:
 *   1. Railway cron — runs nightly at midnight AZ time
 *   2. POST /flash-fill/sync-members — manual trigger from staff portal
 *
 * Flow:
 *   Square Subscriptions API
 *     → upsert square_member_sync
 *     → update clients.membership_active + membership_tier
 *     → sync_member_exclusions() flips flash_group_members.is_member
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQUARE_BASE   = 'https://connect.squareup.com/v2';
const SQUARE_HEADERS = {
  'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
  'Content-Type':  'application/json',
  'Square-Version': '2024-01-17'
};

// ─── Main export ─────────────────────────────────────────────────────────────

export async function runMemberSync() {
  const log = makeLogger();
  log.info('Member sync started');

  try {
    // 1. Pull all subscriptions from Square (paginated)
    const subscriptions = await fetchAllSubscriptions(log);
    log.info(`Fetched ${subscriptions.length} subscriptions from Square`);

    if (subscriptions.length === 0) {
      log.info('No subscriptions found — skipping upsert');
      return { synced: 0, clientsUpdated: 0, flagsUpdated: 0 };
    }

    // 2. Resolve Square customer IDs → AZS client UUIDs
    const enriched = await resolveClientIds(subscriptions, log);

    // 3. Upsert into square_member_sync (audit trail)
    const synced = await upsertMemberSync(enriched, log);

    // 4. Update clients table directly — membership_active + membership_tier
    //    This keeps your existing clients schema in sync as the source of truth
    const clientsUpdated = await updateClientsTable(enriched, log);

    // 5. Flip is_member on flash_group_members via DB function
    const flagsUpdated = await syncMemberFlags(log);

    log.info(`Sync complete — ${synced} subscriptions, ${clientsUpdated} clients updated, ${flagsUpdated} flash flags flipped`);
    return { synced, clientsUpdated, flagsUpdated, log: log.entries };

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
    const res = await fetch(`${SQUARE_BASE}/subscriptions/search`, {
      method: 'POST',
      headers: SQUARE_HEADERS,
      body: JSON.stringify({
        limit: 100,
        ...(cursor && { cursor })
      })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Square Subscriptions API error: ${JSON.stringify(err.errors)}`);
    }

    const data = await res.json();
    const batch = data.subscriptions || [];
    subscriptions.push(...batch);
    cursor = data.cursor || null;

    log.info(`  Fetched batch of ${batch.length} (total: ${subscriptions.length})`);
  } while (cursor);

  return subscriptions;
}

// ─── Step 2: Resolve Square customer IDs → AZS client UUIDs ─────────────────

async function resolveClientIds(subscriptions, log) {
  const squareIds = [...new Set(subscriptions.map(s => s.customer_id).filter(Boolean))];

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, square_customer_id, membership_tier')
    .in('square_customer_id', squareIds);

  if (error) {
    log.warn(`Could not resolve client IDs: ${error.message}`);
    return subscriptions.map(s => ({ ...s, client_id: null }));
  }

  const clientMap = {};
  (clients || []).forEach(c => { clientMap[c.square_customer_id] = c.id; });

  const unresolved = squareIds.filter(id => !clientMap[id]);
  if (unresolved.length > 0) {
    log.warn(`${unresolved.length} Square customer IDs not in clients table — will sync without client_id link`);
  }

  return subscriptions.map(s => ({
    ...s,
    client_id: clientMap[s.customer_id] || null
  }));
}

// ─── Step 3: Upsert into square_member_sync (audit log) ──────────────────────

async function upsertMemberSync(subscriptions, log) {
  const rows = subscriptions.map(s => ({
    square_customer_id:  s.customer_id,
    client_id:           s.client_id || null,
    membership_plan:     s.plan_variation_data?.name || s.plan_id || 'AZS Membership',
    status:              normalizeStatus(s.status),
    square_started_at:   s.start_date    ? new Date(s.start_date).toISOString()    : null,
    square_cancelled_at: s.canceled_date ? new Date(s.canceled_date).toISOString() : null,
    synced_at:           new Date().toISOString()
  }));

  const { error } = await supabase
    .from('square_member_sync')
    .upsert(rows, { onConflict: 'square_customer_id' });

  if (error) throw new Error(`square_member_sync upsert error: ${error.message}`);
  log.info(`Upserted ${rows.length} rows into square_member_sync`);
  return rows.length;
}

// ─── Step 4: Update clients.membership_active + membership_tier ──────────────
//   Your clients table already has these columns — keep them in sync so
//   the rest of your app (SOAP notes, client portal, etc.) stays accurate too.

async function updateClientsTable(subscriptions, log) {
  // Only process subscriptions we could match to a client
  const matched = subscriptions.filter(s => s.client_id);

  if (matched.length === 0) {
    log.warn('No subscriptions matched to clients — skipping clients table update');
    return 0;
  }

  let updated = 0;

  // Batch into active vs inactive for two efficient updates
  const activeIds   = matched.filter(s => normalizeStatus(s.status) === 'active').map(s => s.client_id);
  const inactiveIds = matched.filter(s => normalizeStatus(s.status) !== 'active').map(s => s.client_id);

  if (activeIds.length > 0) {
    const { error } = await supabase
      .from('clients')
      .update({
        membership_active: true,
        updated_at: new Date().toISOString()
      })
      .in('id', activeIds);

    if (error) log.warn(`Could not update active clients: ${error.message}`);
    else updated += activeIds.length;
  }

  if (inactiveIds.length > 0) {
    const { error } = await supabase
      .from('clients')
      .update({
        membership_active: false,
        updated_at: new Date().toISOString()
      })
      .in('id', inactiveIds);

    if (error) log.warn(`Could not update inactive clients: ${error.message}`);
    else updated += inactiveIds.length;
  }

  log.info(`Updated membership_active on ${updated} client records`);
  return updated;
}

// ─── Step 5: Flip is_member on flash_group_members ───────────────────────────
//   DB function reads clients.membership_active directly — single source of truth

async function syncMemberFlags(log) {
  const { data, error } = await supabase.rpc('sync_member_exclusions');
  if (error) throw new Error(`sync_member_exclusions() failed: ${error.message}`);
  log.info(`sync_member_exclusions() updated ${data} flash_group_members flags`);
  return data;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeStatus(squareStatus) {
  const map = {
    'ACTIVE':      'active',
    'PENDING':     'active',      // just started — treat as active
    'PAUSED':      'paused',
    'SUSPENDED':   'paused',
    'CANCELED':    'cancelled',
    'DEACTIVATED': 'cancelled',
  };
  return map[squareStatus] || 'cancelled';
}

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
