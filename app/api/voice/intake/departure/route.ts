import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml, parseMMDD, speakableDate } from '@/lib/voice-intake';

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
    <Say voice="Polly.Joanna">That doesn't look right. Please enter four digits, month then day.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Validate departure > arrival
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
    <Say voice="Polly.Joanna">Your departure date needs to be after your arrival date. Please try again.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
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
  <Say voice="Polly.Joanna">Got it, ${escapeXml(speakableDate(iso))}.</Say>
  <Gather numDigits="2" action="${escapeXml(partyUrl)}" method="POST" timeout="8" finishOnKey="#">
    <Say voice="Polly.Joanna">How many people are in your group? Press the number, then press the pound key.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
