import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decideNextAction, stageAfterAction, OutreachAction } from '@/lib/scheduler';
import { sendEmail, hostReconfirmEmail } from '@/lib/email';
import { sendSms, hostReconfirmSms } from '@/lib/sms';
import { placeReconfirmCall } from '@/lib/voice';

/**
 * POST /api/outreach/run
 *
 * Auth: either Vercel Cron (x-vercel-cron header) or coordinator bearer token.
 *
 * Picks all hosts who haven't responded and aren't on do_not_contact, decides
 * the next action per the schedule, executes it, and updates the stage.
 *
 * Safe to invoke repeatedly — actions only fire when their delay has elapsed.
 */
export async function POST(req: NextRequest) {
  // Auth: Vercel Cron uses CRON_SECRET via Authorization: Bearer <secret>
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET;
  const coordinatorPwd = process.env.COORDINATOR_PASSWORD;
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';

  const authorized =
    isVercelCron ||
    (cronSecret && provided === cronSecret) ||
    (coordinatorPwd && provided === coordinatorPwd);

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: hosts, error } = await supabaseAdmin
    .from('hosts')
    .select('*')
    .is('confirmed_available', null)
    .eq('do_not_contact', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary = {
    processed: 0,
    send_initial: 0,
    send_sms_2: 0,
    send_email_2: 0,
    send_voice: 0,
    flag_manual: 0,
    skipped: 0,
    errors: 0,
  };

  const now = new Date();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  for (const host of hosts || []) {
    summary.processed++;
    const action = decideNextAction(host, now);
    if (action === 'none') {
      summary.skipped++;
      continue;
    }

    try {
      await executeAction(host, action, siteUrl);
      summary[action]++;

      const newStage = stageAfterAction(action);
      const updates: Record<string, unknown> = {
        last_attempt_at: now.toISOString(),
        last_attempt_channel: channelForAction(action),
      };
      if (newStage) updates.outreach_stage = newStage;
      if (host.outreach_stage === 'pending') updates.outreach_started_at = now.toISOString();

      // Increment per-channel counters
      if (action === 'send_initial') {
        updates.sms_attempts = (host.sms_attempts || 0) + (host.phone ? 1 : 0);
        updates.email_attempts = (host.email_attempts || 0) + 1;
      } else if (action === 'send_sms_2') {
        updates.sms_attempts = (host.sms_attempts || 0) + 1;
      } else if (action === 'send_email_2') {
        updates.email_attempts = (host.email_attempts || 0) + 1;
      } else if (action === 'send_voice') {
        updates.voice_attempts = (host.voice_attempts || 0) + 1;
      }

      await supabaseAdmin.from('hosts').update(updates).eq('id', host.id);
    } catch (err) {
      summary.errors++;
      console.error(`Outreach error for host ${host.id}:`, err);
    }
  }

  return NextResponse.json(summary);
}

// Vercel Cron uses GET — accept both methods
export const GET = POST;

function channelForAction(action: OutreachAction): string {
  switch (action) {
    case 'send_initial': return 'sms+email';
    case 'send_sms_2': return 'sms';
    case 'send_email_2': return 'email';
    case 'send_voice': return 'voice';
    case 'flag_manual': return 'flagged';
    default: return 'none';
  }
}

async function executeAction(host: any, action: OutreachAction, siteUrl: string) {
  const link = `${siteUrl}/host/${host.confirm_token}`;

  if (action === 'send_initial') {
    const { subject, html, text } = hostReconfirmEmail(host);
    await sendEmail({
      to: host.email, subject, html, text,
      recipientType: 'host', recipientId: host.id, purpose: 'reconfirm_initial',
    });
    if (host.phone) {
      await sendSms({
        to: host.phone, body: hostReconfirmSms(host.name, link),
        recipientType: 'host', recipientId: host.id, purpose: 'reconfirm_initial',
      });
    }
    return;
  }

  if (action === 'send_sms_2') {
    if (!host.phone) return;
    const body = `Hi ${host.name}, just a friendly reminder — can you host for the event this year? Please respond here: ${link}`;
    await sendSms({
      to: host.phone, body,
      recipientType: 'host', recipientId: host.id, purpose: 'reconfirm_sms_2',
    });
    return;
  }

  if (action === 'send_email_2') {
    const eventName = process.env.EVENT_NAME || 'our event';
    const subject = `${eventName}: Following up — can you host this year?`;
    const html = `
      <p>Hi ${host.name},</p>
      <p>I wanted to follow up gently — we're still trying to confirm hosts for ${eventName} and haven't heard back from you yet.</p>
      <p>If you're able to host, please click below. If you can't this year, that's totally fine — we just want to remove you from our list so we don't keep bothering you.</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Respond here</a></p>
      <p>Or visit: ${link}</p>
      <p>Thank you so much!</p>`;
    await sendEmail({
      to: host.email, subject, html,
      recipientType: 'host', recipientId: host.id, purpose: 'reconfirm_email_2',
    });
    return;
  }

  if (action === 'send_voice') {
    if (!host.phone) return;
    await placeReconfirmCall({
      to: host.phone,
      hostId: host.id,
      hostName: host.name,
      confirmToken: host.confirm_token,
    });
    return;
  }

  if (action === 'flag_manual') {
    // Nothing to send — just transition stage. The dashboard will surface this host.
    return;
  }
}
