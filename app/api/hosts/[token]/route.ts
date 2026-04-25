import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Public endpoint: host clicks unique link → we fetch their record & let them confirm
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await supabaseAdmin
    .from('hosts')
    .select('id, name, capacity, confirmed_available')
    .eq('confirm_token', params.token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }
  return NextResponse.json({ host: data });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { available, capacity } = await req.json();

  const update: Record<string, unknown> = {
    confirmed_available: Boolean(available),
    confirmed_at: new Date().toISOString(),
  };
  if (typeof capacity === 'number' && capacity > 0) update.capacity = capacity;

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .update(update)
    .eq('confirm_token', params.token)
    .select('id, name, confirmed_available')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Invalid link' }, { status: 400 });
  }
  return NextResponse.json({ host: data });
}
