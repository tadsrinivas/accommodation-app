import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

// GET /api/outreach/manual — hosts flagged for manual call
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .select('id, name, email, phone, sms_attempts, email_attempts, voice_attempts, outreach_started_at, last_attempt_at, voice_call_status')
    .eq('outreach_stage', 'manual_required')
    .is('confirmed_available', null)
    .eq('do_not_contact', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hosts: data });
}

// POST /api/outreach/manual — coordinator marks host result after manual call
//   { host_id, action: 'mark_yes' | 'mark_no' | 'mark_dnc' }
export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { host_id, action } = await req.json();
  if (!host_id || !action) {
    return NextResponse.json({ error: 'Missing host_id or action' }, { status: 400 });
  }

  let updates: Record<string, unknown> = {};
  if (action === 'mark_yes') {
    updates = { confirmed_available: true, confirmed_at: new Date().toISOString() };
  } else if (action === 'mark_no') {
    updates = { confirmed_available: false, confirmed_at: new Date().toISOString() };
  } else if (action === 'mark_dnc') {
    updates = { do_not_contact: true };
  } else {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('hosts').update(updates).eq('id', host_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
