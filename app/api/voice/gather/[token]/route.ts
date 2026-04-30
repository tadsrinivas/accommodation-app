import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';
import { notifyBoth } from '@/lib/notify';
import { hostReconfirmedEmail } from '@/lib/email';
import { smsBody as withSmsPrefix } from '@/lib/sms';

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');

  let confirmedAvailable: boolean | null = null;
  let response: string;

  if (digits === '1') {
    confirmedAvailable = true;
    response = `Wonderful, thank you so much. I've recorded that you can host this year. We'll send you a confirmation message with a link to manage your profile. Have a lovely day, goodbye.`;
  } else if (digits === '2') {
    confirmedAvailable = false;
    response = `Thank you for letting us know. We really appreciate your past help, and hope to see you next year. Goodbye.`;
  } else if (digits === '9') {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
    const twimlUrl = `${siteUrl}/api/voice/twiml/${params.token}`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(twimlUrl)}</Redirect>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  } else {
    response = `I didn't recognise that input. We'll follow up by email. Thank you, goodbye.`;
  }

  if (confirmedAvailable !== null) {
    // Read current state BEFORE updating so we know if this is a first-time yes.
    // Only send the welcome message once — re-presses shouldn't re-spam.
    const { data: existing } = await supabaseAdmin
      .from('hosts')
      .select('id, name, email, phone, confirm_token, confirmed_available')
      .eq('confirm_token', params.token)
      .single();

    await supabaseAdmin
      .from('hosts')
      .update({
        confirmed_available: confirmedAvailable,
        confirmed_at: new Date().toISOString(),
        voice_call_response: digits === '1' ? 'pressed_1' : 'pressed_2',
      })
      .eq('confirm_token', params.token);

    if (existing && confirmedAvailable === true && existing.confirmed_available !== true) {
      const tpl = hostReconfirmedEmail({
        name: existing.name,
        confirm_token: existing.confirm_token,
      });
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
      const editLink = `${siteUrl}/host/${existing.confirm_token}/edit`;

      // Fire-and-forget — don't block the TwiML response on email/SMS sending.
      // If notify fails, the host is still confirmed in the DB; they can use
      // /retrieve to get their profile link.
      notifyBoth({
        email: existing.email,
        phone: existing.phone,
        emailSubject: tpl.subject,
        emailHtml: tpl.html,
        emailText: tpl.text,
        smsBody: withSmsPrefix(`Thanks for confirming you can host! Manage your profile: ${editLink}`),
        recipientType: 'host',
        recipientId: existing.id,
        purpose: 'reconfirmed_welcome',
      }).catch((err) => {
        console.error(`[voice gather] welcome notification failed for host ${existing.id}:`, err);
      });
    }
  } else {
    await supabaseAdmin
      .from('hosts')
      .update({ voice_call_response: 'no_input' })
      .eq('confirm_token', params.token);
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(response)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
