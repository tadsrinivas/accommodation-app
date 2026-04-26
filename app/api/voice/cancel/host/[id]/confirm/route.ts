import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const formData = await req.formData();
  const digit = String(formData.get('Digits') || '');

  if (digit !== '9') {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Your record was not changed. Thank you, goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!host) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Record was already cancelled or could not be found. Goodbye.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  await supabaseAdmin
    .from('hosts')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_source: 'voice',
      confirmed_available: false,  // also flag as not available so they're excluded from matching
    })
    .eq('id', host.id);

  // Cancel any non-terminal matches involving this host
  await supabaseAdmin
    .from('matches')
    .update({ status: 'cancelled' })
    .eq('host_id', host.id)
    .in('status', ['proposed', 'notified']);

  if (host.phone) {
    await sendSms({
      to: host.phone,
      body: `You've been removed from the host pool. If this was a mistake, please reply HELP or contact the event coordinator.`,
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'cancellation_confirmed',
    });
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">You've been removed from the host pool. We've sent a confirmation text. Thank you for your past help, goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
