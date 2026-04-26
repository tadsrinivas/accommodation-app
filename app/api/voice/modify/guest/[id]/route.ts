import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendSms } from '@/lib/sms';
import { escapeXml } from '@/lib/voice-intake';
import crypto from 'crypto';

/**
 * Modify guest record: send an SMS with a one-time link to a guest edit page.
 *
 * The link includes a short-lived token stored in a temp table or generated
 * deterministically. For simplicity, we reuse the verification_codes table
 * to store an edit token tied to the guest record.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';

  const { data: guest } = await supabaseAdmin
    .from('guests')
    .select('id, name, phone, email')
    .eq('id', params.id)
    .is('cancelled_at', null)
    .maybeSingle();

  if (!guest) {
    return errorResponse("We couldn't find your record. Goodbye.");
  }
  if (!guest.phone) {
    return errorResponse("We don't have a phone number on file to send you a link. Please visit our website. Goodbye.");
  }

  // Generate a one-time edit token (24 hour TTL)
  const token = crypto.randomBytes(24).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await supabaseAdmin.from('verification_codes').insert({
    channel: 'sms',
    destination: guest.id,             // we reuse this table — destination = record id
    code_hash: tokenHash,
    intent: 'guest_edit',              // not in the original allow-list, see migration note below
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    max_attempts: 1,
  });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const link = `${siteUrl}/guest/edit/${guest.id}?t=${token}`;

  await sendSms({
    to: guest.phone,
    body: `Tap to update your accommodation request: ${link} (link expires in 24 hours)`,
    recipientType: 'guest',
    recipientId: guest.id,
    purpose: 'modify_link',
  });

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">We just texted you a link to update your request. The link will expire in 24 hours. Thank you, goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string): NextResponse {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
