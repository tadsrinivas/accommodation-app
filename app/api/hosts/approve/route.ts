import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireCoordinator } from '@/lib/auth';
import { sendEmail, hostApprovedEmail, hostRejectedEmail } from '@/lib/email';

// GET /api/hosts/approve — list pending host signups
export async function GET(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('hosts')
    .select('id, name, email, phone, capacity, address, notes, submitted_at')
    .eq('approval_status', 'pending')
    .order('submitted_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hosts: data });
}

// POST /api/hosts/approve — approve or reject a signup
//   { host_id, action: 'approve' | 'reject', note?: string }
export async function POST(req: NextRequest) {
  const auth = requireCoordinator(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 });

  const { host_id, action, note } = await req.json();
  if (!host_id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  // Read current host row
  const { data: host, error: hostErr } = await supabaseAdmin
    .from('hosts')
    .select('*')
    .eq('id', host_id)
    .single();

  if (hostErr || !host) {
    return NextResponse.json({ error: 'Host not found' }, { status: 404 });
  }
  if (host.approval_status !== 'pending') {
    return NextResponse.json(
      { error: `Host is already ${host.approval_status}` },
      { status: 409 }
    );
  }

  if (action === 'approve') {
    await supabaseAdmin
      .from('hosts')
      .update({
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        // Approved signup hosts skip the reconfirmation flow — they JUST signed up
        confirmed_available: true,
        confirmed_at: new Date().toISOString(),
        outreach_stage: 'responded',
      })
      .eq('id', host_id);

    const tpl = hostApprovedEmail({ name: host.name, confirm_token: host.confirm_token });
    await sendEmail({
      to: host.email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
      recipientType: 'host',
      recipientId: host_id,
      purpose: 'signup_approved',
    });

    return NextResponse.json({ ok: true, status: 'approved' });
  }

  // Reject
  await supabaseAdmin
    .from('hosts')
    .update({
      approval_status: 'rejected',
      rejection_note: note || null,
    })
    .eq('id', host_id);

  const tpl = hostRejectedEmail({ name: host.name }, note);
  await sendEmail({
    to: host.email,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    recipientType: 'host',
    recipientId: host_id,
    purpose: 'signup_rejected',
  });

  return NextResponse.json({ ok: true, status: 'rejected' });
}
