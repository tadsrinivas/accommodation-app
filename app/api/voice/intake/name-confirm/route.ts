import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Step 1b: caller pressed 1 (confirm) or 2 (re-do name).
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (digit === '2') {
    // Re-ask for name
    const retryUrl = `${siteUrl}/api/voice/intake/name?call_sid=${encodeURIComponent(callSid)}`;
    await supabaseAdmin.from('guest_intake_sessions')
      .update({ step: 'collecting_name', name: null, name_raw: null })
      .eq('call_sid', callSid);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(retryUrl)}" method="POST" speechTimeout="auto" timeout="6" language="en-US">
    <Say voice="Polly.Joanna">No problem. Please say your full name after the tone.</Say>
  </Gather>
  <Say voice="Polly.Joanna">Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Default to confirmed (digit '1' or anything else) → move on to arrival date
  await supabaseAdmin.from('guest_intake_sessions')
    .update({ step: 'collecting_arrival' })
    .eq('call_sid', callSid);

  const arrivalUrl = `${siteUrl}/api/voice/intake/arrival?call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="4" action="${escapeXml(arrivalUrl)}" method="POST" timeout="10" finishOnKey="">
    <Say voice="Polly.Joanna">Great. Now please enter your arrival date as four digits, with the month first and the day second. For example, August 15th would be zero, eight, one, five.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't get a date. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
