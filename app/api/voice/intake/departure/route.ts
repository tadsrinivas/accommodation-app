import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml, parseMMDD, speakableDate } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  const iso = parseMMDD(digits);
  if (!iso) {
    const retryUrl = `${siteUrl}/api/voice/intake/departure?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="4" action="${escapeXml(retryUrl)}" method="POST" timeout="10" finishOnKey="">
    ${say(`That doesn't look quite right. Please enter four digits, month then day.`)}
  </Gather>
  ${say(`Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const { data: session } = await supabaseAdmin
    .from('guest_intake_sessions')
    .select('arrival_date')
    .eq('call_sid', callSid)
    .maybeSingle();

  if (session?.arrival_date && new Date(iso) <= new Date(session.arrival_date)) {
    const retryUrl = `${siteUrl}/api/voice/intake/departure?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="4" action="${escapeXml(retryUrl)}" method="POST" timeout="10" finishOnKey="">
    ${say(`Your departure date needs to be after your arrival date. Please try again.`)}
  </Gather>
  ${say(`Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  await supabaseAdmin.from('guest_intake_sessions')
    .update({ departure_date: iso, step: 'collecting_party_size' })
    .eq('call_sid', callSid);

  const partyUrl = `${siteUrl}/api/voice/intake/party?call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${safeSay(`Got it, ${speakableDate(iso)}.`)}
  <Gather numDigits="2" action="${escapeXml(partyUrl)}" method="POST" timeout="8" finishOnKey="#">
    ${say(`And how many people are in your group? Please press the number, then press the pound key.`)}
  </Gather>
  ${say(`Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
