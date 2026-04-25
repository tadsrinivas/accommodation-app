import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Twilio POSTs status updates here (initiated, ringing, answered, completed, no-answer, failed, busy)
// We persist the latest status onto the host record.

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const formData = await req.formData();
  const callSid = String(formData.get('CallSid') || '');
  const callStatus = String(formData.get('CallStatus') || '');

  await supabaseAdmin
    .from('hosts')
    .update({
      voice_call_sid: callSid,
      voice_call_status: callStatus,
    })
    .eq('confirm_token', params.token);

  return NextResponse.json({ ok: true });
}
