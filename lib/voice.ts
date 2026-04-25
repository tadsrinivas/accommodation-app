import twilio from 'twilio';
import { supabaseAdmin } from './supabase';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

interface PlaceCallArgs {
  to: string;
  hostId: string;
  hostName: string;
  confirmToken: string;
}

/**
 * Place an outbound call to the host.
 * Twilio will fetch our voice TwiML endpoint when the call is answered.
 * The host's keypad input is captured and sent to our gather webhook.
 */
export async function placeReconfirmCall(args: PlaceCallArgs) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const voiceUrl = `${siteUrl}/api/voice/twiml/${args.confirmToken}`;
  const statusUrl = `${siteUrl}/api/voice/status/${args.confirmToken}`;

  try {
    const call = await client.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: args.to,
      url: voiceUrl,                                // TwiML when answered
      statusCallback: statusUrl,                    // Status updates
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      timeout: 25,                                  // ring for 25s before giving up
      machineDetection: 'DetectMessageEnd',         // Detect voicemail
      machineDetectionTimeout: 8,
    });

    await supabaseAdmin.from('notifications').insert({
      recipient_type: 'host',
      recipient_id: args.hostId,
      channel: 'voice',
      purpose: 'reconfirm_voice_initiated',
      success: true,
      provider_id: call.sid,
    });

    return { ok: true, sid: call.sid };
  } catch (err: any) {
    await supabaseAdmin.from('notifications').insert({
      recipient_type: 'host',
      recipient_id: args.hostId,
      channel: 'voice',
      purpose: 'reconfirm_voice_initiated',
      success: false,
      error_message: err?.message ?? String(err),
    });
    return { ok: false, error: err?.message ?? String(err) };
  }
}
