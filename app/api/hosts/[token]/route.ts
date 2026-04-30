import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { HostEditSchema } from '@/lib/validation';
import { notifyBoth } from '@/lib/notify';
import { hostReconfirmedEmail } from '@/lib/email';
import { smsBody as withSmsPrefix } from '@/lib/sms';

// Public endpoint: host clicks unique link → we fetch their record & let them confirm
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const { data, error } = await supabaseAdmin
    .from('hosts')
    .select('id, name, email, phone, capacity, address, notes, confirmed_available, approval_status')
    .eq('confirm_token', params.token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }
  return NextResponse.json({ host: data });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const { available, capacity } = await req.json();

  // Read current state BEFORE updating, so we know whether this is a first-time
  // transition from null/false → true. We only send the welcome email on the
  // first "yes" — re-confirms shouldn't re-spam the host.
  const { data: existing } = await supabaseAdmin
    .from('hosts')
    .select('id, name, email, phone, confirm_token, confirmed_available')
    .eq('confirm_token', params.token)
    .single();

  if (!existing) {
    return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  }

  const update: Record<string, unknown> = {
    confirmed_available: Boolean(available),
    confirmed_at: new Date().toISOString(),
  };
  if (typeof capacity === 'number' && capacity > 0) update.capacity = capacity;

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .update(update)
    .eq('confirm_token', params.token)
    .select('id, name, confirmed_available')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || 'Invalid link' }, { status: 400 });
  }

  // Send the welcome email + SMS only on first transition to true.
  // Suppresses spam if the host re-clicks the link.
  const isFirstYes =
    Boolean(available) === true && existing.confirmed_available !== true;

  if (isFirstYes) {
    const tpl = hostReconfirmedEmail({
      name: existing.name,
      confirm_token: existing.confirm_token,
    });
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
    const editLink = `${siteUrl}/host/${existing.confirm_token}/edit`;

    await notifyBoth({
      email: existing.email,
      phone: existing.phone,
      emailSubject: tpl.subject,
      emailHtml: tpl.html,
      emailText: tpl.text,
      smsBody: withSmsPrefix(`Thanks for confirming you can host! Manage your profile: ${editLink}`),
      recipientType: 'host',
      recipientId: existing.id,
      purpose: 'reconfirmed_welcome',
    });
  }

  return NextResponse.json({ host: data });
}

// PUT — full profile edit (host updates their own details via their unique token)
export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json();
  const parsed = HostEditSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your details', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const { data: updated, error } = await supabaseAdmin
    .from('hosts')
    .update({
      name: data.name.trim(),
      phone: data.phone || null,
      capacity: data.capacity,
      address: data.address?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .eq('confirm_token', params.token)
    .select('id, name, email, phone, capacity, address, notes')
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message || 'Invalid link' }, { status: 400 });
  }
  return NextResponse.json({ host: updated });
}
