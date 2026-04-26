import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';

/**
 * Dispatcher after role + intent. Routes to the appropriate sub-flow.
 *
 *   role=guest, digit=1  → guest intake (existing flow at /api/voice/intake/name)
 *   role=guest, digit=2  → modify guest → /api/voice/lookup?role=guest&purpose=modify
 *   role=guest, digit=3  → cancel guest → /api/voice/lookup?role=guest&purpose=cancel
 *   role=host,  digit=1  → host intake start → /api/voice/intake/host/name
 *   role=host,  digit=2  → modify host → /api/voice/lookup?role=host&purpose=modify
 *   role=host,  digit=3  → cancel host → /api/voice/lookup?role=host&purpose=cancel
 */

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const role = url.searchParams.get('role');
  const callSid = url.searchParams.get('call_sid') || '';
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!['1', '2', '3'].includes(digit) || !['guest', 'host'].includes(role || '')) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Say voice="Polly.Joanna">Sorry, that wasn't a valid choice. Goodbye.</Say><Hangup/></Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Build redirect target
  let redirect: string;

  if (role === 'guest' && digit === '1') {
    // Existing guest intake flow — start at the name step
    redirect = `${siteUrl}/api/voice/intake/start?call_sid=${encodeURIComponent(callSid)}`;
  } else if (role === 'host' && digit === '1') {
    redirect = `${siteUrl}/api/voice/host-intake/start?call_sid=${encodeURIComponent(callSid)}`;
  } else if (digit === '2') {
    redirect = `${siteUrl}/api/voice/lookup?role=${role}&purpose=modify&call_sid=${encodeURIComponent(callSid)}`;
  } else {
    // digit === '3'
    redirect = `${siteUrl}/api/voice/lookup?role=${role}&purpose=cancel&call_sid=${encodeURIComponent(callSid)}`;
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(redirect)}</Redirect>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
