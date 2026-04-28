import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';

  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, capacity')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!host) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(`I'm sorry, I couldn't find your hosting record. Thank you, goodbye.`)}<Hangup/></Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const confirmAction = `${siteUrl}/api/voice/cancel/host/${host.id}/confirm?call_sid=${encodeURIComponent(callSid)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(confirmAction)}" method="POST" timeout="8">
    ${say(`I found your hosting record, with a capacity of ${host.capacity}.`)}
    <Pause length="1"/>
    ${say(`To permanently remove yourself from the host pool, please press nine. To stay registered, press any other key.`)}
  </Gather>
  ${say(`I didn't receive a response. Your record has not been changed. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
