import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { getCapacityUsage } from '@/lib/capacity';
import { z } from 'zod';

const ManualMatchSchema = z.object({
  host_id: z.string().uuid(),
  guest_id: z.string().uuid(),
  // Coordinator must explicitly acknowledge overcapacity by sending this flag.
  // If host doesn't have enough remaining capacity AND this flag isn't true,
  // the request is rejected with detail about how much overcapacity it would be.
  allow_overcapacity: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = ManualMatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { host_id, guest_id, allow_overcapacity } = parsed.data;

  // Load host and guest to validate eligibility and compute capacity
  const { data: host } = await supabaseAdmin
    .from('hosts')
    .select('id, name, capacity, host_type, approval_status, confirmed_available, cancelled_at')
    .eq('id', host_id)
    .maybeSingle();

  if (!host) return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  if (host.cancelled_at) {
    return NextResponse.json({ error: 'Host has been removed' }, { status: 400 });
  }
  if (host.approval_status !== 'approved') {
    return NextResponse.json({ error: 'Host is not approved' }, { status: 400 });
  }
  if (host.confirmed_available !== true) {
    return NextResponse.json({ error: 'Host is not available' }, { status: 400 });
  }

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, party_size, cancelled_at')
    .eq('id', guest_id)
    .maybeSingle();

  if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
  if (guest.cancelled_at) {
    return NextResponse.json({ error: 'Guest has been removed' }, { status: 400 });
  }

  // Check for existing non-cancelled match between this pair
  const { data: collision } = await supabaseAdmin
    .from('matches')
    .select('id, status')
    .eq('host_id', host_id)
    .eq('guest_id', guest_id)
    .neq('status', 'cancelled')
    .maybeSingle();

  if (collision) {
    return NextResponse.json(
      { error: `A match between this host and guest already exists (status: ${collision.status}).` },
      { status: 409 }
    );
  }

  // Guest can only be in one active match — check
  const { data: guestExisting } = await supabaseAdmin
    .from('matches')
    .select('id, host_id, status')
    .eq('guest_id', guest_id)
    .neq('status', 'cancelled')
    .neq('status', 'declined')
    .maybeSingle();

  if (guestExisting) {
    return NextResponse.json(
      { error: `This guest is already matched to another host (status: ${guestExisting.status}). Revert that match first.` },
      { status: 409 }
    );
  }

  // Capacity check (soft). Allow overcapacity only with explicit acknowledgement.
  const usage = await getCapacityUsage([host_id]);
  const used = usage.get(host_id) || 0;
  const remaining = host.capacity - used;
  const overBy = guest.party_size - remaining;

  if (overBy > 0 && !allow_overcapacity) {
    return NextResponse.json(
      {
        error: 'overcapacity',
        message: `This host has ${remaining} remaining capacity (out of ${host.capacity}). Adding ${guest.party_size} guests would exceed by ${overBy}.`,
        host_capacity: host.capacity,
        host_used: used,
        host_remaining: remaining,
        guest_party_size: guest.party_size,
        over_by: overBy,
      },
      { status: 409 }
    );
  }

  // Insert the match. Hotel hosts get pre-accepted, same as auto-matcher.
  const isHotel = host.host_type === 'hotel';
  const now = new Date().toISOString();

  const { data: created, error } = await supabaseAdmin
    .from('matches')
    .insert({
      host_id,
      guest_id,
      status: 'proposed',
      host_response: isHotel ? 'accepted' : null,
      host_responded_at: isHotel ? now : null,
    })
    .select('id')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    match_id: created.id,
    host_name: host.name,
    guest_name: guest.name,
    overcapacity: overBy > 0,
    over_by: Math.max(0, overBy),
  });
}
