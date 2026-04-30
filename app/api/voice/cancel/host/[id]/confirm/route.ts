import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyBoth } from '@/lib/notify';
import { hostCancellationEmail } from '@/lib/email';
import { say } from '@/lib/voice-prompts';
import { smsBody as withSmsPrefix } from '@/lib/sms';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');

  if (digit !== '9') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Your record has not been changed. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone, email')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!host) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Your record has already been cancelled, or we couldn't find it. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  await supabaseAdmin
    .from('hosts')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_source: 'voice',
      confirmed_available: false,
    })
    .eq('id', host.id);

  await supabaseAdmin
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('host_id', host.id)
    .in('status', ['proposed', 'notified']);

  const emailTpl = hostCancellationEmail({ name: host.name });
  await notifyBoth({
    email: host.email,
    phone: host.phone,
    emailSubject: emailTpl.subject,
    emailHtml: emailTpl.html,
    emailText: emailTpl.text,
    smsBody: withSmsPrefix(`You've been removed from the host pool. If this was a mistake, please contact the event coordinator.`),
    recipientType: 'host',
    recipientId: host.id,
    purpose: 'cancellation_confirmed',
  });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`You've been removed from the host pool. I've sent a confirmation by email and text. Thank you so much for your generosity. Goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
