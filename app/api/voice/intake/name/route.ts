import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml, cleanSpokenName } from '@/lib/voice-intake';

/**
 * Step 1 result: caller said their name (speech transcribed by Twilio).
 * We confirm it with a yes/no before moving on, since STT can mishear.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const speechResult = String(formData.get('SpeechResult') || '');
  const cleaned = cleanSpokenName(speechResult);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  // If we got nothing useful, ask again
  if (!cleaned || cleaned.length < 2) {
    const retryUrl = `${siteUrl}/api/voice/intake/name?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(retryUrl)}" method="POST" speechTimeout="auto" timeout="6" language="en-US">
    <Say voice="Polly.Joanna">I'm sorry, I didn't catch that. Please say your full name clearly after the tone.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I still didn't hear anything. Please call back when you're ready. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Save provisional name and move to confirmation
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
    <Say voice="Polly.Joanna">I heard ${escapeXml(cleaned)}. If that's correct, press 1. To try again, press 2.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't get a response. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
