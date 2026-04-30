import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ guest: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  let matchActions: Record<string, 'cancel' | 'keep'> = {};
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && body.match_actions) {
      matchActions = body.match_actions;
    }
  } catch { /* no body */ }

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
  if (guest.cancelled_at) {
    return NextResponse.json({ error: 'Guest is already removed' }, { status: 400 });
  }

  const { error: guestErr } = await supabaseAdmin
    .from('guests')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_source: 'coordinator',
    })
    .eq('id', guest.id);

  if (guestErr) return NextResponse.json({ error: guestErr.message }, { status: 500 });

  let cancelledCount = 0;
  for (const [matchId, action] of Object.entries(matchActions)) {
    if (action === 'cancel') {
      await supabaseAdmin
        .from('matches')
        .update({ status: 'cancelled' })
        .eq('id', matchId);
      cancelledCount += 1;
    }
  }

  return NextResponse.json({ ok: true, cancelled_matches: cancelledCount });
}
