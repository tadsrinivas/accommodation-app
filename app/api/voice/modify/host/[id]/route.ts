import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyBoth } from '@/lib/notify';
import { hostModifyLinkEmail } from '@/lib/email';
import { say } from '@/lib/voice-prompts';
import { smsBody as withSmsPrefix } from '@/lib/sms';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone, email, confirm_token')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!host) return errorResponse(`I'm sorry, I wasn't able to find your record. Thank you, goodbye.`);
  if (!host.phone && !host.email) {
    return errorResponse(`I'm sorry, we don't have a phone or email on file. Please visit our website. Thank you.`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const link = `${siteUrl}/host/${host.confirm_token}/edit`;

  const emailTpl = hostModifyLinkEmail({ name: host.name, link });
  const result = await notifyBoth({
    email: host.email,
    phone: host.phone,
    emailSubject: emailTpl.subject,
    emailHtml: emailTpl.html,
    emailText: emailTpl.text,
    smsBody: withSmsPrefix(`Tap to update your hosting profile: ${link}`),
    recipientType: 'host',
    recipientId: host.id,
    purpose: 'modify_link',
  });

  const where = result.emailOk && result.smsOk
    ? `an email and a text message`
    : result.emailOk ? `an email`
    : result.smsOk ? `a text message`
    : null;

  if (!where) {
    return errorResponse(`I'm sorry, I couldn't send you the update link. Please visit our website or contact the coordinator. Thank you.`);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I've just sent you ${where} with a link to update your hosting profile. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(message)}<Hangup/></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
