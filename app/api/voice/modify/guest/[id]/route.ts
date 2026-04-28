import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyBoth } from '@/lib/notify';
import { guestModifyLinkEmail } from '@/lib/email';
import { say } from '@/lib/voice-prompts';
import crypto from 'crypto';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, phone, email')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!guest) return errorResponse(`I'm sorry, I wasn't able to find your record. Thank you, goodbye.`);
  if (!guest.phone && !guest.email) {
    return errorResponse(`I'm sorry, we don't have a phone or email on file to send you a link. Please visit our website. Thank you.`);
  }

  // Generate single-use edit token (24h TTL)
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await supabaseAdmin.from('verification_codes').insert({
    channel: 'sms',
    destination: guest.id,
    code_hash: tokenHash,
    intent: 'guest_edit',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    max_attempts: 1,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const link = `${siteUrl}/guest/edit/${guest.id}?t=${token}`;

  const emailTpl = guestModifyLinkEmail({ name: guest.name, link });
  const result = await notifyBoth({
    email: guest.email,
    phone: guest.phone,
    emailSubject: emailTpl.subject,
    emailHtml: emailTpl.html,
    emailText: emailTpl.text,
    smsBody: `Tap to update your accommodation request: ${link} (link expires in 24 hours)`,
    recipientType: 'guest',
    recipientId: guest.id,
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
  ${say(`I've just sent you ${where} with a link to update your request. The link will be active for the next twenty-four hours. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(message)}<Hangup/></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
