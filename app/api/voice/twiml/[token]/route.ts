import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Twilio fetches this URL when the call is answered. We respond with TwiML
// that speaks a message and gathers a single keypad digit.

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

  // Detect if Twilio reached an answering machine
  const formData = await req.formData().catch(() => null);
  const answeredBy = formData?.get('AnsweredBy') as string | undefined;

  // If voicemail, leave a short message and hang up.
  if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' ||
      answeredBy === 'machine_end_silence' || answeredBy === 'machine_end_other') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">Hi ${escapeXml(hostName)}, this is the accommodation team for ${escapeXml(eventName)}. We're trying to reach you about hosting again this year. Please check your email or text messages for a confirmation link, or contact the event coordinator. Thank you.</Say>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Live human — gather keypad input
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(gatherUrl)}" method="POST" timeout="8">
    <Say voice="Polly.Joanna">Hi ${escapeXml(hostName)}, this is the accommodation team for ${escapeXml(eventName)}. We're checking if you're able to host guests again this year. To confirm yes, press 1. To decline, press 2. To repeat this message, press 9.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive a response. We'll follow up by email. Thank you, goodbye.</Say>
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
