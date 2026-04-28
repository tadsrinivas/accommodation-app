import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';
import { sendSms } from '@/lib/sms';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const eventName = process.env.EVENT_NAME || 'our event';

  const partySize = parseInt(digits, 10);
  if (!partySize || partySize < 1 || partySize > 20) {
    const retryUrl = `${siteUrl}/api/voice/intake/party?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="2" action="${escapeXml(retryUrl)}" method="POST" timeout="8" finishOnKey="#">
    ${say(`Please enter a number between one and twenty, then press the pound key.`)}
  </Gather>
  ${say(`Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const { data: session } = await supabaseAdmin
    .from('guest_intake_sessions')
    .update({
      party_size: partySize,
      step: 'sms_sent',
      sms_sent_at: new Date().toISOString(),
    })
    .eq('call_sid', callSid)
    .select('id, confirm_token, caller_phone, name')
    .single();

  if (!session) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I'm sorry, something went wrong on our end. Please try calling back. Thank you.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const completionLink = `${siteUrl}/intake/${session.confirm_token}`;
  let smsOk = false;

  if (session.caller_phone) {
    const body = `Hi${session.name ? ' ' + session.name : ''}! To finish your accommodation request for ${eventName}, please tap this link to confirm your details and add your email: ${completionLink}`;
    const smsRes = await sendSms({
      to: session.caller_phone,
      body,
      recipientType: 'guest',
      recipientId: session.id,
      purpose: 'voice_intake_completion',
    });
    smsOk = smsRes.ok;
  }

  const closingMsg = smsOk
    ? `Wonderful. I've recorded your group size as ${partySize}. To complete your request, please check the text message I just sent. It has a link where you can confirm everything and add your email. Thank you so much for calling.`
    : `I've recorded your group size as ${partySize}. I wasn't able to send a follow-up text to this number, so please visit our website to finish. Thank you for calling.`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${safeSay(closingMsg)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
