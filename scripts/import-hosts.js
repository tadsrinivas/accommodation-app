/**
 * Import last year's hosts from an Excel file into Supabase.
 *
 * Expected columns (case-insensitive, flexible naming):
 *   name | email | phone | capacity | address | notes
 *
 * Required: name AND (email OR phone). Rows with neither contact method
 * are skipped. Extra columns are ignored silently.
 *
 * Idempotent: re-running with the same file updates existing hosts rather
 * than creating duplicates. Match key:
 *   - If email present: match on email
 *   - If no email: match on (name + phone)
 *
 * Usage:
 *   node scripts/import-hosts.js ./hosts.xlsx
 *   node scripts/import-hosts.js ./hosts.xlsx --dry-run
 */

require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!filePath) {
  console.error('Usage: node scripts/import-hosts.js <path-to-xlsx> [--dry-run]');
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

// ----- Header normalization -----
// Accepts variations like "Name", "Full Name", "Host Name" → "name"
const HEADER_MAP = {
  name: ['name', 'full name', 'host name', 'host'],
  email: ['email', 'email address', 'e-mail'],
  phone: ['phone', 'mobile', 'cell', 'phone number', 'contact', 'number'],
  capacity: ['capacity', 'max guests', 'beds', 'rooms', 'sleeps'],
  address: ['address', 'location', 'home address'],
  notes: ['notes', 'comments', 'remarks'],
};

function normalizeRow(row) {
  const out = {};
  const lowerMap = Object.fromEntries(Object.keys(row).map((k) => [k.trim().toLowerCase(), k]));

  for (const [canonical, aliases] of Object.entries(HEADER_MAP)) {
    for (const alias of aliases) {
      if (lowerMap[alias]) {
        out[canonical] = row[lowerMap[alias]];
        break;
      }
    }
  }
  return out;
}

function cleanPhone(phone) {
  if (!phone) return null;
  const s = String(phone).trim();
  if (!s) return null;
  // Strip everything that isn't a digit or '+'
  const cleaned = s.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  return cleaned;
}

function cleanEmail(email) {
  if (!email) return null;
  const s = String(email).trim().toLowerCase();
  return s || null;
}

function cleanString(s) {
  if (s === null || s === undefined) return null;
  const trimmed = String(s).trim();
  return trimmed || null;
}

async function findExistingHost(host) {
  // Match by email first (most reliable identifier)
  if (host.email) {
    const { data } = await supabase
      .from('hosts')
      .select('id')
      .eq('email', host.email)
      .maybeSingle();
    if (data) return data;
  }

  // Fallback: match on (name + phone) for hosts without email
  if (host.phone) {
    const { data } = await supabase
      .from('hosts')
      .select('id, name, phone')
      .is('email', null)
      .eq('phone', host.phone);
    // Loose name comparison (case-insensitive trim)
    const match = (data || []).find(
      (h) => (h.name || '').trim().toLowerCase() === host.name.trim().toLowerCase()
    );
    if (match) return match;
  }

  return null;
}

async function main() {
  console.log(`Reading ${filePath}...`);
  if (dryRun) console.log('--- DRY RUN: no database writes ---\n');

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  console.log(`Found ${rows.length} rows in sheet "${sheetName}"`);

  // Show what columns we recognized vs ignored
  if (rows.length > 0) {
    const firstRowKeys = Object.keys(rows[0]);
    const lowerKeys = firstRowKeys.map((k) => k.trim().toLowerCase());
    const recognized = [];
    const ignored = [];
    firstRowKeys.forEach((k, i) => {
      const lower = lowerKeys[i];
      const matched = Object.values(HEADER_MAP).flat().includes(lower);
      if (matched) recognized.push(k);
      else ignored.push(k);
    });
    console.log(`Recognized columns: ${recognized.join(', ') || '(none)'}`);
    if (ignored.length > 0) {
      console.log(`Ignored columns:    ${ignored.join(', ')}`);
    }
  }

  // Normalize and validate
  const skipped = [];
  const valid = [];
  rows.forEach((row, idx) => {
    const n = normalizeRow(row);
    const host = {
      name: cleanString(n.name),
      email: cleanEmail(n.email),
      phone: cleanPhone(n.phone),
      capacity: Number.parseInt(n.capacity, 10) || 1,
      address: cleanString(n.address),
      notes: cleanString(n.notes),
    };

    const reasons = [];
    if (!host.name) reasons.push('missing name');
    if (!host.email && !host.phone) reasons.push('missing both email and phone');

    if (reasons.length > 0) {
      skipped.push({ rowNum: idx + 2, name: host.name || '(blank)', reasons });
    } else {
      valid.push(host);
    }
  });

  console.log(`\nValid rows: ${valid.length}, Skipped: ${skipped.length}`);

  if (skipped.length > 0) {
    console.log('\nSkipped rows:');
    skipped.slice(0, 20).forEach((s) => {
      console.log(`  Row ${s.rowNum} [${s.name}]: ${s.reasons.join(', ')}`);
    });
    if (skipped.length > 20) console.log(`  ... and ${skipped.length - 20} more`);
  }

  if (dryRun) {
    console.log('\n--- DRY RUN: would have processed the following ---');
    valid.slice(0, 5).forEach((h, i) => {
      console.log(`\n[${i + 1}] ${h.name}`);
      console.log(`    email:    ${h.email || '(none)'}`);
      console.log(`    phone:    ${h.phone || '(none)'}`);
      console.log(`    capacity: ${h.capacity}`);
      console.log(`    address:  ${h.address ? h.address.slice(0, 50) + (h.address.length > 50 ? '...' : '') : '(none)'}`);
    });
    if (valid.length > 5) console.log(`\n... and ${valid.length - 5} more rows`);
    console.log('\nRun again without --dry-run to actually import.');
    return;
  }

  let inserted = 0;
  let updated = 0;
  let failed = 0;
  const errors = [];

  for (const host of valid) {
    const existing = await findExistingHost(host);

    if (existing) {
      const { error } = await supabase
        .from('hosts')
        .update({
          name: host.name,
          phone: host.phone,
          capacity: host.capacity,
          address: host.address,
          notes: host.notes,
          // Don't update email here — if existing record had no email and
          // import row has one, that's a meaningful change worth a separate update.
          ...(host.email && !existing.email ? { email: host.email } : {}),
        })
        .eq('id', existing.id);
      if (error) {
        failed++;
        errors.push(`${host.name} (${host.email || host.phone}): ${error.message}`);
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from('hosts').insert(host);
      if (error) {
        failed++;
        errors.push(`${host.name} (${host.email || host.phone}): ${error.message}`);
      } else {
        inserted++;
      }
    }
  }

  console.log('\n=== Import Summary ===');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Skipped:  ${skipped.length} (see above for reasons)`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach((e) => console.log(`  ! ${e}`));
    if (errors.length > 10) console.log(`  ... and ${errors.length - 10} more`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
