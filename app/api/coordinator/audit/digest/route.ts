import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/email';

/**
 * Daily digest of records needing manual coordinator attention.
 * Triggered by Vercel Cron (vercel.json) at the configured schedule.
 *
 * Sends an email if any of these are non-zero:
 *   - hosts without email (in active outreach)
 *   - stuck voice intakes (sms_sent in last 7 days, never completed)
 *   - confirmed hosts without email (welcome couldn't be sent)
 */

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}

async function run(req: NextRequest) {
  const coordEmail = process.env.COORDINATOR_EMAIL;
  if (!coordEmail) {
    return NextResponse.json({ skipped: 'COORDINATOR_EMAIL not set' });
  }

  // Same three queries as the audit page
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [hostsNoEmailResult, stuckIntakesResult, confirmedNoEmailResult] = await Promise.all([
    supabaseAdmin
      .from('hosts')
      .select('name, phone, capacity, source, last_attempt_at, confirmed_available')
      .or('email.is.null,email.eq.')
      .eq('approval_status', 'approved')
      .eq('host_type', 'residence')
      .is('cancelled_at', null),
    supabaseAdmin
      .from('guest_intake_sessions')
      .select('name, caller_phone, party_size, arrival_date, sms_sent_at')
      .eq('step', 'sms_sent')
      .gte('sms_sent_at', sevenDaysAgo),
    supabaseAdmin
      .from('hosts')
      .select('name, phone, capacity, confirmed_at')
      .eq('confirmed_available', true)
      .eq('host_type', 'residence')
      .or('email.is.null,email.eq.')
      .is('cancelled_at', null),
  ]);

  const hostsNoEmail = hostsNoEmailResult.data || [];
  const stuckIntakes = stuckIntakesResult.data || [];
  const confirmedNoEmail = confirmedNoEmailResult.data || [];

  const total = hostsNoEmail.length + stuckIntakes.length + confirmedNoEmail.length;

  if (total === 0) {
    return NextResponse.json({ ok: true, sent: false, total: 0 });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const eventName = process.env.EVENT_NAME || 'the event';

  const html = `
    <p>Daily summary of records that need manual attention for <strong>${eventName}</strong>.</p>
    <p><strong>${total}</strong> total records.</p>

    ${hostsNoEmail.length > 0 ? `
      <h3>Hosts without email (${hostsNoEmail.length})</h3>
      <p style="font-size:12px;color:#64748b">Imported hosts being contacted via phone/SMS only. Call them to capture email.</p>
      <ul>
        ${hostsNoEmail.slice(0, 10).map((h: any) =>
          `<li>${escape(h.name)} — ${escape(h.phone || 'no phone')} · capacity ${h.capacity || '?'}</li>`
        ).join('\n')}
      </ul>
      ${hostsNoEmail.length > 10 ? `<p style="font-size:12px;color:#64748b">+ ${hostsNoEmail.length - 10} more</p>` : ''}
    ` : ''}

    ${stuckIntakes.length > 0 ? `
      <h3>Stuck voice intakes (${stuckIntakes.length})</h3>
      <p style="font-size:12px;color:#64748b">Guests called and gave details by voice but never finished the web form. SMS link likely didn't arrive.</p>
      <ul>
        ${stuckIntakes.slice(0, 10).map((s: any) =>
          `<li>${escape(s.name || '(no name)')} — ${escape(s.caller_phone || 'no phone')} · ${s.party_size} guests · arrival ${escape(s.arrival_date || '?')}</li>`
        ).join('\n')}
      </ul>
      ${stuckIntakes.length > 10 ? `<p style="font-size:12px;color:#64748b">+ ${stuckIntakes.length - 10} more</p>` : ''}
    ` : ''}

    ${confirmedNoEmail.length > 0 ? `
      <h3>Confirmed hosts needing manual welcome (${confirmedNoEmail.length})</h3>
      <p style="font-size:12px;color:#64748b">These hosts confirmed yes but had no email — couldn't send the welcome message with profile link.</p>
      <ul>
        ${confirmedNoEmail.slice(0, 10).map((h: any) =>
          `<li>${escape(h.name)} — ${escape(h.phone || 'no phone')} · capacity ${h.capacity || '?'} · confirmed ${escape(h.confirmed_at || '?')}</li>`
        ).join('\n')}
      </ul>
      ${confirmedNoEmail.length > 10 ? `<p style="font-size:12px;color:#64748b">+ ${confirmedNoEmail.length - 10} more</p>` : ''}
    ` : ''}

    <p style="margin-top:20px"><a href="${siteUrl}/coordinator/audit" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Open audit dashboard</a></p>
    <p style="font-size:12px;color:#64748b">You're receiving this because you're the coordinator. This digest sends only when there are records needing attention.</p>
  `;

  const text = `Daily audit summary for ${eventName}: ${total} records need attention.

Hosts without email: ${hostsNoEmail.length}
Stuck voice intakes: ${stuckIntakes.length}
Confirmed hosts needing welcome: ${confirmedNoEmail.length}

Open audit: ${siteUrl}/coordinator/audit`;

  const result = await sendEmail({
    to: coordEmail,
    subject: `[Audit] ${total} records need attention — ${eventName}`,
    html,
    text,
    recipientType: 'host',
    recipientId: '00000000-0000-0000-0000-000000000000',
    purpose: 'coordinator_audit_digest',
  });

  return NextResponse.json({
    ok: result.ok,
    sent: true,
    counts: {
      hostsNoEmail: hostsNoEmail.length,
      stuckIntakes: stuckIntakes.length,
      confirmedNoEmail: confirmedNoEmail.length,
      total,
    },
  });
}

function escape(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
