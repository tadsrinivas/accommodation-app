import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, contactsExchangedEmail } from '@/lib/email';

// Fetch match by token (side inferred from which token matches)
export async function GET(req: NextRequest, { params }: { params: { side: string; token: string } }) {
  const side = params.side;
  if (side !== 'host' && side !== 'guest') {
    return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
  }
  const column = side === 'host' ? 'host_confirm_token' : 'guest_confirm_token';

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(`
      id, status, host_response, guest_response,
      hosts(name), guests(name, arrival_date, departure_date, party_size)
    `)
    .eq(column, params.token)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
  return NextResponse.json({ match: data });
}

// Record accept/decline, trigger contact exchange when both sides accept
export async function POST(req: NextRequest, { params }: { params: { side: string; token: string } }) {
  const side = params.side;
  const { response } = await req.json();
  if (!['accepted', 'declined'].includes(response)) {
    return NextResponse.json({ error: 'Invalid response' }, { status: 400 });
  }
  if (side !== 'host' && side !== 'guest') {
    return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
  }

  const tokenCol = side === 'host' ? 'host_confirm_token' : 'guest_confirm_token';
  const responseCol = side === 'host' ? 'host_response' : 'guest_response';
  const respondedCol = side === 'host' ? 'host_responded_at' : 'guest_responded_at';

  const { data: updated, error } = await supabaseAdmin
    .from('matches')
    .update({
      [responseCol]: response,
      [respondedCol]: new Date().toISOString(),
    })
    .eq(tokenCol, params.token)
    .select(`
      id, host_response, guest_response, contacts_exchanged,
      hosts(id, name, email, phone, address),
      guests(id, name, email, phone)
    `)
    .single();

  if (error || !updated) return NextResponse.json({ error: error?.message || 'Invalid link' }, { status: 400 });

  // If declined by either side → mark match as declined, free up both parties
  if (response === 'declined') {
    await supabaseAdmin.from('matches').update({ status: 'declined' }).eq('id', updated.id);
    return NextResponse.json({ ok: true, status: 'declined' });
  }

  // If both sides have accepted and contacts not yet exchanged → do it now
  if (
    updated.host_response === 'accepted' &&
    updated.guest_response === 'accepted' &&
    !updated.contacts_exchanged
  ) {
    const host = Array.isArray(updated.hosts) ? updated.hosts[0] : updated.hosts;
    const guest = Array.isArray(updated.guests) ? updated.guests[0] : updated.guests;

    // Email the host with guest contacts
    const hostEmail = contactsExchangedEmail({
      recipientName: host.name,
      otherPartyName: guest.name,
      otherPartyEmail: guest.email,
      otherPartyPhone: guest.phone,
      otherPartyAddress: null,
      role: 'host',
    });
    await sendEmail({
      to: host.email,
      ...hostEmail,
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'contacts_exchanged',
    });

    // Email the guest with host contacts
    const guestEmail = contactsExchangedEmail({
      recipientName: guest.name,
      otherPartyName: host.name,
      otherPartyEmail: host.email,
      otherPartyPhone: host.phone,
      otherPartyAddress: host.address,
      role: 'guest',
    });
    await sendEmail({
      to: guest.email,
      ...guestEmail,
      recipientType: 'guest',
      recipientId: guest.id,
      purpose: 'contacts_exchanged',
    });

    await supabaseAdmin
      .from('matches')
      .update({
        contacts_exchanged: true,
        contacts_exchanged_at: new Date().toISOString(),
        status: 'confirmed',
      })
      .eq('id', updated.id);

    return NextResponse.json({ ok: true, status: 'confirmed', contacts_exchanged: true });
  }

  return NextResponse.json({
    ok: true,
    status: 'awaiting other party',
    host_response: updated.host_response,
    guest_response: updated.guest_response,
  });
}
