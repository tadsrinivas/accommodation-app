import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { GuestFormSchema } from '@/lib/validation';
import { requireCoordinator } from '@/lib/auth';
import { notifyBoth } from '@/lib/notify';
import { guestIntakeReceivedEmail } from '@/lib/email';
import { smsBody as withSmsPrefix } from '@/lib/sms';

// Public: guest form submission
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = GuestFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid submission', issues: parsed.error.flatten() }, { status: 400 });
  }

  const g = parsed.data;
  if (new Date(g.departure_date) <= new Date(g.arrival_date)) {
    return NextResponse.json({ error: 'Departure must be after arrival' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('guests')
    .insert({
      name: g.name,
      email: g.email,
      phone: g.phone || null,
      arrival_date: g.arrival_date,
      departure_date: g.departure_date,
      party_size: g.party_size,
      notes: g.notes || null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send intake confirmation via email + SMS in parallel. If either channel
  // fails, the guest's record is still successfully created — we just log
  // the failure to the notifications table and return ok.
  const tpl = guestIntakeReceivedEmail({
    guestName: g.name,
    arrivalDate: g.arrival_date,
    departureDate: g.departure_date,
    partySize: g.party_size,
  });

  await notifyBoth({
    email: g.email,
    phone: g.phone || null,
    emailSubject: tpl.subject,
    emailHtml: tpl.html,
    emailText: tpl.text,
    smsBody: withSmsPrefix(
      `We've received your accommodation request for ${g.arrival_date} to ${g.departure_date}. A coordinator will match you with a host and reach out.`
    ),
    recipientType: 'guest',
    recipientId: data.id,
    purpose: 'intake_received',
  });

  return NextResponse.json({ ok: true, guest_id: data.id });
}

// Coordinator: list all guests
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('guests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ guests: data });
}
