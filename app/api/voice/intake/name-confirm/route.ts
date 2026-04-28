import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (digit === '2') {
    const retryUrl = `${siteUrl}/api/voice/intake/name?call_sid=${encodeURIComponent(callSid)}`;
    await supabaseAdmin.from('guest_intake_sessions')
      .update({ step: 'collecting_name', name: null, name_raw: null })
      .eq('call_sid', callSid);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(retryUrl)}" method="POST" speechTimeout="auto" timeout="6" language="en-IN">
    ${say(`No problem at all. Please say your full name after the tone.`)}
  </Gather>
  ${say(`Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Confirmed → arrival
  await supabaseAdmin.from('guest_intake_sessions')
    .update({ step: 'collecting_arrival' })
    .eq('call_sid', callSid);

  const arrivalUrl = `${siteUrl}/api/voice/intake/arrival?call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Wonderful, thank you.`)}
  <Gather numDigits="4" action="${escapeXml(arrivalUrl)}" method="POST" timeout="10" finishOnKey="">
    ${say(`Now, please enter your arrival date as four digits. The first two digits for the month, the next two for the day. For example, August fifteenth would be zero, eight, one, five.`)}
  </Gather>
  ${say(`I didn't receive a date. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
