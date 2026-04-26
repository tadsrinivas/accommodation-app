import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { sendEmail } from './email';
import { sendSms } from './sms';

export type VerifyChannel = 'email' | 'sms';
export type VerifyIntent = 'guest_form' | 'host_signup' | 'intake_complete';

const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_CODES_PER_DESTINATION_PER_WINDOW = 3;

function generateCode(): string {
  // 6-digit zero-padded; first digit non-zero so it's always 6 chars when displayed
  const n = crypto.randomInt(100000, 1000000);
  return String(n);
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Issue a verification code to the given destination via email or SMS.
 * Returns { ok: true } on success or { ok: false, error: string } on failure.
 *
 * Rate-limits: at most N codes per destination per minute.
 */
export async function issueVerificationCode(args: {
  channel: VerifyChannel;
  destination: string;
  intent: VerifyIntent;
}): Promise<{ ok: boolean; error?: string }> {
  const dest = args.destination.trim().toLowerCase();
  if (!dest) return { ok: false, error: 'Missing destination' };

  // Rate limiting
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('verification_codes')
    .select('id', { count: 'exact', head: true })
    .eq('destination', dest)
    .eq('intent', args.intent)
    .gte('created_at', since);

  if ((count ?? 0) >= MAX_CODES_PER_DESTINATION_PER_WINDOW) {
    return { ok: false, error: 'Too many requests. Please wait a minute and try again.' };
  }

  const code = generateCode();
  const code_hash = hashCode(code);
  const expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { error: insertErr } = await supabaseAdmin
    .from('verification_codes')
    .insert({
      channel: args.channel,
      destination: dest,
      code_hash,
      intent: args.intent,
      expires_at,
    });

  if (insertErr) return { ok: false, error: insertErr.message };

  const eventName = process.env.EVENT_NAME || 'our event';

  if (args.channel === 'email') {
    const result = await sendEmail({
      to: dest,
      subject: `${eventName}: Your verification code`,
      html: `<p>Your code is <strong style="font-size:24px">${code}</strong></p><p>It expires in 15 minutes. If you didn&apos;t request this, you can ignore this email.</p>`,
      text: `Your code is ${code}. It expires in 15 minutes.`,
      recipientType: 'guest', // generic
      recipientId: '00000000-0000-0000-0000-000000000000',
      purpose: `verify_${args.intent}`,
    });
    if (!result.ok) return { ok: false, error: 'Could not send verification email.' };
  } else {
    const result = await sendSms({
      to: dest,
      body: `${eventName}: your verification code is ${code}. It expires in 15 minutes.`,
      recipientType: 'guest',
      recipientId: '00000000-0000-0000-0000-000000000000',
      purpose: `verify_${args.intent}`,
    });
    if (!result.ok) return { ok: false, error: 'Could not send verification SMS.' };
  }

  return { ok: true };
}

/**
 * Verify a submitted code. Marks the code as consumed on success so it
 * can't be reused. Increments attempts on failure.
 */
export async function verifyCode(args: {
  channel: VerifyChannel;
  destination: string;
  intent: VerifyIntent;
  code: string;
}): Promise<{ ok: boolean; error?: string }> {
  const dest = args.destination.trim().toLowerCase();
  const code = args.code.trim();

  if (!/^\d{6}$/.test(code)) return { ok: false, error: 'Code must be 6 digits.' };

  const { data, error } = await supabaseAdmin
    .from('verification_codes')
    .select('id, code_hash, attempts, max_attempts, expires_at, consumed_at')
    .eq('destination', dest)
    .eq('intent', args.intent)
    .eq('channel', args.channel)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'No active code found. Request a new one.' };

  if (new Date(data.expires_at) < new Date()) {
    return { ok: false, error: 'Code has expired. Request a new one.' };
  }
  if (data.attempts >= data.max_attempts) {
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  const submittedHash = hashCode(code);
  if (submittedHash !== data.code_hash) {
    await supabaseAdmin
      .from('verification_codes')
      .update({ attempts: data.attempts + 1 })
      .eq('id', data.id);
    return { ok: false, error: 'Incorrect code.' };
  }

  await supabaseAdmin
    .from('verification_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', data.id);

  return { ok: true };
}
