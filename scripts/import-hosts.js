/**
 * Import last year's hosts from an Excel file into Supabase.
 *
 * Expected columns (case-insensitive, flexible naming):
 *   name | email | phone | capacity | address | notes
 *
 * Usage:
 *   node scripts/import-hosts.js ./hosts.xlsx
 */

require('dotenv').config({ path: '.env.local' });
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/import-hosts.js <path-to-xlsx>');
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
  // Keep digits, +, and spaces. If it starts with a digit, assume it needs a +
  const cleaned = s.replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  // If no country code, return as-is — coordinator can fix later
  return cleaned.startsWith('+') ? cleaned : cleaned;
}

async function main() {
  console.log(`Reading ${filePath}...`);
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
  console.log(`Found ${rows.length} rows in sheet "${sheetName}"`);

  const normalized = rows.map(normalizeRow).filter((r) => r.name && r.email);
  console.log(`${normalized.length} rows have required fields (name, email)`);

  let inserted = 0;
  let skipped = 0;
  let updated = 0;

  for (const row of normalized) {
    const host = {
      name: String(row.name).trim(),
      email: String(row.email).trim().toLowerCase(),
      phone: cleanPhone(row.phone),
      capacity: Number.parseInt(row.capacity, 10) || 1,
      address: row.address ? String(row.address).trim() : null,
      notes: row.notes ? String(row.notes).trim() : null,
    };

    // Check if host already exists by email (idempotent re-runs)
    const { data: existing } = await supabase
      .from('hosts')
      .select('id')
      .eq('email', host.email)
      .maybeSingle();

    if (existing) {
      // Update existing record (but don't touch confirmation state)
      const { error } = await supabase
        .from('hosts')
        .update({
          name: host.name,
          phone: host.phone,
          capacity: host.capacity,
          address: host.address,
          notes: host.notes,
        })
        .eq('id', existing.id);
      if (error) {
        console.error(`  ! Failed to update ${host.email}: ${error.message}`);
        skipped++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from('hosts').insert(host);
      if (error) {
        console.error(`  ! Failed to insert ${host.email}: ${error.message}`);
        skipped++;
      } else {
        inserted++;
      }
    }
  }

  console.log('\nDone.');
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
