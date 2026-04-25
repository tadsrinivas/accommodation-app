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

export function hostReconfirmSms(hostName: string, link: string) {
  const eventName = process.env.EVENT_NAME || 'our event';
  return `Hi ${hostName}, can you host again for ${eventName} this year? Please confirm here: ${link}`;
}

export function matchProposedSms(role: 'host' | 'guest', link: string) {
  const eventName = process.env.EVENT_NAME || 'the event';
  if (role === 'host') {
    return `${eventName}: You have a guest match proposal. Review & respond: ${link}`;
  }
  return `${eventName}: Your accommodation match is ready. Confirm here: ${link}`;
}
