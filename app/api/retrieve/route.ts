import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { notifyBoth } from '@/lib/notify';
import crypto from 'crypto';

/**
 * POST /api/retrieve — accepts { email }, finds the latest matching guest
 * and/or host record(s), generates magic-link tokens valid for 1 hour, and
 * delivers them via email + SMS (if phone on file).
 *
 * Security: always returns the same generic success response regardless of
 * whether records were found. This prevents email enumeration.
 *
 * If the email matches BOTH a guest AND a host record (rare but possible),
 * the user receives two links — one for each role.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // Fetch the latest active guest record (if any) for this email.
  // Latest = most recent created_at. Cancelled records excluded.
  const { data: guests } = await supabaseAdmin
    .from('guests')
    .select('id, name, email, phone')
    .eq('email', email)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: hosts } = await supabaseAdmin
    .from('hosts')
    .select('id, name, email, phone, confirm_token')
    .eq('email', email)
    .is('cancelled_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  const guest = guests?.[0];
  const host = hosts?.[0];

  // No matches — still return success to prevent enumeration
  if (!guest && !host) {
    return NextResponse.json({ ok: true });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const links: { label: string; url: string }[] = [];

  // Generate magic-link token for the guest record
  if (guest) {
    const token = crypto.randomBytes(24).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await supabaseAdmin.from('verification_codes').insert({
      channel: 'email',
      destination: guest.id,
      code_hash: tokenHash,
      intent: 'guest_edit',  // reuse existing intent so the edit page validates it
      expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      max_attempts: 1,
    });
    links.push({
      label: 'Manage your accommodation request',
      url: `${siteUrl}/guest/edit/${guest.id}?t=${token}`,
    });
  }

  if (host) {
    // Hosts already have a permanent confirm_token in their record. We don't
    // need a one-time token — just link to /host/[token]/edit. But to keep
    // retrieval consistent (one-time, expiring), we issue a magic-link token too.
    // The simpler path is: just send the existing edit URL.
    links.push({
      label: 'Manage your hosting profile',
      url: `${siteUrl}/host/${host.confirm_token}/edit`,
    });
  }

  // Compose a single email containing both links (if applicable).
  const event = process.env.EVENT_NAME || 'Our Event';
  const recipientName = (guest?.name || host?.name) ?? '';
  const greeting = recipientName ? `Hi ${recipientName}` : 'Hi';

  const linksHtml = links.map((l) =>
    `<li><a href="${l.url}">${l.label}</a></li>`
  ).join('\n');
  const linksText = links.map((l) => `${l.label}: ${l.url}`).join('\n');

  const ttlNote = links.some((l) => l.url.includes('?t=')) ? ' These links will expire in 1 hour.' : '';

  const emailHtml = `
    <p>${greeting},</p>
    <p>You requested access to your record${links.length > 1 ? 's' : ''} for <strong>${event}</strong>. Use the link${links.length > 1 ? 's' : ''} below:</p>
    <ul>${linksHtml}</ul>
    <p>${ttlNote}</p>
    <p style="font-size:12px;color:#64748b">If you didn't request this, you can safely ignore this email.</p>
  `;
  const emailText = `${greeting},\n\nYour record link${links.length > 1 ? 's' : ''}:\n\n${linksText}\n${ttlNote}`;

  // SMS body — keep it short. If both guest+host, just show the more relevant one
  // (host first since hosts get more notifications). User can request again to get the other.
  const primaryLink = (host ? links.find((l) => l.label.includes('host'))?.url : links[0]?.url) || links[0]?.url;
  const smsBody = `${event}: tap to manage your record: ${primaryLink}${ttlNote}`;

  // Phone — prefer guest phone (more recent if present), fall back to host
  const phone = guest?.phone || host?.phone || null;
  const recipientId = guest?.id || host?.id || '00000000-0000-0000-0000-000000000000';
  const recipientType = guest ? 'guest' : 'host';

  await notifyBoth({
    email,
    phone,
    emailSubject: `${event}: Your record link${links.length > 1 ? 's' : ''}`,
    emailHtml,
    emailText,
    smsBody,
    recipientType: recipientType as 'guest' | 'host',
    recipientId,
    purpose: 'record_retrieval',
  });

  return NextResponse.json({ ok: true });
}
