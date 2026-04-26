import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HostSignupSchema, isDisposableEmail } from '@/lib/validation';
import {
  sendEmail,
  hostSignupReceivedEmail,
  hostSignupCoordinatorAlertEmail,
} from '@/lib/email';

// POST /api/hosts/signup — public signup form
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = HostSignupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your details', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;

  // Honeypot — silently accept but don't actually create the row.
  // Returning success prevents bots from probing for what triggers rejection.
  if (data.website && data.website.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const email = data.email.toLowerCase();

  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { error: 'Please use a permanent email address.' },
      { status: 400 }
    );
  }

  // Check for duplicate signup with same email
  const { data: existing } = await supabaseAdmin
    .from('hosts')
    .select('id, approval_status')
    .eq('email', email)
    .maybeSingle();

  if (existing) {
    if (existing.approval_status === 'pending') {
      return NextResponse.json(
        { error: 'You already have a signup pending review. Please wait for our reply.' },
        { status: 409 }
      );
    }
    if (existing.approval_status === 'approved') {
      return NextResponse.json(
        { error: 'This email is already registered as a host. Check your inbox for your management link.' },
        { status: 409 }
      );
    }
    // 'rejected' — let them try again, but don't tell them why they were previously rejected
    return NextResponse.json(
      { error: 'We were unable to process your signup. Please contact the coordinator if you believe this is in error.' },
      { status: 400 }
    );
  }

  const { data: created, error } = await supabaseAdmin
    .from('hosts')
    .insert({
      name: data.name.trim(),
      email,
      phone: data.phone || null,
      capacity: data.capacity,
      address: data.address?.trim() || null,
      notes: data.notes?.trim() || null,
      approval_status: 'pending',
      source: 'signup',
      submitted_at: new Date().toISOString(),
    })
    .select('id, name, email, phone, capacity, address, notes')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Email the new host (confirmation)
  const ackEmail = hostSignupReceivedEmail({ name: created.name });
  await sendEmail({
    to: created.email,
    subject: ackEmail.subject,
    html: ackEmail.html,
    text: ackEmail.text,
    recipientType: 'host',
    recipientId: created.id,
    purpose: 'signup_received',
  });

  // Email the coordinator (review alert)
  const coordEmail = process.env.COORDINATOR_EMAIL;
  if (coordEmail) {
    const alertEmail = hostSignupCoordinatorAlertEmail({
      hostName: created.name,
      hostEmail: created.email,
      hostPhone: created.phone,
      capacity: created.capacity,
      address: created.address,
      notes: created.notes,
    });
    await sendEmail({
      to: coordEmail,
      subject: alertEmail.subject,
      html: alertEmail.html,
      text: alertEmail.text,
      recipientType: 'host',
      recipientId: created.id,
      purpose: 'signup_coordinator_alert',
    });
  }

  return NextResponse.json({ ok: true });
}
