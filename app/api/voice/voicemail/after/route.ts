import { NextRequest, NextResponse } from 'next/server';
import { say } from '@/lib/voice-prompts';

/**
 * After the caller finishes recording (or hits maxLength), Twilio fetches
 * this URL to get the final TwiML to play before hanging up.
 *
 * The actual recording metadata is delivered separately to /done via the
 * recordingStatusCallback set in /start.
 */
export async function POST(req: NextRequest) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Thank you, your message has been received. A coordinator will get back to you as soon as possible. Have a wonderful day, goodbye.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
