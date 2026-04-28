/**
 * Dual-channel notification helper.
 *
 * Sends the same logical message via email AND SMS in parallel. Use this for
 * any time-sensitive notification where we want resilience against either
 * channel failing — e.g. SMS during A2P registration delays, or email going
 * to spam.
 *
 * Returns combined status: ok=true if at least one channel succeeded.
 */

import { sendEmail } from './email';
import { sendSms } from './sms';

export interface NotifyArgs {
  // Recipient details
  email: string | null;
  phone: string | null;

  // Subject/body for email
  emailSubject: string;
  emailHtml: string;
  emailText?: string;

  // Body for SMS — keep it short, 160 chars ideally
  smsBody: string;

  // Audit metadata (used for the notifications log table)
  recipientType: 'host' | 'guest';
  recipientId: string;
  purpose: string;
}

export interface NotifyResult {
  ok: boolean;             // true if AT LEAST ONE channel succeeded
  emailOk: boolean;
  smsOk: boolean;
  emailError?: string;
  smsError?: string;
}

export async function notifyBoth(args: NotifyArgs): Promise<NotifyResult> {
  // Run both in parallel — neither blocks the other
  const [emailRes, smsRes] = await Promise.all([
    args.email
      ? sendEmail({
          to: args.email,
          subject: args.emailSubject,
          html: args.emailHtml,
          text: args.emailText,
          recipientType: args.recipientType,
          recipientId: args.recipientId,
          purpose: args.purpose,
        })
      : Promise.resolve({ ok: false, error: 'no email on file' }),
    args.phone
      ? sendSms({
          to: args.phone,
          body: args.smsBody,
          recipientType: args.recipientType,
          recipientId: args.recipientId,
          purpose: args.purpose,
        })
      : Promise.resolve({ ok: false, error: 'no phone on file' }),
  ]);

  return {
    ok: emailRes.ok || smsRes.ok,
    emailOk: emailRes.ok,
    smsOk: smsRes.ok,
    emailError: emailRes.error,
    smsError: smsRes.error,
  };
}
