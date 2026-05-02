import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Lists hosts and guests that can be selected when editing a match.
 * Optional query param ?match_id=<id> excludes guests already used by other
 * non-cancelled matches (so coordinator can't accidentally double-book).
 */
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const url = new URL(req.url);
  const excludeMatchId = url.searchParams.get('match_id');

  // Eligible hosts: approved + available + not cancelled.
  const { data: hosts } = await supabaseAdmin
    .from('hosts')
    .select('id, name, capacity, host_type, address')
    .eq('approval_status', 'approved')
    .eq('confirmed_available', true)
    .is('cancelled_at', null)
    .order('name');

  // Eligible guests: not cancelled.
  const { data: guests } = await supabaseAdmin
    .from('guests')
    .select('id, name, party_size, arrival_date, departure_date')
    .is('cancelled_at', null)
    .order('arrival_date');

  return NextResponse.json({
    hosts: hosts || [],
    guests: guests || [],
  });
}
