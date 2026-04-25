/**
 * Sequential outreach scheduler (Option D).
 *
 * Decides what action to take next for each non-responded host based on
 * how long ago we last contacted them.
 *
 * Schedule:
 *   Stage 'pending'        → action 'send_initial'   (SMS + email immediately)
 *   Stage 'sent_initial'   → after 2 days → 'send_sms_2'
 *   Stage 'sent_sms_2'     → after 2 days → 'send_email_2'
 *   Stage 'sent_email_2'   → after 2 days → 'send_voice'
 *   Stage 'sent_voice'     → after 2 days → 'flag_manual'
 *   Stage 'manual_required'→ no action (coordinator handles)
 *   Stage 'responded'      → no action
 */

export type OutreachStage =
  | 'pending'
  | 'sent_initial'
  | 'sent_sms_2'
  | 'sent_email_2'
  | 'sent_voice'
  | 'manual_required'
  | 'responded';

export type OutreachAction =
  | 'send_initial'
  | 'send_sms_2'
  | 'send_email_2'
  | 'send_voice'
  | 'flag_manual'
  | 'none';

const HOURS = 60 * 60 * 1000;
const STAGE_DELAY_MS = 2 * 24 * HOURS; // 2 days between stages

interface HostOutreachState {
  outreach_stage: OutreachStage;
  last_attempt_at: string | null;
  confirmed_available: boolean | null;
  do_not_contact: boolean;
  phone: string | null;
  email: string;
}

export function decideNextAction(
  host: HostOutreachState,
  now: Date = new Date()
): OutreachAction {
  if (host.confirmed_available !== null) return 'none';
  if (host.do_not_contact) return 'none';
  if (host.outreach_stage === 'responded') return 'none';
  if (host.outreach_stage === 'manual_required') return 'none';

  if (host.outreach_stage === 'pending') return 'send_initial';

  const last = host.last_attempt_at ? new Date(host.last_attempt_at) : null;
  if (!last) return 'send_initial';

  const elapsed = now.getTime() - last.getTime();
  if (elapsed < STAGE_DELAY_MS) return 'none'; // not time yet

  switch (host.outreach_stage) {
    case 'sent_initial':
      return host.phone ? 'send_sms_2' : 'send_email_2';
    case 'sent_sms_2':
      return 'send_email_2';
    case 'sent_email_2':
      return host.phone ? 'send_voice' : 'flag_manual';
    case 'sent_voice':
      return 'flag_manual';
    default:
      return 'none';
  }
}

/** Map an action to the next stage label to write back. */
export function stageAfterAction(action: OutreachAction): OutreachStage | null {
  switch (action) {
    case 'send_initial':
      return 'sent_initial';
    case 'send_sms_2':
      return 'sent_sms_2';
    case 'send_email_2':
      return 'sent_email_2';
    case 'send_voice':
      return 'sent_voice';
    case 'flag_manual':
      return 'manual_required';
    default:
      return null;
  }
}
