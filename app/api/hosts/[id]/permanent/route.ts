import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Permanently delete a host. Cascades to:
 *   - matches involving the host (deleted)
 *   - notifications log entries (deleted)
 *   - verification_codes with destination = host.id (deleted)
 *
 * Only allowed on already soft-deleted hosts. This forces the two-step
 * pattern: coordinators must remove first, then permanently delete from
 * the Removed tab. Prevents accidental hard-deletes from the active list.
 */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!host) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!host.cancelled_at) {
    return NextResponse.json(
      { error: 'Host must be removed (soft-deleted) before permanent deletion. Remove first, then delete from the Removed tab.' },
      { status: 400 }
    );
  }

  // Cascade-delete related rows. Order matters: clean up references first.
  // Deletions are intentionally individual rather than relying on FK CASCADE
  // so we can audit what got removed.

  // 1. Notifications log entries pointing at this host
  await supabaseAdmin
    .from('notifications')
    .delete()
    .eq('recipient_type', 'host')
    .eq('recipient_id', host.id);

  // 2. Verification codes (e.g., edit tokens) destination'd at this host
  await supabaseAdmin
    .from('verification_codes')
    .delete()
    .eq('destination', host.id);

  // 3. Matches involving this host
  await supabaseAdmin
    .from('matches')
    .delete()
    .eq('host_id', host.id);

  // 4. Finally, the host record itself
  const { error } = await supabaseAdmin
    .from('hosts')
    .delete()
    .eq('id', host.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: host.name });
}
