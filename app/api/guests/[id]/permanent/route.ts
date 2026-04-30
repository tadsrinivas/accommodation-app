import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!guest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!guest.cancelled_at) {
    return NextResponse.json(
      { error: 'Guest must be removed (soft-deleted) before permanent deletion. Remove first, then delete from the Removed tab.' },
      { status: 400 }
    );
  }

  await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('recipient_type', 'guest')
    .eq('recipient_id', guest.id);

  await supabaseAdmin
    .from('verification_codes')
    .delete()
    .eq('destination', guest.id);

  await supabaseAdmin
    .from('matches')
    .delete()
    .eq('guest_id', guest.id);

  const { error } = await supabaseAdmin
    .from('guests')
    .delete()
    .eq('id', guest.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: guest.name });
}
