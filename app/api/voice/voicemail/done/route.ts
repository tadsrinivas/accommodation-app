import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';

/**
 * Twilio's recordingStatusCallback fires when the recording is fully processed.
 * It includes:
 *   RecordingSid       - unique recording ID
 *   RecordingUrl       - URL to the recording (requires Twilio auth to play)
 *   RecordingDuration  - seconds
 *   CallSid            - the originating call
 *   From               - caller's phone number
 *
 * We email the coordinator with these details. The recording URL embedded
 * in the email opens in Twilio's player when clicked from a logged-in browser
 * session, OR can be downloaded with .mp3 appended (still requires auth).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();

  const recordingSid = String(formData.get('RecordingSid') || '');
  const recordingUrl = String(formData.get('RecordingUrl') || '');
  const recordingDuration = String(formData.get('RecordingDuration') || '0');
  const callSid = String(formData.get('CallSid') || '');
  const from = String(formData.get('From') || 'unknown');

  const coordEmail = process.env.COORDINATOR_EMAIL;
  if (!coordEmail) {
    // Nothing to do — log and return success so Twilio doesn't retry
    console.warn('[voicemail] COORDINATOR_EMAIL not set; recording received but no email sent.', {
      recordingSid, recordingUrl, callSid, from,
    });
    return NextResponse.json({ ok: true });
  }

  const eventName = process.env.EVENT_NAME || 'the event';
  const durationSec = parseInt(recordingDuration, 10) || 0;
  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  const durationLabel = minutes > 0
    ? `${minutes}m ${seconds}s`
    : `${seconds}s`;

  // Twilio recording URLs:
  //   {RecordingUrl}        — opens the player UI (requires Twilio account auth)
  //   {RecordingUrl}.mp3    — direct mp3 download (requires Twilio basic auth)
  // We provide both so the coordinator can choose.
  const playerUrl = recordingUrl;
  const mp3Url = `${recordingUrl}.mp3`;

  const subject = `Voicemail from ${from} (${durationLabel}) — ${eventName}`;
  const html = `
    <p>A new voicemail has been received on the ${eventName} accommodation line.</p>
    <ul>
      <li><strong>From:</strong> ${escape(from)}</li>
      <li><strong>Duration:</strong> ${escape(durationLabel)}</li>
      <li><strong>Recording ID:</strong> ${escape(recordingSid)}</li>
      <li><strong>Call ID:</strong> ${escape(callSid)}</li>
    </ul>
    <p>
      <a href="${escape(playerUrl)}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Listen in Twilio</a>
      &nbsp;
      <a href="${escape(mp3Url)}" style="display:inline-block;padding:10px 16px;background:#fff;border:1px solid #cbd5e1;color:#0f172a;text-decoration:none;border-radius:6px">Download MP3</a>
    </p>
    <p style="font-size:12px;color:#64748b">
      Both links require your Twilio account credentials. If a link prompts for sign-in,
      use the same account associated with your Twilio phone number. To return the call,
      dial ${escape(from)} from your usual phone.
    </p>
  `;

  const text =
    `New voicemail on the ${eventName} accommodation line.
From: ${from}
Duration: ${durationLabel}
Listen: ${playerUrl}
Download: ${mp3Url}
(Both require Twilio account login.)`;

  // recipientType/recipientId are not really applicable here — voicemails aren't
  // tied to a specific guest or host. Use generic placeholders so the
  // notifications log row still inserts.
  await sendEmail({
    to: coordEmail,
    subject,
    html,
    text,
    recipientType: 'host',
    recipientId: '00000000-0000-0000-0000-000000000000',
    purpose: 'voicemail_received',
  });

  return NextResponse.json({ ok: true });
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
