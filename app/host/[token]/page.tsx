'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface Host {
  id: string;
  name: string;
  capacity: number;
  confirmed_available: boolean | null;
}

export default function HostConfirmPage() {
  const { token } = useParams<{ token: string }>();
  const [host, setHost] = useState<Host | null>(null);
  const [capacity, setCapacity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState<'yes' | 'no' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/hosts/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else {
          setHost(d.host);
          setCapacity(d.host.capacity || 1);
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function respond(available: boolean) {
    setError(null);
    const res = await fetch(`/api/hosts/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ available, capacity: available ? capacity : undefined }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed');
      return;
    }
    setSubmitted(available ? 'yes' : 'no');
  }

  if (loading) return <p className="text-center py-12 text-slate-500">Loading...</p>;

  if (error && !host) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Link not found</h1>
        <p className="text-slate-600 text-sm">
          This confirmation link isn&apos;t valid. Please contact the event coordinator.
        </p>
      </div>
    );
  }

  if (submitted === 'yes') {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-green-200 bg-green-50 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Thank you, {host?.name}!</h1>
        <p className="text-slate-700 text-sm">
          We&apos;ve confirmed you can host up to {capacity} guest{capacity === 1 ? '' : 's'}. We&apos;ll be in touch when we have a match.
        </p>
      </div>
    );
  }

  if (submitted === 'no') {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Understood</h1>
        <p className="text-slate-600 text-sm">
          Thank you for letting us know. We appreciate your past hospitality!
        </p>
      </div>
    );
  }

  const already =
    host?.confirmed_available === true
      ? 'You previously confirmed you were available.'
      : host?.confirmed_available === false
      ? 'You previously said you couldn&apos;t host this year.'
      : null;

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-2">Hi {host?.name}!</h1>
      <p className="text-slate-700 mb-6">
        Can you host guests for the event this year?
      </p>

      {already && <p className="text-sm text-slate-500 mb-4 italic">{already} You can update your response below.</p>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Max guests you can accommodate
          </label>
          <input
            type="number"
            min={1}
            max={20}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => respond(true)}
            className="flex-1 py-3 bg-green-600 text-white rounded-md font-medium hover:bg-green-700"
          >
            Yes, I can host
          </button>
          <button
            onClick={() => respond(false)}
            className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50"
          >
            Not this year
          </button>
        </div>
      </div>
    </div>
  );
}
