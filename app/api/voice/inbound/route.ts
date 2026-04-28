import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';

/**
 * Twilio inbound webhook.
 * Top-level menu: 1=guest, 2=host. Both branches then offer 1=new, 2=modify, 3=cancel.
 */

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const eventName = process.env.EVENT_NAME || 'our event';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const action = `${siteUrl}/api/voice/menu/role`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(action)}" method="POST" timeout="10">
    <Say voice="Polly.Raveena">Hello and welcome to the accommodation line for ${escapeXml(eventName)}. If you are a guest looking for accommodation, press 1. If you are a host offering accommodation, press 2.</Say>
  </Gather>
  <Say voice="Polly.Kajal-Neural">We didn't hear a response. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
