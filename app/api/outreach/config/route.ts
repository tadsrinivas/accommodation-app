import { NextRequest, NextResponse } from 'next/server';
import { requireCoordinator } from '@/lib/auth';
import { outreachConfig } from '@/lib/outreach-config';

// GET /api/outreach/config — returns the current sequence + delay so the
// dashboard can show what's actually running.
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  return NextResponse.json({
    delay_days: outreachConfig.delayDays,
    sequence: outreachConfig.sequence,
  });
}
