import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';

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
<Response><Say voice="Polly.Joanna">We couldn't find your hosting record. Goodbye.</Say><Hangup/></Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const confirmAction = `${siteUrl}/api/voice/cancel/host/${host.id}/confirm?call_sid=${encodeURIComponent(callSid)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(confirmAction)}" method="POST" timeout="8">
    <Say voice="Polly.Joanna">We found your hosting record: capacity ${host.capacity}. To permanently remove yourself from the host pool, press 9. To stay registered, press any other key.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No response received. Your record was not changed. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
