import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms';
import { escapeXml } from '@/lib/voice-intake';

/**
 * Modify host record: SMS the existing /host/[token]/edit link.
 * Hosts already have a unique confirm_token used for self-edit; we just send it.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone, confirm_token')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!host) {
    return errorResponse("We couldn't find your record. Goodbye.");
  }
  if (!host.phone) {
    return errorResponse("We don't have a phone number on file. Please visit our website. Goodbye.");
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
  <Say voice="Polly.Joanna">We just texted you a link to update your hosting profile. Thank you, goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string): NextResponse {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
