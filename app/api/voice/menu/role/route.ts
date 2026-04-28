import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');
  const callSid = String(formData.get('CallSid') || '');
  const fromNumber = String(formData.get('From') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  // Press 0 → voicemail
  if (digit === '0') {
    const redirect = `${siteUrl}/api/voice/voicemail/start?call_sid=${encodeURIComponent(callSid)}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Redirect method="POST">${escapeXml(redirect)}</Redirect></Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  if (digit !== '1' && digit !== '2') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I'm sorry, that wasn't one of the options. Please call again. Thank you.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const role = digit === '1' ? 'guest' : 'host';

  if (callSid) {
    await supabaseAdmin
      .from('guest_intake_sessions')
      .upsert({
        call_sid: callSid,
        caller_phone: fromNumber || null,
        step: 'started',
      } as any, { onConflict: 'call_sid' });
  }

  const action = `${siteUrl}/api/voice/menu/intent?role=${role}&call_sid=${encodeURIComponent(callSid)}`;
  const roleWord = role === 'guest' ? 'guest' : 'host';
  const intro = role === 'guest'
    ? `Wonderful, let's help you find a place to stay.`
    : `Thank you so much for offering to host.`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(intro)}
  <Pause length="1"/>
  <Gather numDigits="1" action="${escapeXml(action)}" method="POST" timeout="6">
    ${say(`As a ${roleWord}, please press one to make a new request, two to update your existing request, or three to cancel.`)}
  </Gather>
  ${say(`I didn't catch that. Please try calling again. Thank you.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
