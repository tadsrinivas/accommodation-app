/**
 * Centralized voice configuration. Change here once → all prompts update.
 *
 * To change voices, edit VOICE below or set TWILIO_VOICE in env.
 * Both standard and neural voices are supported. Neural voices like
 * Polly.Kajal-Neural sound more natural but cost slightly more per call.
 */

export const VOICE = process.env.TWILIO_VOICE || 'Polly.Kajal-Neural';

import { escapeXml } from './voice-intake';

/**
 * Wrap text in a <Say> tag using the configured voice.
 * Use `say(text)` instead of writing `<Say voice="...">${text}</Say>` by hand.
 *
 * Note: this DOES NOT XML-escape the text. Pass already-escaped strings
 * if they contain user input (use escapeXml for variables that come
 * from user data — names, dates, etc.).
 */
export function say(text: string): string {
  return `<Say voice="${VOICE}">${text}</Say>`;
}

/** Escape user-provided text safely for use inside say() */
export function safeSay(text: string): string {
  return say(escapeXml(text));
}
