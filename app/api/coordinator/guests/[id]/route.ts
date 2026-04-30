import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { z } from 'zod';

const CoordGuestUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).nullable().optional().or(z.literal('')),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  party_size: z.coerce.number().int().min(1).max(20).optional(),
  notes: z.string().max(1000).nullable().optional().or(z.literal('')),
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ guest: data });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = CoordGuestUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const update: Record<string, any> = {};
  const d = parsed.data;
  if (d.name !== undefined) update.name = d.name.trim();
  if (d.email !== undefined) update.email = d.email.trim();
  if (d.phone !== undefined) update.phone = d.phone ? d.phone.trim() : null;
  if (d.arrival_date !== undefined) update.arrival_date = d.arrival_date;
  if (d.departure_date !== undefined) update.departure_date = d.departure_date;
  if (d.party_size !== undefined) update.party_size = d.party_size;
  if (d.notes !== undefined) update.notes = d.notes ? d.notes.trim() : null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Validate that arrival is before departure if both are being updated
  if (update.arrival_date && update.departure_date &&
      new Date(update.departure_date) <= new Date(update.arrival_date)) {
    return NextResponse.json({ error: 'Departure must be after arrival' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .update(update)
    .eq('id', params.id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ guest: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  let matchActions: Record<string, 'cancel' | 'keep'> = {};
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && body.match_actions) {
      matchActions = body.match_actions;
    }
  } catch { /* no body */ }

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, cancelled_at')
    .eq('id', params.id)
    .maybeSingle();

  if (!guest) return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
  if (guest.cancelled_at) {
    return NextResponse.json({ error: 'Guest is already removed' }, { status: 400 });
  }

  const { error: guestErr } = await supabaseAdmin
    .from('guests')
    .update({
      cancelled_at: new Date().toISOString(),
      cancellation_source: 'coordinator',
    })
    .eq('id', guest.id);

  if (guestErr) return NextResponse.json({ error: guestErr.message }, { status: 500 });

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
