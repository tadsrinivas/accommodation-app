import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .select('*')
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hosts: data });
}

export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json();
  const { action } = body;

  // ------------------------------------------------------------
  // Trigger sequential outreach. This delegates to the cron-style
  // /api/outreach/run logic so the same scheduling rules apply
  // whether triggered manually or via cron.
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
