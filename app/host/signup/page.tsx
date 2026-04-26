'use client';

import { useState } from 'react';

export default function HostSignupPage() {
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
      capacity: Number(formData.get('capacity')),
      address: formData.get('address'),
      notes: formData.get('notes'),
      website: formData.get('website'), // honeypot
    };

    const res = await fetch('/api/hosts/signup', {
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
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-green-200 bg-green-50 p-8 mt-12 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Thank you!</h1>
        <p className="text-slate-700">
          We&apos;ve received your offer to host. A coordinator will review and confirm within a day or two — you&apos;ll get an email once you&apos;re in our host pool.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-1">Offer to host</h1>
      <p className="text-sm text-slate-600 mb-6">
        Thank you for offering to host! A coordinator will review your details before adding you to the pool.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name" name="name" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone (optional but recommended)" name="phone" type="tel" />
        <Field
          label="Maximum guests you can host"
          name="capacity"
          type="number"
          min={1}
          max={30}
          defaultValue="1"
          required
        />

        <div>
          <label className="block text-sm font-medium mb-1">Address (optional)</label>
          <textarea
            name="address"
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="Street, city — visible to your matched guest only after both confirm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="Any preferences? E.g. 'pet-friendly', 'no smoking', 'available only weekends'"
          />
        </div>

        {/* Honeypot — hidden via CSS, bots fill it */}
        <div className="hidden" aria-hidden="true">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
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
