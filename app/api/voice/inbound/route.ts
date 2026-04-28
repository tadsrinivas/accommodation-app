import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { say, safeSay } from '@/lib/voice-prompts';

/**
 * Twilio inbound webhook.
 * Top-level menu: 1=guest, 2=host, 0=leave a voicemail.
 */
export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }

async function handle(req: NextRequest) {
  const eventName = process.env.EVENT_NAME || 'our event';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;
  const action = `${siteUrl}/api/voice/menu/role`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${escapeXml(action)}" method="POST" timeout="8">
    ${safeSay(`Hare Krishna, and welcome to the accommodation helpline for ${eventName}. We're glad you called.`)}
    <Pause length="1"/>
    ${say('To request accommodation as a guest, please press one. If you are offering to host, please press two. To leave a voice message for the coordinator, please press zero.')}
  </Gather>
  ${say(`We didn't hear anything. Please call back when you're ready. Thank you.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
