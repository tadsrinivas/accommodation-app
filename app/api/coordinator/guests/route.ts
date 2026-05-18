import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { CoordGuestCreateSchema } from '@/lib/validation';
import { notifyBoth } from '@/lib/notify';
import { guestIntakeReceivedEmail } from '@/lib/email';
import { smsBody as withSmsPrefix } from '@/lib/sms';

/**
 * POST /api/coordinator/guests
 *
 * Coordinator-only endpoint to create a guest record on someone's behalf.
 * More permissive than the public form:
 *   - Phone OR email required (not both)
 *   - No verification gate (coordinator has implicit authority)
 *
 * If send_confirmation is true (default), sends the intake confirmation email
 * + SMS just like the public form does.
 */
export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const parsed = CoordGuestCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const g = parsed.data;

  // Departure must be after arrival
  if (new Date(g.departure_date) <= new Date(g.arrival_date)) {
    return NextResponse.json({ error: 'Departure must be after arrival' }, { status: 400 });
  }

  // Build the insert. Empty strings become null so the DB stores nulls
  // instead of empty strings — keeps queries like "where email is not null" honest.
  const insert = {
    name: g.name.trim(),
    email: g.email && g.email.length > 0 ? g.email.trim().toLowerCase() : null,
    phone: g.phone && g.phone.length > 0 ? g.phone.trim() : null,
    arrival_date: g.arrival_date,
    departure_date: g.departure_date,
    party_size: g.party_size,
    notes: g.notes && g.notes.length > 0 ? g.notes.trim() : null,
  };

  const { data, error } = await supabaseAdmin
    .from('guests')
    .insert(insert)
    .select('id, name, email, phone, arrival_date, departure_date, party_size')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Optionally send the intake confirmation. Same template as public form.
  // Failure here doesn't fail the request — the guest record is already created.
  if (g.send_confirmation !== false) {
    try {
      const tpl = guestIntakeReceivedEmail({
        guestName: data.name,
        arrivalDate: data.arrival_date,
        departureDate: data.departure_date,
        partySize: data.party_size,
      });

      // notifyBoth gracefully skips channels where the contact method is missing
      await notifyBoth({
        email: data.email || '',
        phone: data.phone,
        emailSubject: tpl.subject,
        emailHtml: tpl.html,
        emailText: tpl.text,
        smsBody: withSmsPrefix(
          `We've received your accommodation request for ${data.arrival_date} to ${data.departure_date}. A coordinator will match you with a host and reach out.`
        ),
        recipientType: 'guest',
        recipientId: data.id,
        purpose: 'intake_received',
      });
    } catch (notifyErr) {
      console.error('[coord guest create] notification error:', notifyErr);
      // Continue — record was created successfully
    }
  }

  return NextResponse.json({
    ok: true,
    guest_id: data.id,
    notification_sent: g.send_confirmation !== false,
  });
}
