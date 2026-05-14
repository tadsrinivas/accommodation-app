import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { sendEmail, matchCancelledEmail } from '@/lib/email';
import { getCapacityUsage } from '@/lib/capacity';
import { z } from 'zod';

/**
 * Coordinator-only match management:
 *   PUT     /api/coordinator/matches/[id]  — edit host_id and/or guest_id (proposed only)
 *   DELETE  /api/coordinator/matches/[id]  — revert match (sets cancelled, notifies parties)
 */

const EditSchema = z.object({
  host_id: z.string().uuid().optional(),
  guest_id: z.string().uuid().optional(),
  allow_overcapacity: z.boolean().optional().default(false),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.flatten() }, { status: 400 });
  }

  // Load current match — must be in 'proposed' state
  const { data: match } = await supabaseAdmin
    .from('matches')
    .select('id, host_id, guest_id, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (match.status !== 'proposed') {
    return NextResponse.json(
      { error: `Cannot edit match in '${match.status}' state. Only 'proposed' matches can be edited.` },
      { status: 400 }
    );
  }

  const newHostId = parsed.data.host_id ?? match.host_id;
  const newGuestId = parsed.data.guest_id ?? match.guest_id;
  const allowOver = parsed.data.allow_overcapacity;

  if (newHostId === match.host_id && newGuestId === match.guest_id) {
    return NextResponse.json({ error: 'Nothing changed' }, { status: 400 });
  }

  // Collision check: does this (host, guest) pair already have a non-cancelled match?
  const { data: collision } = await supabaseAdmin
    .from('matches')
    .select('id, status')
    .eq('host_id', newHostId)
    .eq('guest_id', newGuestId)
    .neq('id', match.id)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (collision) {
    return NextResponse.json(
      { error: `A match between this host and guest already exists (status: ${collision.status}). You may need to revert that one first.` },
      { status: 409 }
    );
  }

  // Capacity check — load new host and guest to compute
  const [newHostData, newGuestData] = await Promise.all([
    supabaseAdmin.from('hosts').select('id, capacity, host_type').eq('id', newHostId).maybeSingle(),
    supabaseAdmin.from('guests').select('id, party_size').eq('id', newGuestId).maybeSingle(),
  ]);

  if (!newHostData.data) return NextResponse.json({ error: 'New host not found' }, { status: 404 });
  if (!newGuestData.data) return NextResponse.json({ error: 'New guest not found' }, { status: 404 });

  // Compute capacity excluding the current match's contribution
  const usage = await getCapacityUsage([newHostId]);
  let used = usage.get(newHostId) || 0;
  if (newHostId === match.host_id) {
    // The match we're editing already contributes to usage — subtract it back out
    const { data: currentGuest } = await supabaseAdmin
      .from('guests')
      .select('party_size')
      .eq('id', match.guest_id)
      .maybeSingle();
    if (currentGuest) {
      used = Math.max(0, used - currentGuest.party_size);
    }
  }
  const remaining = newHostData.data.capacity - used;
  const overBy = newGuestData.data.party_size - remaining;

  if (overBy > 0 && !allowOver) {
    return NextResponse.json(
      {
        error: 'overcapacity',
        message: `New host has ${remaining} remaining capacity (out of ${newHostData.data.capacity}). New guest party would exceed by ${overBy}.`,
        host_capacity: newHostData.data.capacity,
        host_used: used,
        host_remaining: remaining,
        guest_party_size: newGuestData.data.party_size,
        over_by: overBy,
      },
      { status: 409 }
    );
  }

  // Build the update. Reset responses since the pairing changed.
  const updates: Record<string, any> = {
    host_id: newHostId,
    guest_id: newGuestId,
    host_response: null,
    host_responded_at: null,
    guest_response: null,
    guest_responded_at: null,
  };

  if (newHostId !== match.host_id && newHostData.data.host_type === 'hotel') {
    updates.host_response = 'accepted';
    updates.host_responded_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('matches')
    .update(updates)
    .eq('id', match.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    host_id: newHostId,
    guest_id: newGuestId,
    overcapacity: overBy > 0,
    over_by: Math.max(0, overBy),
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select(`
      id, status,
      hosts(id, name, email, host_type),
      guests(id, name, email)
    `)
    .eq('id', params.id)
    .maybeSingle();

  if (!match) return NextResponse.json({ error: 'Match not found' }, { status: 404 });
  if (match.status === 'cancelled') {
    return NextResponse.json({ error: 'Match is already cancelled' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('matches')
    .update({ status: 'cancelled', contacts_exchanged: false })
    .eq('id', match.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const host = Array.isArray(match.hosts) ? match.hosts[0] : match.hosts;
  const guest = Array.isArray(match.guests) ? match.guests[0] : match.guests;

  let notified = 0;
  if (host && host.email && host.host_type !== 'hotel') {
    const tpl = matchCancelledEmail({ recipientName: host.name, role: 'host' });
    sendEmail({
      to: host.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'match_cancelled',
    }).catch((err) => console.error('[match revert] host email failed:', err));
    notified++;
  }

  if (guest && guest.email) {
    const tpl = matchCancelledEmail({ recipientName: guest.name, role: 'guest' });
    sendEmail({
      to: guest.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      recipientType: 'guest',
      recipientId: guest.id,
      purpose: 'match_cancelled',
    }).catch((err) => console.error('[match revert] guest email failed:', err));
    notified++;
  }

  return NextResponse.json({ ok: true, notified });
}
