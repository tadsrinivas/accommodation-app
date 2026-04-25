import { NextRequest, NextResponse } from 'next/server';
import { generateMatches, saveMatches } from '@/lib/matcher';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

// Preview proposed matches (does not persist)
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const proposals = await generateMatches();

  // Also return existing saved matches for the dashboard
  const { data: existing } = await supabaseAdmin
    .from('matches')
    .select('*, hosts(name, email), guests(name, email, arrival_date, departure_date, party_size)')
    .order('created_at', { ascending: false });

  return NextResponse.json({ proposals, existing });
}

// Approve proposals - save them as 'proposed' matches
export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { proposals } = await req.json();
  if (!Array.isArray(proposals)) {
    return NextResponse.json({ error: 'proposals must be an array' }, { status: 400 });
  }
  const result = await saveMatches(proposals);
  return NextResponse.json(result);
}
