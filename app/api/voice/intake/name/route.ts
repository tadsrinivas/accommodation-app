import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml, cleanSpokenName } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const speechResult = String(formData.get('SpeechResult') || '');
  const cleaned = cleanSpokenName(speechResult);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!cleaned || cleaned.length < 2) {
    const retryUrl = `${siteUrl}/api/voice/intake/name?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(retryUrl)}" method="POST" speechTimeout="auto" timeout="6" language="en-IN">
    ${say(`I'm sorry, I didn't quite catch that. Could you please say your full name clearly after the tone?`)}
  </Gather>
  ${say(`I'm still not hearing you. Please call back when you're ready. Thank you.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  await supabaseAdmin
    .from('guest_intake_sessions')
    .update({
      name_raw: speechResult,
      name: cleaned,
      step: 'confirming_name',
    })
    .eq('call_sid', callSid);

  const confirmAction = `${siteUrl}/api/voice/intake/name-confirm?call_sid=${encodeURIComponent(callSid)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(confirmAction)}" method="POST" timeout="6">
    ${safeSay(`I heard ${cleaned}. If that's correct, please press one. To try again, press two.`)}
  </Gather>
  ${say(`I didn't get a response. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
