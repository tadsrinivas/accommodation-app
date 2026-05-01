import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';

/**
 * Coordinator audit API. Returns records that need manual attention because
 * the system can't auto-notify them via email (and SMS is unreliable until
 * A2P is approved).
 *
 * Three buckets:
 *   1. Hosts without email — outreach contacts them via phone/SMS only;
 *      coordinator sends welcome/profile link manually after they confirm.
 *   2. Stuck voice intakes — guest called, completed voice steps, but never
 *      finished the web form (within last 7 days).
 *   3. Confirmed hosts without email — confirmed via voice but couldn't
 *      receive the welcome email; coordinator should follow up.
 */
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  // 1. Residence hosts without email, in the active outreach pipeline.
  // Hotel hosts are excluded — they don't go through outreach so missing
  // email isn't a blocker for them.
  const { data: hostsNoEmail, error: e1 } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone, capacity, source, outreach_step, last_attempt_at, confirmed_available, confirm_token')
    .or('email.is.null,email.eq.')
    .eq('approval_status', 'approved')
    .eq('host_type', 'residence')
    .is('cancelled_at', null)
    .order('last_attempt_at', { ascending: false, nullsFirst: false });

  // 2. Stuck voice intakes — sessions stopped at 'sms_sent' step (didn't reach 'completed')
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stuckIntakes, error: e2 } = await supabaseAdmin
    .from('guest_intake_sessions')
    .select('id, name, caller_phone, party_size, arrival_date, departure_date, sms_sent_at, confirm_token')
    .eq('step', 'sms_sent')
    .gte('sms_sent_at', sevenDaysAgo)
    .order('sms_sent_at', { ascending: false });

  const trulyStuck = stuckIntakes || [];

  // 3. Confirmed-yes residence hosts without email — these need manual welcome.
  // Hotels are auto-confirmed without going through this flow, so they're
  // excluded.
  const { data: confirmedNoEmail, error: e3 } = await supabaseAdmin
    .from('hosts')
    .select('id, name, phone, capacity, confirmed_at, confirm_token')
    .eq('confirmed_available', true)
    .eq('host_type', 'residence')
    .or('email.is.null,email.eq.')
    .is('cancelled_at', null)
    .order('confirmed_at', { ascending: false });

  if (e1 || e2 || e3) {
    return NextResponse.json(
      { error: e1?.message || e2?.message || e3?.message || 'Query failed' },
      { status: 500 }
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';

  return NextResponse.json({
    counts: {
      hostsNoEmail: hostsNoEmail?.length || 0,
      stuckIntakes: trulyStuck.length,
      confirmedNoEmail: confirmedNoEmail?.length || 0,
    },
    hostsNoEmail: (hostsNoEmail || []).map((h: any) => ({
      ...h,
      profile_link: `${siteUrl}/host/${h.confirm_token}/edit`,
    })),
    stuckIntakes: trulyStuck.map((s: any) => ({
      ...s,
      completion_link: `${siteUrl}/intake/${s.confirm_token}`,
    })),
    confirmedNoEmail: (confirmedNoEmail || []).map((h: any) => ({
      ...h,
      profile_link: `${siteUrl}/host/${h.confirm_token}/edit`,
    })),
  });
}
