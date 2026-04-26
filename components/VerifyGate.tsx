'use client';

import { useState } from 'react';

/**
 * Inline verification gate. Renders a "Send code → enter code" UI and calls
 * onVerified() when a valid code is submitted. The parent then unlocks the
 * actual submit button.
 *
 * The user picks email or SMS based on what they provided to the form.
 */
export function VerifyGate({
  email,
  phone,
  intent,
  verified,
  onVerified,
}: {
  email: string;
  phone?: string;
  intent: 'guest_form' | 'host_signup' | 'intake_complete';
  verified: boolean;
  onVerified: () => void;
}) {
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [stage, setStage] = useState<'idle' | 'sent'>('idle');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (verified) {
    return (
      <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
        ✓ Verified — you can submit now.
      </div>
    );
  }

  const destination = channel === 'email' ? email : phone || '';
  const canSend = destination && (channel !== 'sms' || phone);

  async function sendCode() {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', channel, destination, intent }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error || 'Failed to send code'); return; }
    setStage('sent');
  }

  async function checkCode() {
    setError(null);
    setBusy(true);
    const res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check', channel, destination, intent, code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setError(data.error || 'Failed to verify'); return; }
    onVerified();
  }

  return (
    <div className="border border-slate-200 bg-slate-50 rounded-md p-3 space-y-3">
      <p className="text-sm font-medium text-slate-700">Verify it&apos;s you</p>
      {!email ? (
        <p className="text-xs text-slate-500">Please fill in your email above first.</p>
      ) : (
        <>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || stage === 'sent'}
              onClick={() => setChannel('email')}
              className={`flex-1 py-1.5 text-xs rounded border ${channel === 'email' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'}`}
            >
              Email me a code
            </button>
            <button
              type="button"
              disabled={busy || stage === 'sent' || !phone}
              onClick={() => setChannel('sms')}
              title={!phone ? 'Provide a phone number above' : ''}
              className={`flex-1 py-1.5 text-xs rounded border ${channel === 'sms' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-slate-300'} disabled:opacity-50`}
            >
              Text me a code
            </button>
          </div>

          {stage === 'idle' && (
            <button
              type="button"
              disabled={busy || !canSend}
              onClick={sendCode}
              className="w-full py-2 text-sm bg-slate-700 text-white rounded-md font-medium hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? 'Sending...' : `Send code to my ${channel === 'email' ? 'email' : 'phone'}`}
            </button>
          )}

          {stage === 'sent' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-600">We sent a 6-digit code to your {channel === 'email' ? 'email' : 'phone'}.</p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm tracking-widest text-center font-mono"
                placeholder="000000"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy || code.length !== 6}
                  onClick={checkCode}
                  className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {busy ? 'Checking...' : 'Verify'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { setStage('idle'); setCode(''); }}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-md"
                >
                  Resend
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
