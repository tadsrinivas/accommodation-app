/**
 * Helpers for the voice intake flow.
 */

export function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Parse 4-digit MMDD entered by caller into an ISO date for the event year.
 * Returns null if invalid.
 *
 * The "event year" comes from EVENT_DATES env var if it contains a 4-digit year,
 * otherwise current year (or next year if the date has passed).
 */
export function parseMMDD(digits: string, referenceYear?: number): string | null {
  if (!digits || digits.length !== 4 || !/^\d{4}$/.test(digits)) return null;
  const month = parseInt(digits.slice(0, 2), 10);
  const day = parseInt(digits.slice(2, 4), 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  const year = referenceYear ?? inferEventYear();
  // Validate the date actually exists (e.g. reject Feb 30)
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return null;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function inferEventYear(): number {
  const envDates = process.env.EVENT_DATES || '';
  const yearMatch = envDates.match(/(20\d{2})/);
  if (yearMatch) return parseInt(yearMatch[1], 10);
  // Fallback: current year, or next year if we're past June
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

/**
 * Light cleanup of speech transcripts.
 * Twilio STT often returns sentences with periods, capitalization quirks.
 */
export function cleanSpokenName(raw: string): string {
  return raw
    .replace(/[.!?,]+$/g, '')        // trailing punctuation
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Pretty-format a date string for speaking back to the caller.
 * "2026-08-15" → "August 15th"
 */
export function speakableDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, , mm, dd] = m;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const month = monthNames[parseInt(mm, 10) - 1] || mm;
  const day = parseInt(dd, 10);
  return `${month} ${day}`;
}
