import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms';
import { say } from '@/lib/voice-prompts';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');

  if (digit !== '9') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Your request has not been cancelled. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, phone')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!guest) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Your request has already been cancelled, or we couldn't find it. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  await supabaseAdmin
    .from('guests')
    .update({ cancelled_at: new Date().toISOString(), cancellation_source: 'voice' })
    .eq('id', guest.id);

  await supabaseAdmin
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('guest_id', guest.id)
    .in('status', ['proposed', 'notified']);

  if (guest.phone) {
    await sendSms({
      to: guest.phone,
      body: `Your accommodation request was cancelled. If this was a mistake, please reply HELP or contact the event coordinator.`,
      recipientType: 'guest',
      recipientId: guest.id,
      purpose: 'cancellation_confirmed',
    });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Your accommodation request has been cancelled. I've also sent you a confirmation text message. Thank you, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
