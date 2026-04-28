import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const role = url.searchParams.get('role');
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!['1', '2', '3'].includes(digit) || !['guest', 'host'].includes(role || '')) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(`I'm sorry, that wasn't a valid option. Please call again. Thank you.`)}<Hangup/></Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  let redirect: string;
  if (role === 'guest' && digit === '1') {
    redirect = `${siteUrl}/api/voice/intake/start?call_sid=${encodeURIComponent(callSid)}`;
  } else if (role === 'host' && digit === '1') {
    redirect = `${siteUrl}/api/voice/host-intake/start?call_sid=${encodeURIComponent(callSid)}`;
  } else if (digit === '2') {
    redirect = `${siteUrl}/api/voice/lookup?role=${role}&purpose=modify&call_sid=${encodeURIComponent(callSid)}`;
  } else {
    redirect = `${siteUrl}/api/voice/lookup?role=${role}&purpose=cancel&call_sid=${encodeURIComponent(callSid)}`;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(redirect)}</Redirect>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
