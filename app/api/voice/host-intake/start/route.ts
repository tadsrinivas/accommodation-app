import { NextRequest, NextResponse } from 'next/server';
import { sendSms } from '@/lib/sms';
import { escapeXml } from '@/lib/voice-intake';

/**
 * "New host" voice flow.
 * Email and capacity are awkward to capture by voice, and signups need
 * coordinator approval anyway. So we send an SMS link to /host/signup.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const fromNumber = String(formData.get('From') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!fromNumber) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We couldn't read your phone number. Please visit our website to sign up. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const link = `${siteUrl}/host/signup`;
  await sendSms({
    to: fromNumber,
    body: `Thank you for offering to host! Please complete your signup here: ${link}`,
    recipientType: 'host',
    recipientId: '00000000-0000-0000-0000-000000000000',
    purpose: 'host_signup_link',
  });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for offering to host. We just texted you a link to complete your signup. After you submit, a coordinator will review and approve. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
