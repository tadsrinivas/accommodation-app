import twilio from 'twilio';
import { supabaseAdmin } from './supabase';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

interface SendSmsArgs {
  to: string;
  body: string;
  recipientType: 'host' | 'guest';
  recipientId: string;
  purpose: string;
}

export async function sendSms(args: SendSmsArgs) {
  try {
    const result = await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: args.to,
      body: args.body,
    });

    await supabaseAdmin.from('notifications').insert({
      recipient_type: args.recipientType,
      recipient_id: args.recipientId,
      channel: 'sms',
      purpose: args.purpose,
      success: true,
      provider_id: result.sid,
    });

    return { ok: true, id: result.sid };
  } catch (err: any) {
    await supabaseAdmin.from('notifications').insert({
      recipient_type: args.recipientType,
      recipient_id: args.recipientId,
      channel: 'sms',
      purpose: args.purpose,
      success: false,
      error_message: err?.message ?? String(err),
    });
    return { ok: false, error: err?.message ?? String(err) };
  }
}

/**
 * Returns the prefix used for all outbound SMS messages.
 * Reads SMS_PREFIX (compact label for SMS), falling back to EVENT_NAME
 * (full name used in emails), and finally to 'Event'.
 *
 * Example: SMS_PREFIX="Evt2025" → "Evt2025: ..."
 *          EVENT_NAME="Annual Community Event" (no SMS_PREFIX) → "Annual Community Event: ..."
 */
export function smsPrefix(): string {
  return process.env.SMS_PREFIX || process.env.EVENT_NAME || 'Event';
}

/**
 * Wrap an SMS body with the configured prefix. Use this for every outbound
 * SMS so messages have a consistent recognizable format for recipients.
 *
 *   smsBody("Tap to update your request: https://...")
 *   → "Evt2025: Tap to update your request: https://..."
 */
export function smsBody(message: string): string {
  return `${smsPrefix()}: ${message}`;
}

export function hostReconfirmSms(hostName: string, link: string) {
  return smsBody(`Hi ${hostName}, can you host again this year? Please confirm here: ${link}`);
}

export function matchProposedSms(role: 'host' | 'guest', link: string) {
  if (role === 'host') {
    return smsBody(`You have a guest match proposal. Review & respond: ${link}`);
  }
  return smsBody(`Your accommodation match is ready. Confirm here: ${link}`);
}
