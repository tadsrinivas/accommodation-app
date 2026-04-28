import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { say } from '@/lib/voice-prompts';
import { normalizePhone } from '@/lib/phone';

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const role = url.searchParams.get('role') as 'guest' | 'host' | null;
  const purpose = url.searchParams.get('purpose') as 'modify' | 'cancel' | null;
  const callSid = url.searchParams.get('call_sid') || '';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!role || !purpose) return errorResponse(`I'm sorry, something went wrong. Please call again. Thank you.`);

  const formData = await req.formData();
  const fromNumber = String(formData.get('From') || '');
  const record = await findRecordByPhone(role, fromNumber);

  if (record) {
    return redirectTo(`${siteUrl}/api/voice/${purpose}/${role}/${record.id}?call_sid=${encodeURIComponent(callSid)}`);
  }

  const askAction = `${siteUrl}/api/voice/lookup-by-input?role=${role}&purpose=${purpose}&call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I wasn't able to find your record using this phone number. No problem.`)}
  <Gather numDigits="10" action="${escapeXml(askAction)}" method="POST" timeout="12" finishOnKey="#">
    ${say(`Please enter the ten digit phone number you originally provided, then press the pound key.`)}
  </Gather>
  ${say(`I didn't receive any input. Please call again or visit our website. Thank you.`)}
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

async function findRecordByPhone(role: 'guest' | 'host', rawPhone: string) {
  const norm = normalizePhone(rawPhone);
  if (!norm) return null;
  const table = role === 'guest' ? 'guests' : 'hosts';
  const { data } = await supabaseAdmin.from(table).select('id, name, phone').is('cancelled_at', null);
  return (data || []).find((r: any) => normalizePhone(r.phone) === norm) || null;
}

function redirectTo(url: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Redirect method="POST">${escapeXml(url)}</Redirect></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string) {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${say(message)}<Hangup/></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
