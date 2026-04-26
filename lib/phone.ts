/**
 * Phone number normalization for caller-ID matching.
 *
 * Goal: match a user's phone-on-file to the caller ID Twilio gives us,
 * even when one is formatted "404-555-1234" and the other is "+14045551234".
 *
 * Strategy: strip all non-digits, then compare last 10 digits (US-centric;
 * adjust if internationalizing).
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  // Use last 10 digits for matching — handles country code variations
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return Boolean(na) && na === nb;
}
