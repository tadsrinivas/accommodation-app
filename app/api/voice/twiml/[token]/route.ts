import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  return handle(req, params.token);
}
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return handle(req, params.token);
}

async function handle(req: NextRequest, token: string) {
  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('name')
    .eq('confirm_token', token)
    .maybeSingle();

  const eventName = process.env.EVENT_NAME || 'our event';
  const hostName = host?.name || 'there';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const gatherUrl = `${siteUrl}/api/voice/gather/${token}`;

  const formData = await req.formData().catch(() => null);
  const answeredBy = formData?.get('AnsweredBy') as string | undefined;

  // Voicemail detection: leave a brief, warm message
  if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' ||
      answeredBy === 'machine_end_silence' || answeredBy === 'machine_end_other') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  ${safeSay(`Hare Krishna ${hostName}, this is the accommodation team for ${eventName}. We were hoping to ask if you might be able to host any guests this year. Please check your email or text messages for a confirmation link, or contact the event coordinator. Thank you so much, and have a wonderful day.`)}
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Live caller
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(gatherUrl)}" method="POST" timeout="8">
    ${safeSay(`Hare Krishna, this is Srinivas from ISKCON Atlanta. I'm calling about the upcoming Jagannath Ratha Yatra and Panihati festival from June 5th to 7th. We’re expecting a lot of out-of-town devotees this year, so, we're checking to see if you might have space to accommodate any guests—completely based on your own convenience.`)}    
    <Pause length="1"/>
    ${say(`If you're able to host, please press one. If you're not able to this year, please press two. To repeat this message, please press nine.`)}
  </Gather>
  ${say(`I didn't hear a response. We'll follow up again. Thank you, goodbye.`)}
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
