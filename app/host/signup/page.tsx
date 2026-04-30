'use client';

import { useState } from 'react';
import { VerifyGate } from '@/components/VerifyGate';

export default function HostSignupPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!verified) { setError('Please verify your email or phone first.'); return; }

    setLoading(true);
    const res = await fetch('/api/hosts/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, capacity, address, notes, website: '' }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Submission failed'); return; }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-green-200 bg-green-50 p-8 mt-12 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Thank you!</h1>
        <p className="text-slate-700">
          We&apos;ve received your offer to host. A coordinator will review and confirm within a day or two.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-1">Offer to host</h1>
      <p className="text-sm text-slate-600 mb-6">
        Thank you! A coordinator will review your details before adding you to the pool.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name" value={name} onChange={setName} required />
        <Field label="Email" type="email" value={email} onChange={(v) => { setEmail(v); setVerified(false); }} required />
        <Field label="Phone" type="tel" value={phone} onChange={(v) => { setPhone(v); setVerified(false); }} required />
        <div>
          <label className="block text-sm font-medium mb-1">Maximum guests you can host</label>
          <input
            type="number" min={1} max={30}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Address</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            required
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>

        <VerifyGate
          email={email}
          phone={phone}
          intent="host_signup"
          verified={verified}
          onVerified={() => setVerified(true)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !verified}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit'}
        </button>
      </form>

      <p className="text-xs text-slate-500 mt-4">
        We&apos;ll only share your contact details with a guest after you both confirm a match.
      </p>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}
