'use client';

import { useState } from 'react';

export default function RetrievePage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/retrieve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || 'Something went wrong. Please try again.');
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-green-200 bg-green-50 p-8 mt-12 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Check your inbox</h1>
        <p className="text-slate-700">
          If we found a record matching that email, we&apos;ve sent you a link to manage it.
          The link will expire in 1 hour.
        </p>
        <p className="text-slate-600 text-sm">
          Check your spam folder if you don&apos;t see the email within a few minutes.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-1">Find my record</h1>
      <p className="text-sm text-slate-600 mb-6">
        Enter the email you used when you signed up. We&apos;ll send you a link to manage your accommodation request or hosting profile.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            placeholder="you@example.com"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || !email}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send me a link'}
        </button>
      </form>

      <p className="text-xs text-slate-500 mt-4">
        We&apos;ll also text you a link if your phone number is on file.
      </p>
    </div>
  );
}
