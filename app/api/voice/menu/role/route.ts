import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * After top-level role selection (guest/host), present:
 *   1: New
 *   2: Modify
 *   3: Cancel
 *
 * The role is passed forward via the action URL query string.
 */

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');
  const callSid = String(formData.get('CallSid') || '');
  const fromNumber = String(formData.get('From') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (digit !== '1' && digit !== '2') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Sorry, that wasn't a valid choice. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const role = digit === '1' ? 'guest' : 'host';

  // Persist role + caller phone for the rest of the call
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

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(action)}" method="POST" timeout="6">
    <Say voice="Polly.Joanna">As a ${roleWord}, press 1 for a new request, 2 to modify an existing request, or 3 to cancel an existing request.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No response. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
