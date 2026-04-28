import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml, speakableDate } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, arrival_date, departure_date, party_size')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!guest) return errorResponse(`I'm sorry, I couldn't find an active request. Thank you, goodbye.`);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const confirmAction = `${siteUrl}/api/voice/cancel/guest/${guest.id}/confirm?call_sid=${encodeURIComponent(callSid)}`;
  const partyWord = guest.party_size === 1 ? 'person' : 'people';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(confirmAction)}" method="POST" timeout="8">
    ${safeSay(`I found your accommodation request. Arrival on ${speakableDate(guest.arrival_date)}, departure on ${speakableDate(guest.departure_date)}, for ${guest.party_size} ${partyWord}.`)}
    <Pause length="1"/>
    ${say(`To permanently cancel this request, please press nine. To keep it as it is, press any other key.`)}
  </Gather>
  ${say(`I didn't receive a response. Your request has not been cancelled. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(message)}<Hangup/></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
