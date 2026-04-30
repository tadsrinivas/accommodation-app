import { NextRequest, NextResponse } from 'next/server';
import { say } from '@/lib/voice-prompts';
import { notifyBoth } from '@/lib/notify';
import { hostSignupLinkEmail } from '@/lib/email';
import { smsBody as withSmsPrefix } from '@/lib/sms';

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
    smsBody: withSmsPrefix(`Thank you for offering to host! Please complete your signup here: ${link}`),
    recipientType: 'host',
    recipientId: '00000000-0000-0000-0000-000000000000',
    purpose: 'host_signup_link',
  });

  const coordinatorEmail = process.env.COORDINATOR_EMAIL || '';
  const fallbackMention = coordinatorEmail
    ? ` If you don't receive the message within an hour, please email us at ${coordinatorEmail.replace(/@/g, ' at ').replace(/\./g, ' dot ')} and we'll help you complete your signup.`
    : '';

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Thank you so much for offering to host. I've just sent a message with a link to complete your signup. Once you submit, a coordinator will review and confirm.${fallbackMention} We really appreciate your generosity. Thank you, and goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
