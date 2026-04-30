import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Returns all soft-deleted hosts and guests for display in the Removed tab.
 */
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const [hostsResult, guestsResult] = await Promise.all([
    supabaseAdmin
      .from('hosts')
      .select('id, name, email, phone, capacity, cancelled_at, cancellation_source, source')
      .not('cancelled_at', 'is', null)
      .order('cancelled_at', { ascending: false }),
    supabaseAdmin
      .from('guests')
      .select('id, name, email, phone, party_size, arrival_date, departure_date, cancelled_at, cancellation_source')
      .not('cancelled_at', 'is', null)
      .order('cancelled_at', { ascending: false }),
  ]);

  if (hostsResult.error) {
    return NextResponse.json({ error: hostsResult.error.message }, { status: 500 });
  }
  if (guestsResult.error) {
    return NextResponse.json({ error: guestsResult.error.message }, { status: 500 });
  }

  return NextResponse.json({
    hosts: hostsResult.data || [],
    guests: guestsResult.data || [],
  });
}
