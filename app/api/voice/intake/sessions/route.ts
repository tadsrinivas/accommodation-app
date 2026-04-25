import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

// GET /api/voice/intake/sessions — list voice intake sessions for monitoring
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('guest_intake_sessions')
    .select('id, name, caller_phone, arrival_date, departure_date, party_size, step, call_started_at, sms_sent_at, completed_at, guest_id')
    .order('call_started_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data });
}
