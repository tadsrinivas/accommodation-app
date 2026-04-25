'use client';

import { useState } from 'react';

export default function GuestFormPage() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const body = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      arrival_date: formData.get('arrival_date'),
      departure_date: formData.get('departure_date'),
      party_size: Number(formData.get('party_size')),
      notes: formData.get('notes'),
    };

    const res = await fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Submission failed');
      return;
    }
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
        <Field label="Your name" name="name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone (optional)" name="phone" type="tel" />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrival date" name="arrival_date" type="date" required />
          <Field label="Departure date" name="departure_date" type="date" required />
        </div>

        <Field label="Number of people" name="party_size" type="number" min={1} max={20} defaultValue="1" required />

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="Anything we should know?"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Submitting...' : 'Submit request'}
        </button>
      </form>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        {...rest}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}
