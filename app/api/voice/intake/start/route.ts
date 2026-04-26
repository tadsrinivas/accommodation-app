import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';

/**
 * Entry to the existing guest intake flow. Sets up the session, then
 * delegates to /api/voice/intake/name (which already exists) by asking for the name.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const fromNumber = String(formData.get('From') || '');

  if (callSid) {
    await supabaseAdmin
      .from('guest_intake_sessions')
      .upsert({
        call_sid: callSid,
        caller_phone: fromNumber || null,
        step: 'collecting_name',
      } as any, { onConflict: 'call_sid' });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const nameAction = `${siteUrl}/api/voice/intake/name?call_sid=${encodeURIComponent(callSid)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(nameAction)}" method="POST" speechTimeout="auto" timeout="6" language="en-US">
    <Say voice="Polly.Joanna">Great. Please say your full name after the tone.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No response. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
