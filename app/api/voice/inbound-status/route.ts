import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Status callback for INBOUND guest intake calls.
 * Configure in Twilio: phone number → Voice → status callback URL → POST {SITE_URL}/api/voice/inbound-status
 *
 * Marks abandoned sessions (caller hung up before getting to sms_sent).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const callSid = String(formData.get('CallSid') || '');
  const callStatus = String(formData.get('CallStatus') || '');

  if (!callSid) return NextResponse.json({ ok: true });

  if (callStatus === 'completed' || callStatus === 'failed' ||
      callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'canceled') {
    const { data: session } = await supabaseAdmin
      .from('guest_intake_sessions')
      .select('id, step')
      .eq('call_sid', callSid)
      .maybeSingle();

    if (session) {
      const updates: Record<string, unknown> = { call_ended_at: new Date().toISOString() };
      // If caller hung up before completing the SMS handoff, mark abandoned
      if (session.step !== 'sms_sent' && session.step !== 'completed') {
        updates.step = 'abandoned';
      }
      await supabaseAdmin.from('guest_intake_sessions').update(updates).eq('id', session.id);
    }
  }

  return NextResponse.json({ ok: true });
}
