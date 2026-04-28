import { NextRequest, NextResponse } from 'next/server';
import { say } from '@/lib/voice-prompts';
import { notifyBoth } from '@/lib/notify';
import { hostSignupLinkEmail } from '@/lib/email';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const fromNumber = String(formData.get('From') || '');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!fromNumber) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I'm sorry, I wasn't able to read your phone number. Please visit our website to sign up. Thank you.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const link = `${siteUrl}/host/signup`;

  // We don't have an email yet for this caller — only their phone.
  // Use notifyBoth for consistency, but only the SMS half will fire.
  const emailTpl = hostSignupLinkEmail({ link });
  await notifyBoth({
    email: null,
    phone: fromNumber,
    emailSubject: emailTpl.subject,
    emailHtml: emailTpl.html,
    emailText: emailTpl.text,
    smsBody: `Thank you for offering to host! Please complete your signup here: ${link}`,
    recipientType: 'host',
    recipientId: '00000000-0000-0000-0000-000000000000',
    purpose: 'host_signup_link',
  });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Thank you so much for offering to host. I've just sent a message with a link to complete your signup. Once you submit, a coordinator will review and confirm. We really appreciate your generosity. Thank you, and goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
