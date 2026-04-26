import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { escapeXml } from '@/lib/voice-intake';
import { normalizePhone } from '@/lib/phone';

/**
 * Try to identify the caller by their caller ID. If found, route to action.
 * If not found, prompt for phone entry via DTMF.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const role = url.searchParams.get('role') as 'guest' | 'host' | null;
  const purpose = url.searchParams.get('purpose') as 'modify' | 'cancel' | null;
  const callSid = url.searchParams.get('call_sid') || '';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!;

  if (!role || !purpose) {
    return errorResponse("Sorry, something went wrong. Goodbye.");
  }

  const formData = await req.formData();
  const fromNumber = String(formData.get('From') || '');

  // Look up by caller ID
  const record = await findRecordByPhone(role, fromNumber);

  if (record) {
    return redirectTo(`${siteUrl}/api/voice/${purpose}/${role}/${record.id}?call_sid=${encodeURIComponent(callSid)}`);
  }

  // Not found by caller ID — ask user to enter their phone manually
  const askAction = `${siteUrl}/api/voice/lookup-by-input?role=${role}&purpose=${purpose}&call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="10" action="${escapeXml(askAction)}" method="POST" timeout="12" finishOnKey="#">
    <Say voice="Polly.Joanna">We couldn't find a record for the number you're calling from. Please enter the 10 digit phone number you used when you originally signed up, then press the pound key.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No response. Goodbye.</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

async function findRecordByPhone(
  role: 'guest' | 'host',
  rawPhone: string
): Promise<{ id: string; name: string } | null> {
  const norm = normalizePhone(rawPhone);
  if (!norm) return null;

  const table = role === 'guest' ? 'guests' : 'hosts';
  const { data } = await supabaseAdmin
    .from(table)
    .select('id, name, phone')
    .is('cancelled_at', null);

  if (!data) return null;

  // Linear scan with normalized comparison.
  // For larger datasets we'd add a normalized_phone column + index.
  const match = data.find((r: any) => normalizePhone(r.phone) === norm);
  return match ? { id: match.id, name: match.name } : null;
}

function redirectTo(url: string): NextResponse {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">${escapeXml(url)}</Redirect>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}

function errorResponse(message: string): NextResponse {
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
