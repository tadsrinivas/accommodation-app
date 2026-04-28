import { NextRequest, NextResponse } from 'next/server';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';

/**
 * Voicemail recording start.
 *
 * Twilio's <Record> verb:
 *   - Plays a beep, captures audio
 *   - Caller can press # to finish, or stay silent for finishOnSilence period
 *   - On completion, Twilio POSTs to recordingStatusCallback with the recording URL
 *   - Twilio also fetches `action` URL when recording completes — used to play
 *     the "thank you" message before hanging up
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const callSid = url.searchParams.get('call_sid') || '';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  // After recording finishes, Twilio fetches this to get the next TwiML to play.
  const afterRecordUrl = `${siteUrl}/api/voice/voicemail/after?call_sid=${encodeURIComponent(callSid)}`;

  // Twilio asynchronously posts the recording details (URL, duration, etc.) here.
  const statusCallbackUrl = `${siteUrl}/api/voice/voicemail/done`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`Please leave your name and message after the tone. When you're finished, you can press the pound key, or simply hang up. You'll have up to three minutes.`)}
  <Record
    action="${escapeXml(afterRecordUrl)}"
    method="POST"
    maxLength="180"
    finishOnKey="#"
    playBeep="true"
    trim="trim-silence"
    recordingStatusCallback="${escapeXml(statusCallbackUrl)}"
    recordingStatusCallbackMethod="POST"
    recordingStatusCallbackEvent="completed"
  />
  ${say(`We didn't receive a recording. Please call back if you still need to leave a message. Thank you.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
