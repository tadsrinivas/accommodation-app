import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { sendEmail, matchCancelledEmail } from '@/lib/email';
import { z } from 'zod';

/**
 * Coordinator-only match management:
 *   PUT     /api/coordinator/matches/[id]  — edit host_id and/or guest_id (proposed only)
 *   DELETE  /api/coordinator/matches/[id]  — revert match (sets cancelled, notifies parties)
 */

const EditSchema = z.object({
  host_id: z.string().uuid().optional(),
  guest_id: z.string().uuid().optional(),
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

  if (newHostId === match.host_id && newGuestId === match.guest_id) {
    return NextResponse.json({ error: 'Nothing changed' }, { status: 400 });
  }

  // Pre-flight: does this (host, guest) pair already have a match?
  // The unique(host_id, guest_id) constraint will reject the update otherwise.
  const { data: collision } = await supabaseAdmin
    .from('matches')
    .select('id, status')
    .eq('host_id', newHostId)
    .eq('guest_id', newGuestId)
    .neq('id', match.id)
    .maybeSingle();

  if (collision) {
    return NextResponse.json(
      { error: `A match between this host and guest already exists (status: ${collision.status}). You may need to revert that one first.` },
      { status: 409 }
    );
  }

  // If the new host is a hotel, auto-accept on host side. Otherwise reset
  // host_response since this is now a different pairing.
  let updates: Record<string, any> = {
    host_id: newHostId,
    guest_id: newGuestId,
    host_response: null,
    host_responded_at: null,
    guest_response: null,
    guest_responded_at: null,
  };

  if (newHostId !== match.host_id) {
    const { data: newHost } = await supabaseAdmin
      .from('hosts')
      .select('host_type')
      .eq('id', newHostId)
      .maybeSingle();
    if (newHost?.host_type === 'hotel') {
      updates.host_response = 'accepted';
      updates.host_responded_at = new Date().toISOString();
    }
  }

  const { error } = await supabaseAdmin
    .from('matches')
    .update(updates)
    .eq('id', match.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, host_id: newHostId, guest_id: newGuestId });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  // Load match with both parties for the cancellation emails
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

  // Mark as cancelled
  const { error } = await supabaseAdmin
    .from('matches')
    .update({ status: 'cancelled', contacts_exchanged: false })
    .eq('id', match.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const host = Array.isArray(match.hosts) ? match.hosts[0] : match.hosts;
  const guest = Array.isArray(match.guests) ? match.guests[0] : match.guests;

  // Send cancellation emails. Hotel hosts skipped (out-of-band relationship).
  // Hosts without email are also silently skipped — they'll see it in the
  // dashboard. Daily audit will catch missing notifications.
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
