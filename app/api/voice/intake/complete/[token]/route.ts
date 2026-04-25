import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { z } from 'zod';

// GET /api/voice/intake/complete/[token] — fetch the in-progress session
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await supabaseAdmin
    .from('guest_intake_sessions')
    .select('id, name, caller_phone, arrival_date, departure_date, party_size, step, expires_at, guest_id')
    .eq('confirm_token', params.token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  }
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired. Please call back to start a new request.' }, { status: 410 });
  }
  if (data.step === 'completed' && data.guest_id) {
    return NextResponse.json({ error: 'This request has already been submitted.', already_completed: true }, { status: 409 });
  }

  return NextResponse.json({ session: data });
}

const CompleteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(30).optional().or(z.literal('')),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party_size: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

// POST /api/voice/intake/complete/[token] — guest submits the form
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json();
  const parsed = CompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid form data', issues: parsed.error.flatten() }, { status: 400 });
  }

  const g = parsed.data;
  if (new Date(g.departure_date) <= new Date(g.arrival_date)) {
    return NextResponse.json({ error: 'Departure must be after arrival' }, { status: 400 });
  }

  const { data: session, error: sessErr } = await supabaseAdmin
    .from('guest_intake_sessions')
    .select('id, step, expires_at, guest_id')
    .eq('confirm_token', params.token)
    .maybeSingle();

  if (sessErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Session expired' }, { status: 410 });
  }
  if (session.step === 'completed' && session.guest_id) {
    return NextResponse.json({ error: 'Already submitted' }, { status: 409 });
  }

  // Insert into guests
  const { data: guest, error: gErr } = await supabaseAdmin
    .from('guests')
    .insert({
      name: g.name,
      email: g.email.toLowerCase(),
      phone: g.phone || null,
      arrival_date: g.arrival_date,
      departure_date: g.departure_date,
      party_size: g.party_size,
      notes: g.notes || null,
    })
    .select('id')
    .single();

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  // Mark session completed
  await supabaseAdmin
    .from('guest_intake_sessions')
    .update({
      step: 'completed',
      completed_at: new Date().toISOString(),
      guest_id: guest.id,
    })
    .eq('id', session.id);

  return NextResponse.json({ ok: true, guest_id: guest.id });
}
