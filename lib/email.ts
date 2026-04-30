import { Resend } from 'resend';
import { supabaseAdmin } from './supabase';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
  recipientType: 'host' | 'guest';
  recipientId: string;
  purpose: string;
}

export async function sendEmail(args: SendEmailArgs) {
  try {
    const result = await resend.emails.send({
      from: process.env.EMAIL_FROM!,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });

    await supabaseAdmin.from('notifications').insert({
      recipient_type: args.recipientType,
      recipient_id: args.recipientId,
      channel: 'email',
      purpose: args.purpose,
      success: !result.error,
      error_message: result.error?.message ?? null,
      provider_id: result.data?.id ?? null,
    });

    return { ok: !result.error, id: result.data?.id, error: result.error?.message };
  } catch (err: any) {
    await supabaseAdmin.from('notifications').insert({
      recipient_type: args.recipientType,
      recipient_id: args.recipientId,
      channel: 'email',
      purpose: args.purpose,
      success: false,
      error_message: err?.message ?? String(err),
    });
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// ============================================================
// Email templates
// ============================================================

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
const eventName = () => process.env.EVENT_NAME || 'Our Event';
const eventDates = () => process.env.EVENT_DATES || '';

export function hostReconfirmEmail(host: { name: string; confirm_token: string }) {
  const link = `${siteUrl()}/host/${host.confirm_token}`;
  const subject = `${eventName()}: Can you host again this year?`;
  const html = `
    <p>Hi ${host.name},</p>
    <p>Thank you for hosting with us last year! We're organizing accommodation for <strong>${eventName()}</strong> (${eventDates()}) and hoped you might be available again.</p>
    <p>Please click below to confirm your availability:</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Confirm availability</a></p>
    <p>Or copy this link: ${link}</p>
    <p>Thank you so much for your generosity!</p>
  `;
  const text = `Hi ${host.name},\n\nCan you host again this year for ${eventName()} (${eventDates()})?\nConfirm here: ${link}\n\nThank you!`;
  return { subject, html, text };
}

export function matchProposedHostEmail(args: {
  hostName: string;
  guestName: string;
  arrival: string;
  departure: string;
  partySize: number;
  token: string;
}) {
  const link = `${siteUrl()}/match/host/${args.token}`;
  return {
    subject: `${eventName()}: Guest match proposal`,
    html: `
      <p>Hi ${args.hostName},</p>
      <p>We'd like to match you with a guest for ${eventName()}:</p>
      <ul>
        <li><strong>Guest:</strong> ${args.guestName}</li>
        <li><strong>Party size:</strong> ${args.partySize}</li>
        <li><strong>Arrival:</strong> ${args.arrival}</li>
        <li><strong>Departure:</strong> ${args.departure}</li>
      </ul>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Accept or decline</a></p>
      <p>Link: ${link}</p>
    `,
    text: `Guest match for ${eventName()}: ${args.guestName}, ${args.partySize} people, ${args.arrival} to ${args.departure}. Respond: ${link}`,
  };
}

export function matchProposedGuestEmail(args: {
  guestName: string;
  arrival: string;
  departure: string;
  token: string;
}) {
  const link = `${siteUrl()}/match/guest/${args.token}`;
  return {
    subject: `${eventName()}: Accommodation match found`,
    html: `
      <p>Hi ${args.guestName},</p>
      <p>We've found a host for your stay (${args.arrival} to ${args.departure}) at ${eventName()}.</p>
      <p>Please confirm you still need accommodation:</p>
      <p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Accept or decline</a></p>
      <p>Once both you and the host confirm, we'll share contact details with each of you.</p>
      <p>Link: ${link}</p>
    `,
    text: `Accommodation match found for ${args.arrival} to ${args.departure}. Respond: ${link}`,
  };
}

export function contactsExchangedEmail(args: {
  recipientName: string;
  otherPartyName: string;
  otherPartyEmail: string;
  otherPartyPhone: string | null;
  otherPartyAddress: string | null;
  role: 'host' | 'guest';
}) {
  const roleLabel = args.role === 'host' ? 'guest' : 'host';
  const addressLine = args.otherPartyAddress
    ? `<li><strong>Address:</strong> ${args.otherPartyAddress}</li>`
    : '';
  return {
    subject: `${eventName()}: Contact details for your ${roleLabel}`,
    html: `
      <p>Hi ${args.recipientName},</p>
      <p>Your ${roleLabel} has confirmed the match. Here are their contact details:</p>
      <ul>
        <li><strong>Name:</strong> ${args.otherPartyName}</li>
        <li><strong>Email:</strong> ${args.otherPartyEmail}</li>
        ${args.otherPartyPhone ? `<li><strong>Phone:</strong> ${args.otherPartyPhone}</li>` : ''}
        ${addressLine}
      </ul>
      <p>Please coordinate directly with them from here. Thank you!</p>
    `,
    text: `Your ${roleLabel}: ${args.otherPartyName}, ${args.otherPartyEmail}${args.otherPartyPhone ? ', ' + args.otherPartyPhone : ''}`,
  };
}

// ============================================================
// Host signup approval workflow
// ============================================================

export function hostSignupReceivedEmail(host: { name: string }) {
  return {
    subject: `${eventName()}: Thanks for offering to host`,
    html: `
      <p>Hi ${host.name},</p>
      <p>Thank you so much for offering to host accommodation for <strong>${eventName()}</strong>!</p>
      <p>We've received your details and a coordinator will review them within a day or two. You'll get another email once you're confirmed in our host pool.</p>
      <p>If you have questions, just reply to this email.</p>
    `,
    text: `Hi ${host.name}, thanks for offering to host for ${eventName()}. A coordinator will review your details and get back to you shortly.`,
  };
}

export function hostSignupCoordinatorAlertEmail(args: {
  hostName: string;
  hostEmail: string;
  hostPhone: string | null;
  capacity: number;
  address: string | null;
  notes: string | null;
}) {
  const link = `${siteUrl()}/coordinator`;
  return {
    subject: `New host signup: ${args.hostName}`,
    html: `
      <p>A new host has signed up and is awaiting your approval:</p>
      <ul>
        <li><strong>Name:</strong> ${args.hostName}</li>
        <li><strong>Email:</strong> ${args.hostEmail}</li>
        <li><strong>Phone:</strong> ${args.hostPhone || '—'}</li>
        <li><strong>Capacity:</strong> ${args.capacity}</li>
        <li><strong>Address:</strong> ${args.address || '—'}</li>
        <li><strong>Notes:</strong> ${args.notes || '—'}</li>
      </ul>
      <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Review in dashboard</a></p>
    `,
    text: `New host signup: ${args.hostName} (${args.hostEmail}, capacity ${args.capacity}). Review at ${link}`,
  };
}

export function hostApprovedEmail(host: { name: string; confirm_token: string }) {
  const editLink = `${siteUrl()}/host/${host.confirm_token}/edit`;
  return {
    subject: `${eventName()}: You're confirmed as a host!`,
    html: `
      <p>Hi ${host.name},</p>
      <p>Great news — you're now confirmed in our host pool for <strong>${eventName()}</strong>. Thank you so much for volunteering!</p>
      <p>When we have a guest match for you, you'll get an email asking you to accept or decline. You can also update your details (capacity, address, notes) anytime here:</p>
      <p><a href="${editLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Manage my hosting profile</a></p>
      <p>Or copy this link: ${editLink}</p>
    `,
    text: `Hi ${host.name}, you're confirmed as a host for ${eventName()}. Manage your profile: ${editLink}`,
  };
}

export function hostRejectedEmail(host: { name: string }, note?: string) {
  const noteBlock = note
    ? `<p>${note}</p>`
    : `<p>We've already filled our host pool for this year, but we'll keep your details on file for future events. We really appreciate the offer.</p>`;
  return {
    subject: `${eventName()}: Thank you for your offer to host`,
    html: `
      <p>Hi ${host.name},</p>
      <p>Thank you so much for offering to host accommodation for <strong>${eventName()}</strong>.</p>
      ${noteBlock}
      <p>We genuinely appreciate your generosity.</p>
    `,
    text: `Hi ${host.name}, thank you for offering to host for ${eventName()}. ${note || "We've filled our host pool for this year but appreciate the offer."}`,
  };
}

// ============================================================
// Email templates that mirror SMS-only purposes (for dual-channel notify).
// Each template returns { subject, html, text } matching the email helper signature.
// ============================================================

/** Voice intake completion link — sent after guest finishes voice intake call. */
export function intakeCompletionEmail(args: { name: string | null; link: string }) {
  const greeting = args.name ? `Hi ${args.name}` : 'Hi';
  return {
    subject: `${eventName()}: Finish your accommodation request`,
    html: `
      <p>${greeting},</p>
      <p>Thanks for calling! To complete your accommodation request, please tap the link below to confirm your details and add your email address.</p>
      <p><a href="${args.link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Complete my request</a></p>
      <p>Or copy this link: ${args.link}</p>
    `,
    text: `${greeting}, please complete your accommodation request: ${args.link}`,
  };
}

/** Modify link for an existing guest record. */
export function guestModifyLinkEmail(args: { name: string; link: string }) {
  return {
    subject: `${eventName()}: Update your accommodation request`,
    html: `
      <p>Hi ${args.name},</p>
      <p>You can update your accommodation request using the link below. The link will expire in 24 hours.</p>
      <p><a href="${args.link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Update my request</a></p>
      <p>Or copy this link: ${args.link}</p>
    `,
    text: `Hi ${args.name}, update your request here: ${args.link} (expires in 24 hours)`,
  };
}

/** Modify link for an existing host record. */
export function hostModifyLinkEmail(args: { name: string; link: string }) {
  return {
    subject: `${eventName()}: Update your hosting profile`,
    html: `
      <p>Hi ${args.name},</p>
      <p>You can update your hosting profile (capacity, address, notes) using the link below.</p>
      <p><a href="${args.link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Manage my profile</a></p>
      <p>Or copy this link: ${args.link}</p>
    `,
    text: `Hi ${args.name}, manage your hosting profile: ${args.link}`,
  };
}

/** Confirmation that a guest's request has been cancelled. */
export function guestCancellationEmail(args: { name: string }) {
  return {
    subject: `${eventName()}: Your accommodation request was cancelled`,
    html: `
      <p>Hi ${args.name},</p>
      <p>Your accommodation request has been cancelled.</p>
      <p>If this was a mistake, please contact the event coordinator and we'll restore your request.</p>
    `,
    text: `Your accommodation request was cancelled. If this was a mistake, please contact the event coordinator.`,
  };
}

/** Confirmation that a host has been removed from the pool. */
export function hostCancellationEmail(args: { name: string }) {
  return {
    subject: `${eventName()}: You've been removed from the host pool`,
    html: `
      <p>Hi ${args.name},</p>
      <p>You've been removed from the host pool.</p>
      <p>If this was a mistake, please contact the event coordinator and we'll add you back.</p>
      <p>Thank you for your generosity in hosting with us.</p>
    `,
    text: `You've been removed from the host pool. If this was a mistake, please contact the event coordinator.`,
  };
}

/** Host-signup link sent after voice "press 1 for new host". */
export function hostSignupLinkEmail(args: { link: string }) {
  return {
    subject: `${eventName()}: Complete your host signup`,
    html: `
      <p>Hi,</p>
      <p>Thank you so much for offering to host! To complete your signup, please tap the link below. After you submit, a coordinator will review and approve.</p>
      <p><a href="${args.link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Complete my signup</a></p>
      <p>Or copy this link: ${args.link}</p>
    `,
    text: `Thanks for offering to host! Complete your signup: ${args.link}`,
  };
}

/** Outreach SMS reminder #2 — Day 2 check-in (parallel email version). */
export function outreachSmsReminderEmail(args: { name: string; link: string }) {
  return {
    subject: `${eventName()}: Friendly reminder — can you host?`,
    html: `
      <p>Hi ${args.name},</p>
      <p>Just a friendly reminder — can you host for ${eventName()} this year? It only takes a moment to respond.</p>
      <p><a href="${args.link}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Respond here</a></p>
      <p>Or copy this link: ${args.link}</p>
      <p>Thank you!</p>
    `,
    text: `Hi ${args.name}, friendly reminder — can you host for ${eventName()}? Respond: ${args.link}`,
  };
}

/**
 * "You're confirmed as a host!" email — sent when a host reconfirms via web
 * or voice on first transition from null → true. Mirrors the message that
 * approved-signup hosts already receive, so the experience is consistent
 * across all paths into the active host pool.
 */
export function hostReconfirmedEmail(host: { name: string; confirm_token: string }) {
  const editLink = `${siteUrl()}/host/${host.confirm_token}/edit`;
  return {
    subject: `${eventName()}: Thank you for confirming!`,
    html: `
      <p>Hi ${host.name},</p>
      <p>Thank you so much for confirming you can host for <strong>${eventName()}</strong> this year. We really appreciate your generosity!</p>
      <p>You can update your hosting details (capacity, address, notes) anytime here:</p>
      <p><a href="${editLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Manage my hosting profile</a></p>
      <p>Or copy this link: ${editLink}</p>
      <p>We'll be in touch when we have a guest match for you.</p>
    `,
    text: `Hi ${host.name}, thanks for confirming you can host for ${eventName()}! Manage your profile: ${editLink}. We'll be in touch when we have a guest match.`,
  };
}
