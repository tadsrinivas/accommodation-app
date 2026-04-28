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

  const formData = await req.formData();
  const digits = String(formData.get('Digits') || '');

  if (!role || !purpose || digits.length < 10) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I'm sorry, I wasn't able to find a matching record. Please visit our website to manage your request, or contact the event coordinator. Thank you.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const norm = normalizePhone(digits);
  const table = role === 'guest' ? 'guests' : 'hosts';
  const { data } = await supabaseAdmin.from(table).select('id, name, phone').is('cancelled_at', null);
  const match = (data || []).find((r: any) => normalizePhone(r.phone) === norm);

  if (!match) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say(`I'm sorry, we still couldn't find a record for that number. Please visit our website or contact the event coordinator for help. Thank you.`)}
  <Hangup/>
</Response>`;
    return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
  }

  const redirect = `${siteUrl}/api/voice/${purpose}/${role}/${match.id}?call_sid=${encodeURIComponent(callSid)}`;
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Redirect method="POST">${escapeXml(redirect)}</Redirect></Response>`;
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml' } });
}
