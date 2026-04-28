import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';

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
  ${say(`Thank you. I'll just need a few details from you, and the whole thing will take less than a minute.`)}
  <Pause length="1"/>
  <Gather input="speech" action="${escapeXml(nameAction)}" method="POST" speechTimeout="auto" timeout="6" language="en-IN">
    ${say(`First, please tell me your full name after the tone.`)}
  </Gather>
  ${say(`I didn't hear anything. Please call back when you're ready. Thank you.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
