import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms';
import { say } from '@/lib/voice-prompts';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone, confirm_token')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!host) return errorResponse(`I'm sorry, I wasn't able to find your record. Thank you, goodbye.`);
  if (!host.phone) {
    return errorResponse(`I'm sorry, we don't have a phone number on file. Please visit our website. Thank you.`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const link = `${siteUrl}/host/${host.confirm_token}/edit`;

  await sendSms({
    to: host.phone,
    body: `Tap to update your hosting profile: ${link}`,
    recipientType: 'host',
    recipientId: host.id,
    purpose: 'modify_link',
  });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I've just sent you a text message with a link to update your hosting profile. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(message)}<Hangup/></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
