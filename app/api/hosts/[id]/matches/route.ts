import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Returns matches involving this host that are in non-terminal states
 * (proposed, notified, confirmed). Used by the delete-confirmation UI to
 * let coordinator decide per-match whether to cancel them.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: matches, error } = await supabaseAdmin
    .from('matches')
    .select('id, status, created_at, guest_id, guests(id, name, email, party_size, arrival_date, departure_date)')
    .eq('host_id', params.id)
    .in('status', ['proposed', 'notified', 'confirmed'])
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ matches: matches || [] });
}
