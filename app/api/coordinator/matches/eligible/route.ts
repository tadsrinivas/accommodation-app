import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { getCapacityUsage } from '@/lib/capacity';

/**
 * Lists hosts and guests for the match-edit and manual-match dialogs.
 * Now includes used_capacity and remaining_capacity per host so dialogs
 * can render "X/Y" and warn on overcapacity.
 *
 * Query params:
 *   ?match_id=<id>  - exclude this match from capacity calc (for edit; the
 *                     match's own party_size shouldn't count against capacity
 *                     when checking if the host can fit the edited guest)
 */
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const url = new URL(req.url);
  const excludeMatchId = url.searchParams.get('match_id');

  const { data: hosts } = await supabaseAdmin
    .from('hosts')
    .select('id, name, capacity, host_type, address')
    .eq('approval_status', 'approved')
    .eq('confirmed_available', true)
    .is('cancelled_at', null)
    .order('name');

  const { data: guests } = await supabaseAdmin
    .from('guests')
    .select('id, name, party_size, arrival_date, departure_date')
    .is('cancelled_at', null)
    .order('arrival_date');

  // Compute capacity usage. If excludeMatchId given, exclude that match's
  // contribution so the edit dialog doesn't double-count the existing match.
  const hostIds = (hosts || []).map((h) => h.id);
  let usage = await getCapacityUsage(hostIds);

  if (excludeMatchId) {
    const { data: excluded } = await supabaseAdmin
      .from('matches')
      .select('host_id, guests!inner(party_size)')
      .eq('id', excludeMatchId)
      .maybeSingle();
    if (excluded) {
      const guest = Array.isArray((excluded as any).guests) ? (excluded as any).guests[0] : (excluded as any).guests;
      const partySize = guest?.party_size || 0;
      const current = usage.get(excluded.host_id) || 0;
      usage.set(excluded.host_id, Math.max(0, current - partySize));
    }
  }

  const augmentedHosts = (hosts || []).map((h) => ({
    ...h,
    used_capacity: usage.get(h.id) || 0,
    remaining_capacity: h.capacity - (usage.get(h.id) || 0),
  }));

  return NextResponse.json({
    hosts: augmentedHosts,
    guests: guests || [],
  });
}
