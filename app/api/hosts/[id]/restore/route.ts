import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Restore a soft-deleted host. Clears cancelled_at and cancellation_source.
 * Note: confirmed_available stays as false — the coordinator should re-run
 * outreach or manually set it true after confirming with the host.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!host) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!host.cancelled_at) {
    return NextResponse.json({ error: 'Host is not removed' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('hosts')
    .update({
      cancelled_at: null,
      cancellation_source: null,
    })
    .eq('id', host.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
