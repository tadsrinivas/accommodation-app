import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');

  let confirmedAvailable: boolean | null = null;
  let response: string;

  if (digits === '1') {
    confirmedAvailable = true;
    response = `Wonderful, thank you so much. I've recorded that you can host this year, and we'll be in touch with details soon. Have a lovely day, goodbye.`;
  } else if (digits === '2') {
    confirmedAvailable = false;
    response = `Thank you for letting us know. We really appreciate your past help, and hope to see you next year. Goodbye.`;
  } else if (digits === '9') {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
    const twimlUrl = `${siteUrl}/api/voice/twiml/${params.token}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(twimlUrl)}</Redirect>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  } else {
    response = `I didn't recognise that input. We'll follow up by email. Thank you, goodbye.`;
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
  ${say(response)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
