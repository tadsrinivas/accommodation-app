'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function MatchConfirmPage() {
  const params = useParams<{ side: string; token: string }>();
  const side = params.side;
  const token = params.token;

  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/confirm/${side}/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setMatch(d.match);
      })
      .finally(() => setLoading(false));
  }, [side, token]);

  async function respond(response: 'accepted' | 'declined') {
    const res = await fetch(`/api/confirm/${side}/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed');
      return;
    }
    if (response === 'declined') setResult('declined');
    else if (data.contacts_exchanged) setResult('confirmed_with_contacts');
    else setResult('awaiting');
  }

  if (loading) return <p className="text-center py-12 text-slate-500">Loading...</p>;

  if (error || !match) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Link not found</h1>
        <p className="text-slate-600 text-sm">This link isn&apos;t valid anymore.</p>
      </div>
    );
  }

  if (result === 'declined') {
    return (
      <Message title="Response recorded" body="Thanks for letting us know. We'll try to find another match." />
    );
  }
  if (result === 'awaiting') {
    return (
      <Message
        title="Thanks — we've recorded your response"
        body="We're now waiting for the other party to confirm. Once they do, we'll email both of you with contact details."
      />
    );
  }
  if (result === 'confirmed_with_contacts') {
    return (
      <Message
        title="All set!"
        body="Both sides have confirmed. Check your email in a minute — we've sent you the contact details."
      />
    );
  }

  const host = Array.isArray(match.hosts) ? match.hosts[0] : match.hosts;
  const guest = Array.isArray(match.guests) ? match.guests[0] : match.guests;
  const isHost = side === 'host';

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-4">Match proposal</h1>

      {isHost ? (
        <div className="space-y-2 mb-6">
          <p className="text-slate-700">
            <strong>Guest:</strong> {guest.name}
          </p>
          <p className="text-slate-700">
            <strong>Party size:</strong> {guest.party_size}
          </p>
          <p className="text-slate-700">
            <strong>Arrival:</strong> {guest.arrival_date}
          </p>
          <p className="text-slate-700">
            <strong>Departure:</strong> {guest.departure_date}
          </p>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          <p className="text-slate-700">
            We&apos;ve found a host for your stay ({guest.arrival_date} to {guest.departure_date}).
          </p>
          <p className="text-slate-500 text-sm">
            The host&apos;s contact details will be shared with you once you both confirm.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => respond('accepted')}
          className="flex-1 py-3 bg-green-600 text-white rounded-md font-medium hover:bg-green-700"
        >
          Accept
        </button>
        <button
          onClick={() => respond('declined')}
          className="flex-1 py-3 bg-white border border-slate-300 text-slate-700 rounded-md font-medium hover:bg-slate-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
      <h1 className="text-xl font-semibold mb-2">{title}</h1>
      <p className="text-slate-600 text-sm">{body}</p>
    </div>
  );
}
