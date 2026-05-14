import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { getCapacityUsage } from '@/lib/capacity';

export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: hosts, error } = await supabaseAdmin
    .from('hosts')
    .select('*')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Augment each host with used_capacity and remaining_capacity. These don't
  // exist as columns — they're derived from active matches via getCapacityUsage.
  const hostIds = (hosts || []).map((h) => h.id);
  const usage = await getCapacityUsage(hostIds);
  const augmented = (hosts || []).map((h) => ({
    ...h,
    used_capacity: usage.get(h.id) || 0,
    remaining_capacity: h.capacity - (usage.get(h.id) || 0),
  }));

  return NextResponse.json({ hosts: augmented });
}

export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // ------------------------------------------------------------
  // Trigger sequential outreach.
  // ------------------------------------------------------------
  if (action === 'reconfirm') {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL}/api/outreach/run`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  }

  // ------------------------------------------------------------
  // Create a single host manually
  // ------------------------------------------------------------
  if (action === 'create') {
    const { name, email, phone, capacity, address, notes } = body;
    const { data, error } = await supabaseAdmin
      .from('hosts')
      .insert({ name, email, phone, capacity, address, notes })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ host: data });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
