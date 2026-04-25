'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function IntakeCompletePage() {
  const { token } = useParams<{ token: string }>();
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Editable fields — pre-filled from voice session
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [party, setParty] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch(`/api/voice/intake/complete/${token}`)
      .then((r) => r.json().then((d) => ({ status: r.status, body: d })))
      .then(({ status, body }) => {
        if (status >= 400) {
          setError(body.error || 'Link not valid');
          if (body.already_completed) setSubmitted(true);
          return;
        }
        const s = body.session;
        setSession(s);
        setName(s.name || '');
        setPhone(s.caller_phone || '');
        setArrival(s.arrival_date || '');
        setDeparture(s.departure_date || '');
        setParty(s.party_size || 1);
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch(`/api/voice/intake/complete/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, email, phone,
        arrival_date: arrival,
        departure_date: departure,
        party_size: party,
        notes,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || 'Submission failed');
      return;
    }
    setSubmitted(true);
  }

  if (loading) return <p className="text-center py-12 text-slate-500">Loading...</p>;

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-green-200 bg-green-50 p-8 mt-12 text-center">
        <h1 className="text-2xl font-semibold mb-2">Thank you!</h1>
        <p className="text-slate-700">
          We&apos;ve received your accommodation request. You&apos;ll get an email once we&apos;ve matched you with a host.
        </p>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Link not valid</h1>
        <p className="text-slate-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-1">Complete your request</h1>
      <p className="text-sm text-slate-600 mb-4">
        We captured most of your details on the call. Please add your email and confirm everything looks right.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name" value={name} onChange={setName} required />
        <Field label="Email" type="email" value={email} onChange={setEmail} required placeholder="you@example.com" autoFocus />
        <Field label="Phone" type="tel" value={phone} onChange={setPhone} />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrival" type="date" value={arrival} onChange={setArrival} required />
          <Field label="Departure" type="date" value={departure} onChange={setDeparture} required />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Number of people</label>
          <input
            type="number"
            min={1}
            max={20}
            value={party}
            onChange={(e) => setParty(Number(e.target.value))}
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
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit request'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required, placeholder, autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}
