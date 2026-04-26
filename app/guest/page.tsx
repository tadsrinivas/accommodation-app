'use client';

import { useState } from 'react';
import { VerifyGate } from '@/components/VerifyGate';

export default function GuestFormPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Mirror the form fields into state so VerifyGate can see email/phone
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState('');
  const [verified, setVerified] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!verified) {
      setError('Please verify your email or phone first.');
      return;
    }

    setLoading(true);
    const res = await fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, phone,
        arrival_date: arrival,
        departure_date: departure,
        party_size: partySize,
        notes,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Submission failed'); return; }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Thank you!</h1>
        <p className="text-slate-600">
          We&apos;ve received your request. You&apos;ll get an email once we&apos;ve matched you with a host.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-1">Request accommodation</h1>
      <p className="text-sm text-slate-600 mb-6">
        Tell us when you&apos;ll be here and how many people are in your group.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name" value={name} onChange={setName} required />
        <Field label="Email" type="email" value={email} onChange={(v) => { setEmail(v); setVerified(false); }} required />
        <Field label="Phone (optional)" type="tel" value={phone} onChange={(v) => { setPhone(v); setVerified(false); }} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrival date" type="date" value={arrival} onChange={setArrival} required />
          <Field label="Departure date" type="date" value={departure} onChange={setDeparture} required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Number of people</label>
          <input
            type="number" min={1} max={20}
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="Anything we should know?"
          />
        </div>

        <VerifyGate
          email={email}
          phone={phone}
          intent="guest_form"
          verified={verified}
          onVerified={() => setVerified(true)}
        />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !verified}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit request'}
        </button>
      </form>
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
