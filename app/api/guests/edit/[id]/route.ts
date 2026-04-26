import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Guest edit endpoints — the SMS link from voice modify flow lands here.
 * Token validation: we hash the submitted token and look for a non-consumed
 * row in verification_codes with matching code_hash + intent='guest_edit'.
 */

function hashToken(t: string): string {
  return crypto.createHash('sha256').update(t).digest('hex');
}

async function validateToken(guestId: string, token: string): Promise<boolean> {
  if (!token) return false;
  const tokenHash = hashToken(token);
  const { data } = await supabaseAdmin
    .from('verification_codes')
    .select('id, expires_at, consumed_at')
    .eq('destination', guestId)
    .eq('intent', 'guest_edit')
    .eq('code_hash', tokenHash)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  if (new Date(data.expires_at) < new Date()) return false;
  return true;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  if (!(await validateToken(params.id, token))) {
    return NextResponse.json({ error: 'Link is invalid or expired' }, { status: 401 });
  }

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, email, phone, arrival_date, departure_date, party_size, notes')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!guest) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ guest });
}

const EditSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(7).max(30).optional().or(z.literal('')),
  arrival_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party_size: z.coerce.number().int().min(1).max(20),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const token = url.searchParams.get('t') || '';
  if (!(await validateToken(params.id, token))) {
    return NextResponse.json({ error: 'Link is invalid or expired' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = EditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Please check your details', issues: parsed.error.flatten() }, { status: 400 });
  }

  const g = parsed.data;
  if (new Date(g.departure_date) <= new Date(g.arrival_date)) {
    return NextResponse.json({ error: 'Departure must be after arrival' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('guests')
    .update({
      name: g.name,
      phone: g.phone || null,
      arrival_date: g.arrival_date,
      departure_date: g.departure_date,
      party_size: g.party_size,
      notes: g.notes || null,
    })
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Consume the token (one-time-use)
  const tokenHash = hashToken(token);
  await supabaseAdmin
    .from('verification_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('destination', params.id)
    .eq('intent', 'guest_edit')
    .eq('code_hash', tokenHash);

  return NextResponse.json({ ok: true });
}
