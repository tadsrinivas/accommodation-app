import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Coordinator-only host management:
 *   GET     /api/hosts/[id]           — fetch host details (with cancelled state)
 *   DELETE  /api/hosts/[id]           — soft delete (sets cancelled_at)
 *   POST    /api/hosts/[id]/restore   — un-cancel a soft-deleted host
 *
 * Body for DELETE may include:
 *   { match_actions: { match_id_1: 'cancel' | 'keep', ... } }
 * to indicate per-match decisions.
 */

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ host: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  // Optional: per-match decisions
  let matchActions: Record<string, 'cancel' | 'keep'> = {};
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && body.match_actions) {
      matchActions = body.match_actions;
    }
  } catch { /* no body provided — that's fine */ }

  // Verify host exists and isn't already cancelled
  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  if (host.cancelled_at) {
    return NextResponse.json({ error: 'Host is already removed' }, { status: 400 });
  }

  // Soft-delete the host
  const { error: hostErr } = await supabaseAdmin
    .from('hosts')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_source: 'coordinator',
      confirmed_available: false,  // also flag as not available
    })
    .eq('id', host.id);

  if (hostErr) return NextResponse.json({ error: hostErr.message }, { status: 500 });

  // Apply per-match actions
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
