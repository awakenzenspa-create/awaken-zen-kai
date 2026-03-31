/**
 * AZS — Square Customer Import
 * file: jobs/squareCustomerImport.js
 *
 * Imports all Square customers into the Supabase clients table.
 * Safe to run multiple times — uses square_customer_id as the conflict key.
 * Existing records are NOT overwritten (we preserve any manual data you've added).
 *
 * Trigger:
 *   POST /flash-fill/import-customers  (one-time / as-needed, staff portal)
 *   or: node jobs/squareCustomerImport.js  (run directly from terminal)
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQUARE_BASE    = "https://connect.squareup.com/v2";
const SQUARE_TOKEN   = process.env.SQUARE_ACCESS_TOKEN;
const SQUARE_VERSION = "2024-01-18";

// ─── Main export ──────────────────────────────────────────────────────────────

async function runSquareCustomerImport() {
  const log = makeLogger();
  log.info("=== Square Customer Import Started ===");

  try {
    // 1. Fetch all Square customers (paginated)
    const customers = await fetchAllSquareCustomers(log);
    log.info(`Fetched ${customers.length} customers from Square`);

    // 2. Find which square_customer_ids already exist in Supabase
    const existingIds = await getExistingSquareIds(log);
    log.info(`${existingIds.size} customers already in Supabase clients table`);

    // 3. Filter to only new customers
    const newCustomers = customers.filter(c => !existingIds.has(c.id));
    log.info(`${newCustomers.length} new customers to import`);

    if (newCustomers.length === 0) {
      log.info("Nothing to import — all Square customers already in Supabase");
      return { imported: 0, skipped: customers.length, log: log.entries };
    }

    // 4. Map Square customer fields → Supabase clients schema
    const rows = newCustomers.map(c => mapSquareToClient(c)).filter(Boolean);
    log.info(`Mapped ${rows.length} valid rows (filtered ${newCustomers.length - rows.length} with no name/contact)`);

    // 5. Batch insert in chunks of 100
    const imported = await batchInsert(rows, log);

    log.info(`=== Import complete: ${imported} imported, ${customers.length - imported} skipped ===`);
    return { imported, skipped: customers.length - imported, log: log.entries };

  } catch (err) {
    log.error(`Import failed: ${err.message}`);
    throw err;
  }
}

// ─── Step 1: Fetch all Square customers (paginated) ───────────────────────────

async function fetchAllSquareCustomers(log) {
  const customers = [];
  let cursor = null;

  do {
    // Use POST /customers/search — handles cursor pagination cleanly
    const body = { limit: 100 };
    if (cursor) body.cursor = cursor;

    const res = await fetch(`${SQUARE_BASE}/customers/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SQUARE_TOKEN}`,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Square Customers API ${res.status}: ${await res.text()}`);

    const data = await res.json();
    (data.customers || []).forEach(c => customers.push(c));
    cursor = data.cursor || null;

    log.info(`  Fetched batch of ${data.customers?.length || 0} (total: ${customers.length})`);
  } while (cursor);

  return customers;
}

// ─── Step 2: Get existing square_customer_ids from Supabase ──────────────────

async function getExistingSquareIds(log) {
  const { data, error } = await supabase
    .from("clients")
    .select("square_customer_id")
    .not("square_customer_id", "is", null);

  if (error) throw new Error(`Could not fetch existing clients: ${error.message}`);
  return new Set((data || []).map(c => c.square_customer_id));
}

// ─── Step 3: Map Square customer → Supabase clients row ──────────────────────

function mapSquareToClient(c) {
  // Must have at least a name
  const firstName = c.given_name?.trim() || c.company_name?.trim() || null;
  if (!firstName) return null;

  // Clean phone — Square stores in various formats
  const rawPhone = c.phone_number || null;
  const phone    = rawPhone ? normalizePhone(rawPhone) : null;

  return {
    square_customer_id: c.id,
    first_name:         firstName,
    last_name:          c.family_name?.trim() || null,
    email:              c.email_address?.trim()?.toLowerCase() || null,
    phone,
    // Map Square reference_id or note fields if present
    therapist_notes:    c.note?.trim() || null,
    // Square creation date as the record's created_at
    created_at:         c.created_at || new Date().toISOString(),
    updated_at:         new Date().toISOString(),
  };
}

// Normalize phone to E.164 format (+1XXXXXXXXXX)
function normalizePhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw; // return as-is if we can't normalize
}

// ─── Step 4: Batch insert in chunks of 100 ───────────────────────────────────

async function batchInsert(rows, log) {
  const CHUNK = 100;
  let imported = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    const { data, error } = await supabase
      .from("clients")
      .insert(chunk, { returning: "minimal" });

    if (error) {
      // Log but don't throw — partial success is better than full abort
      log.warn(`Chunk ${Math.floor(i / CHUNK) + 1} insert error: ${error.message}`);
    } else {
      imported += chunk.length;
      log.info(`  Inserted chunk ${Math.floor(i / CHUNK) + 1}: ${chunk.length} rows (total: ${imported})`);
    }
  }

  return imported;
}

// ─── Logger ───────────────────────────────────────────────────────────────────

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

// ─── Standalone runner (node jobs/squareCustomerImport.js) ────────────────────

if (require.main === module) {
  (async () => {
    try {
      const r = await runSquareCustomerImport();
      console.log("Result:", JSON.stringify({ imported: r.imported, skipped: r.skipped }));
      process.exit(0);
    } catch (e) {
      console.error("Fatal:", e.message);
      process.exit(1);
    }
  })();
}

module.exports = { runSquareCustomerImport };
