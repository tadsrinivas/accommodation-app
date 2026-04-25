import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';

/**
 * Twilio Voice webhook for INBOUND calls (guests calling in).
 *
 * Configure in Twilio: phone number → "A CALL COMES IN" → Webhook
 *   POST {NEXT_PUBLIC_SITE_URL}/api/voice/inbound
 *
 * Outbound host-reconfirmation calls bypass this — they hit
 * /api/voice/twiml/[token] directly because we set the URL when placing them.
 */

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  const callSid = String(formData?.get('CallSid') || '');
  const fromNumber = String(formData?.get('From') || '');

  // Create or fetch the intake session for this call
  if (callSid) {
    const { data: existing } = await supabaseAdmin
      .from('guest_intake_sessions')
      .select('id, step')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from('guest_intake_sessions').insert({
        call_sid: callSid,
        caller_phone: fromNumber || null,
        step: 'collecting_name',
      });
    }
  }

  const eventName = process.env.EVENT_NAME || 'our event';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const nameAction = `${siteUrl}/api/voice/intake/name?call_sid=${encodeURIComponent(callSid)}`;

  // Welcome + ask for name (speech)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hello, and welcome to the accommodation request line for ${escapeXml(eventName)}. I'll ask you a few quick questions to set up your request.</Say>
  <Pause length="1"/>
  <Gather input="speech" action="${escapeXml(nameAction)}" method="POST" speechTimeout="auto" timeout="6" language="en-US">
    <Say voice="Polly.Joanna">Please say your full name after the tone.</Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't hear anything. Please call back when you're ready. Goodbye.</Say>
  <Hangup/>
</Response>`;

  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
