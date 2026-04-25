import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Twilio POSTs the gathered digits here. We update the host record
// and respond with TwiML to confirm verbally.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');

  const eventName = process.env.EVENT_NAME || 'our event';
  let confirmedAvailable: boolean | null = null;
  let response: string;

  if (digits === '1') {
    confirmedAvailable = true;
    response = `Thank you so much. We've recorded that you can host this year. We'll be in touch with details. Goodbye.`;
  } else if (digits === '2') {
    confirmedAvailable = false;
    response = `Thank you for letting us know. We appreciate your past help. Goodbye.`;
  } else if (digits === '9') {
    // Repeat — re-issue the gather TwiML
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
    const twimlUrl = `${siteUrl}/api/voice/twiml/${params.token}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(twimlUrl)}</Redirect>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  } else {
    response = `We didn't recognize that input. We'll follow up by email. Thank you.`;
  }

  if (confirmedAvailable !== null) {
    await supabaseAdmin
      .from('hosts')
      .update({
        confirmed_available: confirmedAvailable,
        confirmed_at: new Date().toISOString(),
        voice_call_response: digits === '1' ? 'pressed_1' : 'pressed_2',
      })
      .eq('confirm_token', params.token);
  } else {
    await supabaseAdmin
      .from('hosts')
      .update({ voice_call_response: 'no_input' })
      .eq('confirm_token', params.token);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(response)}</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
