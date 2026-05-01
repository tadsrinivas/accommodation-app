import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';
import { notifyBoth } from '@/lib/notify';
import { smsBody as withSmsPrefix } from '@/lib/sms';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

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

  // Voice intake doesn't have email yet — only the caller's phone.
  // Email will be added by the caller themselves on the completion page.
  // For now, we just send SMS. (When voice intake captures email later,
  // this becomes notifyBoth — both link delivery channels.)
  // For the dual-channel migration, we use notifyBoth so this call site
  // is consistent, but pass null for email since we don't have one yet.
  const smsMessage = withSmsPrefix(`Hi${session.name ? ' ' + session.name : ''}! To finish your accommodation request, please tap this link to confirm your details and add your email: ${completionLink}`);

  // Note: email is null here because voice intake captures email AFTER this step.
  // Once email is on file (via the completion page) future notifications will use both.
  const result = await notifyBoth({
    email: null,
    phone: session.caller_phone,
    emailSubject: '',
    emailHtml: '',
    smsBody: smsMessage,
    recipientType: 'guest',
    recipientId: session.id,
    purpose: 'voice_intake_completion',
  });
  const linkOk = result.smsOk;

  const coordinatorEmail = process.env.COORDINATOR_EMAIL || '';
  const fallbackMention = coordinatorEmail
    ? ` If you don't receive the message within an hour, please call us back and select optin 0 to leave a voice mail. We will call you back and we'll help you finish.`
    : '';

  const closingMsg = linkOk
    ? `Wonderful. I've recorded your group size as ${partySize}. To complete your request, please check the message I just sent. It has a link where you can confirm everything and add your email.${fallbackMention} Thank you so much for calling.`
    : `I've recorded your group size as ${partySize}. I wasn't able to send a follow-up message to this number, so please visit our website to finish.${fallbackMention} Thank you for calling.`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${safeSay(closingMsg)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
