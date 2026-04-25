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
    const retryUrl = `${siteUrl}/api/voice/intake/arrival?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="4" action="${escapeXml(retryUrl)}" method="POST" timeout="10" finishOnKey="">
    <Say voice="Polly.Joanna">That doesn't look like a valid date. Please enter four digits: two for the month, two for the day. For October 5th, enter one, zero, zero, five.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  await supabaseAdmin.from('guest_intake_sessions')
    .update({ arrival_date: iso, step: 'collecting_departure' })
    .eq('call_sid', callSid);

  const departureUrl = `${siteUrl}/api/voice/intake/departure?call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Got it, ${escapeXml(speakableDate(iso))}.</Say>
  <Gather numDigits="4" action="${escapeXml(departureUrl)}" method="POST" timeout="10" finishOnKey="">
    <Say voice="Polly.Joanna">Now please enter your departure date the same way, four digits.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
