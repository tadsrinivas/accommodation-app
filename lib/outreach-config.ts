/**
 * Outreach configuration — parsed once at module load.
 *
 * Env vars:
 *   OUTREACH_STAGE_DELAY_DAYS     — number, default 2. Days between each stage.
 *   OUTREACH_CHANNEL_SEQUENCE     — comma-separated, default "sms+email,sms,email,voice"
 *                                    Allowed channels: "sms", "email", "sms+email", "voice"
 *
 * Both are validated. Bad values fall back to defaults with a console warning.
 *
 * When a future dashboard UI is added, this module is the only file
 * that needs to change — point loadConfig() at a DB row instead of env vars.
 */

export type OutreachChannel = 'sms' | 'email' | 'sms+email' | 'voice';

export const VALID_CHANNELS: ReadonlyArray<OutreachChannel> = [
  'sms',
  'email',
  'sms+email',
  'voice',
];

export interface OutreachConfig {
  delayDays: number;
  delayMs: number;
  sequence: OutreachChannel[];
}

const DEFAULT_DELAY_DAYS = 2;
const DEFAULT_SEQUENCE: OutreachChannel[] = ['sms+email', 'sms', 'email', 'voice'];

const HOURS_MS = 60 * 60 * 1000;

function parseDelayDays(raw: string | undefined): number {
  if (!raw) return DEFAULT_DELAY_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 30) {
    console.warn(
      `[outreach config] Invalid OUTREACH_STAGE_DELAY_DAYS="${raw}". Falling back to ${DEFAULT_DELAY_DAYS}.`
    );
    return DEFAULT_DELAY_DAYS;
  }
  return n;
}

function parseSequence(raw: string | undefined): OutreachChannel[] {
  if (!raw) return DEFAULT_SEQUENCE;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean) as OutreachChannel[];

  if (parts.length === 0) {
    console.warn(
      `[outreach config] OUTREACH_CHANNEL_SEQUENCE is empty. Falling back to default.`
    );
    return DEFAULT_SEQUENCE;
  }

  for (const p of parts) {
    if (!VALID_CHANNELS.includes(p)) {
      console.warn(
        `[outreach config] Invalid channel "${p}" in OUTREACH_CHANNEL_SEQUENCE. ` +
        `Valid values: ${VALID_CHANNELS.join(', ')}. Falling back to default sequence.`
      );
      return DEFAULT_SEQUENCE;
    }
  }
  return parts;
}

export function loadConfig(): OutreachConfig {
  const delayDays = parseDelayDays(process.env.OUTREACH_STAGE_DELAY_DAYS);
  const sequence = parseSequence(process.env.OUTREACH_CHANNEL_SEQUENCE);
  return {
    delayDays,
    delayMs: delayDays * 24 * HOURS_MS,
    sequence,
  };
}

// Module-level singleton; loaded once per process. If env changes, restart.
export const outreachConfig: OutreachConfig = loadConfig();
