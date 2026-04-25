import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendEmail, matchProposedHostEmail, matchProposedGuestEmail } from '@/lib/email';
import { sendSms, matchProposedSms } from '@/lib/sms';
import { requireCoordinator } from '@/lib/auth';

// POST /api/notify — sends match_proposed notifications for all matches in 'proposed' status
export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data: matches, error } = await supabaseAdmin
    .from('matches')
    .select(`
      id, host_confirm_token, guest_confirm_token, status,
      hosts(id, name, email, phone),
      guests(id, name, email, phone, arrival_date, departure_date, party_size)
    `)
    .eq('status', 'proposed');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  let notified = 0;

  for (const m of matches || []) {
    const host = Array.isArray(m.hosts) ? m.hosts[0] : m.hosts;
    const guest = Array.isArray(m.guests) ? m.guests[0] : m.guests;
    if (!host || !guest) continue;

    // Host email
    const he = matchProposedHostEmail({
      hostName: host.name,
      guestName: guest.name,
      arrival: guest.arrival_date,
      departure: guest.departure_date,
      partySize: guest.party_size,
      token: m.host_confirm_token,
    });
    await sendEmail({
      to: host.email,
      subject: he.subject,
      html: he.html,
      text: he.text,
      recipientType: 'host',
      recipientId: host.id,
      purpose: 'match_proposed',
    });

    // Host SMS
    if (host.phone) {
      await sendSms({
        to: host.phone,
        body: matchProposedSms('host', `${siteUrl}/match/host/${m.host_confirm_token}`),
        recipientType: 'host',
        recipientId: host.id,
        purpose: 'match_proposed',
      });
    }

    // Guest email
    const ge = matchProposedGuestEmail({
      guestName: guest.name,
      arrival: guest.arrival_date,
      departure: guest.departure_date,
      token: m.guest_confirm_token,
    });
    await sendEmail({
      to: guest.email,
      subject: ge.subject,
      html: ge.html,
      text: ge.text,
      recipientType: 'guest',
      recipientId: guest.id,
      purpose: 'match_proposed',
    });

    // Guest SMS
    if (guest.phone) {
      await sendSms({
        to: guest.phone,
        body: matchProposedSms('guest', `${siteUrl}/match/guest/${m.guest_confirm_token}`),
        recipientType: 'guest',
        recipientId: guest.id,
        purpose: 'match_proposed',
      });
    }

    await supabaseAdmin
      .from('matches')
      .update({ status: 'notified', notifications_sent_at: new Date().toISOString() })
      .eq('id', m.id);

    notified++;
  }

  return NextResponse.json({ notified });
}
