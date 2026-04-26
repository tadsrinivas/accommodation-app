/**
 * Sequential outreach scheduler.
 *
 * Decides what action to take next for each non-responded host based on
 * the configured channel sequence (lib/outreach-config.ts) and how long
 * ago we last contacted them.
 *
 * State model:
 *   outreach_step = -1   → nothing sent yet
 *   outreach_step = 0..N → that many stages from the configured sequence have been sent
 *   outreach_step = 999  → exhausted all stages, flagged for manual call
 */

import { outreachConfig, OutreachChannel } from './outreach-config';

export type OutreachAction =
  | { type: 'send'; channel: OutreachChannel; nextStep: number }
  | { type: 'flag_manual' }
  | { type: 'none' };

const MANUAL_STEP = 999;

interface HostOutreachState {
  outreach_step: number;
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
  // Stop if already responded, opted out, or flagged for manual
  if (host.confirmed_available !== null) return { type: 'none' };
  if (host.do_not_contact) return { type: 'none' };
  if (host.outreach_step === MANUAL_STEP) return { type: 'none' };

  const sequence = outreachConfig.sequence;

  // Brand new host — send the first configured stage immediately
  if (host.outreach_step === -1) {
    const channel = sequence[0];
    if (!channel) return { type: 'flag_manual' }; // empty sequence safety net
    if (!canUseChannel(channel, host)) {
      // First stage isn't applicable to this host (e.g. voice/sms but no phone)
      // Fast-forward to the next applicable stage
      return findNextApplicable(0, host);
    }
    return { type: 'send', channel, nextStep: 0 };
  }

  // Mid-sequence — check the wait period
  if (host.last_attempt_at) {
    const last = new Date(host.last_attempt_at).getTime();
    if (now.getTime() - last < outreachConfig.delayMs) {
      return { type: 'none' }; // not time yet
    }
  }

  // Move to the next stage
  const nextIdx = host.outreach_step + 1;
  return findNextApplicable(nextIdx, host);
}

/**
 * Walks forward through the sequence from `startIdx` skipping stages the
 * host can't receive (e.g. SMS or voice when no phone on file). Returns
 * either a 'send' action or 'flag_manual' if we've run off the end.
 */
function findNextApplicable(startIdx: number, host: HostOutreachState): OutreachAction {
  const sequence = outreachConfig.sequence;
  for (let i = startIdx; i < sequence.length; i++) {
    const channel = sequence[i];
    if (canUseChannel(channel, host)) {
      return { type: 'send', channel, nextStep: i };
    }
  }
  return { type: 'flag_manual' };
}

function canUseChannel(channel: OutreachChannel, host: HostOutreachState): boolean {
  switch (channel) {
    case 'email':
      return Boolean(host.email);
    case 'sms':
    case 'voice':
      return Boolean(host.phone);
    case 'sms+email':
      // Accept this stage even if only one channel is available;
      // the executor will skip the missing half. Still requires email at minimum.
      return Boolean(host.email);
  }
}

export function isManualStep(step: number): boolean {
  return step === MANUAL_STEP;
}

export const MANUAL_REQUIRED_STEP = MANUAL_STEP;
