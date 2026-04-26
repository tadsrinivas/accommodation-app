import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';

/**
 * Cancel flow stage 1: read summary + ask for press-9 confirmation.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, arrival_date, departure_date, party_size')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!guest) {
    return errorResponse("We couldn't find an active record. Goodbye.");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const confirmAction = `${siteUrl}/api/voice/cancel/guest/${guest.id}/confirm?call_sid=${encodeURIComponent(callSid)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(confirmAction)}" method="POST" timeout="8">
    <Say voice="Polly.Joanna">We found your accommodation request: arrival ${escapeXml(guest.arrival_date)}, departure ${escapeXml(guest.departure_date)}, ${guest.party_size} ${guest.party_size === 1 ? 'person' : 'people'}. To permanently cancel this request, press 9. To keep it, press any other key.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No response received. Your request was not cancelled. Goodbye.</Say>
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
