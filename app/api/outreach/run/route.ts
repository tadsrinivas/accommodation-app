import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { decideNextAction, MANUAL_REQUIRED_STEP } from '@/lib/scheduler';
import { OutreachChannel, outreachConfig } from '@/lib/outreach-config';
import { sendEmail, hostReconfirmEmail } from '@/lib/email';
import { sendSms, hostReconfirmSms } from '@/lib/sms';
import { outreachSmsReminderEmail } from '@/lib/email';
import { placeReconfirmCall } from '@/lib/voice';

/**
 * POST /api/outreach/run
 *
 * Auth: Vercel Cron header, CRON_SECRET, or coordinator bearer token.
 *
 * Reads OUTREACH_STAGE_DELAY_DAYS and OUTREACH_CHANNEL_SEQUENCE env vars
 * (via lib/outreach-config) to decide who to contact and how.
 *
 * Safe to invoke repeatedly — each host advances at most one stage per run.
 */
export async function POST(req: NextRequest) {
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
    .eq('do_not_contact', false)
    .eq('approval_status', 'approved');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const summary: Record<string, number> = {
    processed: 0,
    sent_sms: 0,
    sent_email: 0,
    sent_sms_email: 0,
    sent_voice: 0,
    flagged_manual: 0,
    skipped: 0,
    errors: 0,
  };

  const now = new Date();

  for (const host of hosts || []) {
    summary.processed++;
    const action = decideNextAction(host, now);

    if (action.type === 'none') {
      summary.skipped++;
      continue;
    }

    try {
      if (action.type === 'flag_manual') {
        await supabaseAdmin
          .from('hosts')
          .update({
            outreach_step: MANUAL_REQUIRED_STEP,
            outreach_stage: 'manual_required',
            last_attempt_channel: 'flagged',
            last_attempt_at: now.toISOString(),
          })
          .eq('id', host.id);
        summary.flagged_manual++;
        continue;
      }

      // type === 'send'
      const channel = action.channel;
      const counterKey =
        channel === 'sms' ? 'sent_sms' :
        channel === 'email' ? 'sent_email' :
        channel === 'sms+email' ? 'sent_sms_email' :
        'sent_voice';

      await executeChannel(channel, host);
      summary[counterKey]++;

      const updates: Record<string, unknown> = {
        outreach_step: action.nextStep,
        last_attempt_at: now.toISOString(),
        last_attempt_channel: channel,
      };
      if (host.outreach_step === -1) {
        updates.outreach_started_at = now.toISOString();
        updates.outreach_stage = 'sent_initial'; // legacy column, audit only
      } else {
        // Map step → legacy stage label for the dashboard and logs
        updates.outreach_stage = legacyStageLabel(action.nextStep, channel);
      }

      // Bump per-channel attempt counters (best-effort audit)
      if (channel === 'sms' || channel === 'sms+email') {
        updates.sms_attempts = (host.sms_attempts || 0) + (host.phone ? 1 : 0);
      }
      if (channel === 'email' || channel === 'sms+email') {
        updates.email_attempts = (host.email_attempts || 0) + 1;
      }
      if (channel === 'voice') {
        updates.voice_attempts = (host.voice_attempts || 0) + 1;
      }

      await supabaseAdmin.from('hosts').update(updates).eq('id', host.id);
    } catch (err) {
      summary.errors++;
      console.error(`Outreach error for host ${host.id}:`, err);
    }
  }

  return NextResponse.json({
    ...summary,
    config: {
      delay_days: outreachConfig.delayDays,
      sequence: outreachConfig.sequence,
    },
  });
}

// Vercel Cron uses GET — accept both
export const GET = POST;

async function executeChannel(channel: OutreachChannel, host: any) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const link = `${siteUrl}/host/${host.confirm_token}`;

  if ((channel === 'email' || channel === 'sms+email') && host.email) {
    const { subject, html, text } = hostReconfirmEmail(host);
    await sendEmail({
      to: host.email,
      subject, html, text,
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'reconfirm',
    });
  }

  if ((channel === 'sms' || channel === 'sms+email') && host.phone) {
    await sendSms({
      to: host.phone,
      body: hostReconfirmSms(host.name, link),
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'reconfirm',
    });
  }

  // Dual-channel resilience: if the configured stage is 'sms' (alone), also send
  // a reminder email (when email is available). This way SMS deliverability
  // issues (e.g. A2P registration delays) don't silently cause the host to miss
  // the reminder.
  if (channel === 'sms' && host.email) {
    const tpl = outreachSmsReminderEmail({ name: host.name, link });
    await sendEmail({
      to: host.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'reconfirm_sms_companion',
    });
  }

  if (channel === 'voice' && host.phone) {
    await placeReconfirmCall({
      to: host.phone,
      hostId: host.id,
      hostName: host.name,
      confirmToken: host.confirm_token,
    });
  }
}

/**
 * Map (step, channel) back to the legacy stage label used by the dashboard
 * for backwards-compatible display. Doesn't affect logic.
 */
function legacyStageLabel(step: number, channel: OutreachChannel): string {
  if (step === MANUAL_REQUIRED_STEP) return 'manual_required';
  if (step === 0) return 'sent_initial';
  if (channel === 'sms') return 'sent_sms_2';
  if (channel === 'email') return 'sent_email_2';
  if (channel === 'voice') return 'sent_voice';
  return 'sent_initial';
}
