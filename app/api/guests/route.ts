import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GuestFormSchema } from '@/lib/validation';
import { requireCoordinator } from '@/lib/auth';

// Public: guest form submission
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = GuestFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid submission', issues: parsed.error.flatten() }, { status: 400 });
  }

  const g = parsed.data;
  if (new Date(g.departure_date) <= new Date(g.arrival_date)) {
    return NextResponse.json({ error: 'Departure must be after arrival' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .insert({
      name: g.name,
      email: g.email,
      phone: g.phone || null,
      arrival_date: g.arrival_date,
      departure_date: g.departure_date,
      party_size: g.party_size,
      notes: g.notes || null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, guest_id: data.id });
}

// Coordinator: list all guests
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ guests: data });
}
