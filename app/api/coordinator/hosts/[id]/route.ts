import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { z } from 'zod';

/**
 * Coordinator-only host management:
 *   GET     /api/coordinator/hosts/[id]           — fetch host details
 *   PUT     /api/coordinator/hosts/[id]           — edit host (admin)
 *   DELETE  /api/coordinator/hosts/[id]           — soft delete
 *   POST    /api/coordinator/hosts/[id]/restore   — un-cancel
 *
 * Body for DELETE may include:
 *   { match_actions: { match_id_1: 'cancel' | 'keep', ... } }
 *
 * Body for PUT — partial updates allowed; only included fields change:
 *   { name?, email?, phone?, capacity?, address?, notes?,
 *     approval_status?, confirmed_available? }
 *
 * Note: coordinator edit doesn't run the public form's strict validation
 * (which requires all fields). Coordinators can fix partial data on
 * imported records.
 */

// Coordinator edit schema — looser than the public HostEditSchema since
// admin may need to fix partial records, e.g. backfill phone for an
// imported host without breaking other fields.
const CoordHostUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().nullable().optional().or(z.literal('')),
  phone: z.string().max(30).nullable().optional().or(z.literal('')),
  capacity: z.coerce.number().int().min(1).max(30).optional(),
  address: z.string().max(500).nullable().optional().or(z.literal('')),
  notes: z.string().max(1000).nullable().optional().or(z.literal('')),
  approval_status: z.enum(['pending', 'approved', 'rejected']).optional(),
  confirmed_available: z.boolean().nullable().optional(),
  host_type: z.enum(['residence', 'hotel']).optional(),
});

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

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = CoordHostUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Build the update object from only the fields the coordinator actually sent.
  // Empty strings are converted to null since the DB allows null and that's
  // semantically clearer than empty string.
  const update: Record<string, any> = {};
  const d = parsed.data;
  if (d.name !== undefined) update.name = d.name.trim();
  if (d.email !== undefined) update.email = d.email ? d.email.trim() : null;
  if (d.phone !== undefined) update.phone = d.phone ? d.phone.trim() : null;
  if (d.capacity !== undefined) update.capacity = d.capacity;
  if (d.address !== undefined) update.address = d.address ? d.address.trim() : null;
  if (d.notes !== undefined) update.notes = d.notes ? d.notes.trim() : null;
  if (d.approval_status !== undefined) update.approval_status = d.approval_status;
  if (d.confirmed_available !== undefined) update.confirmed_available = d.confirmed_available;

  // Host type change with side effects:
  //   - When changed to 'hotel': auto-set confirmed_available=true (hotels are
  //     commercial partners; they don't go through reconfirmation outreach so
  //     they need to be available right away to be matchable).
  //   - When changed to 'residence': leave confirmed_available as-is (let the
  //     coordinator or outreach process determine availability).
  // The auto-set only applies if the coordinator didn't explicitly set
  // confirmed_available in the same request — explicit input wins.
  if (d.host_type !== undefined) {
    update.host_type = d.host_type;
    if (d.host_type === 'hotel' && d.confirmed_available === undefined) {
      update.confirmed_available = true;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .update(update)
    .eq('id', params.id)
    .select()
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
