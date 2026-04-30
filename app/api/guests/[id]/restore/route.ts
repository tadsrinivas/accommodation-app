import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!guest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!guest.cancelled_at) {
    return NextResponse.json({ error: 'Guest is not removed' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('guests')
    .update({
      cancelled_at: null,
      cancellation_source: null,
    })
    .eq('id', guest.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
