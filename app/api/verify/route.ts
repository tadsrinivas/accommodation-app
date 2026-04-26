import { NextRequest, NextResponse } from 'next/server';
import { issueVerificationCode, verifyCode } from '@/lib/verification';

// POST /api/verify — public; rate limited inside the lib
//   { action: 'send', channel: 'email'|'sms', destination, intent }
//   { action: 'check', channel, destination, intent, code }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  const { action } = body;
  const validIntents = ['guest_form', 'host_signup', 'intake_complete'];
  if (!validIntents.includes(body.intent)) {
    return NextResponse.json({ error: 'Invalid intent' }, { status: 400 });
  }

  if (action === 'send') {
    if (!['email', 'sms'].includes(body.channel)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }
    if (!body.destination || typeof body.destination !== 'string') {
      return NextResponse.json({ error: 'Missing destination' }, { status: 400 });
    }
    const result = await issueVerificationCode({
      channel: body.channel,
      destination: body.destination,
      intent: body.intent,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'check') {
    const result = await verifyCode({
      channel: body.channel,
      destination: body.destination,
      intent: body.intent,
      code: body.code,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
