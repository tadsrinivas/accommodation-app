import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { z } from 'zod';

/**
 * Coordinator broadcast: send a custom message to all active guests.
 *
 *   GET   /api/coordinator/broadcast  — returns count of eligible recipients
 *   POST  /api/coordinator/broadcast  — sends the broadcast email
 *
 * "Active guests" = guests with cancelled_at IS NULL AND email IS NOT NULL.
 * Personalization: {name} in subject or body is replaced with the guest's name.
 */

const BroadcastSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(200),
  body: z.string().min(1, 'Body is required').max(5000),
  // Optional: client can send N (count it expects to email) for sanity checking
  expected_count: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  // Count active guests with email
  const { count, error } = await supabaseAdmin
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .is('cancelled_at', null)
    .not('email', 'is', null)
    .neq('email', '');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ count: count ?? 0 });
}

export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = BroadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { subject, body: msgBody, expected_count } = parsed.data;

  // Load active guests with email
  const { data: guests, error } = await supabaseAdmin
    .from('guests')
    .select('id, name, email')
    .is('cancelled_at', null)
    .not('email', 'is', null)
    .neq('email', '');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const recipients = guests || [];

  // Sanity check: if client sent expected_count, verify it still matches.
  // Prevents a race where guests are added/removed between the count fetch
  // and the send click.
  if (expected_count !== undefined && expected_count !== recipients.length) {
    return NextResponse.json(
      {
        error: 'count_mismatch',
        message: `Recipient list changed since you confirmed. Expected ${expected_count}, now ${recipients.length}. Please review and resend.`,
        actual_count: recipients.length,
      },
      { status: 409 }
    );
  }

  if (recipients.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0, message: 'No active guests with email to send to.' });
  }

  // Convert plain-text body to simple HTML — newlines to <br>, blank lines to <p>
  function toHtml(text: string): string {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Split on double newlines for paragraphs, single for line breaks
    return escaped
      .split(/\n\n+/)
      .map((para) => `<p>${para.replace(/\n/g, '<br/>')}</p>`)
      .join('\n');
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  // Resend rate limit: typically 2-10 req/sec depending on plan.
  // We throttle to ~4/sec (250ms between sends) to stay safely under the
  // common 5/sec ceiling. If a send fails with a rate-limit error, we
  // back off and retry once.
  const THROTTLE_MS = 250;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function isRateLimitError(msg: string | undefined): boolean {
    if (!msg) return false;
    const lower = msg.toLowerCase();
    return lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('429');
  }

  for (let i = 0; i < recipients.length; i++) {
    const guest = recipients[i];
    // Substitute {name} — case-insensitive — in both subject and body
    const personalizedSubject = subject.replace(/\{name\}/gi, guest.name || 'there');
    const personalizedBody = msgBody.replace(/\{name\}/gi, guest.name || 'there');

    let result = await sendEmail({
      to: guest.email!,
      subject: personalizedSubject,
      html: toHtml(personalizedBody),
      text: personalizedBody,
      recipientType: 'guest',
      recipientId: guest.id,
      purpose: 'broadcast_email',
    });

    // Retry once if we hit a rate-limit error
    if (!result.ok && isRateLimitError(result.error)) {
      await sleep(2000); // Back off for 2 seconds
      result = await sendEmail({
        to: guest.email!,
        subject: personalizedSubject,
        html: toHtml(personalizedBody),
        text: personalizedBody,
        recipientType: 'guest',
        recipientId: guest.id,
        purpose: 'broadcast_email',
      });
    }

    if (result.ok) {
      sent++;
    } else {
      failed++;
      if (errors.length < 10) {
        errors.push(`${guest.email}: ${result.error || 'unknown error'}`);
      }
    }

    // Throttle: small delay between sends to stay under provider rate limits.
    // Skip the delay on the last iteration since there's nothing else to send.
    if (i < recipients.length - 1) {
      await sleep(THROTTLE_MS);
    }
  }

  return NextResponse.json({
    sent,
    failed,
    total: recipients.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
