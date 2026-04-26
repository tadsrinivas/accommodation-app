'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

export default function GuestEditPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const token = search.get('t') || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [arrival, setArrival] = useState('');
  const [departure, setDeparture] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch(`/api/guests/edit/${id}?t=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ status: r.status, body: d })))
      .then(({ status, body }) => {
        if (status >= 400) { setError(body.error || 'Could not load'); return; }
        const g = body.guest;
        setName(g.name || '');
        setPhone(g.phone || '');
        setArrival(g.arrival_date || '');
        setDeparture(g.departure_date || '');
        setPartySize(g.party_size || 1);
        setNotes(g.notes || '');
      })
      .finally(() => setLoading(false));
  }, [id, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const res = await fetch(`/api/guests/edit/${id}?t=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone,
        arrival_date: arrival,
        departure_date: departure,
        party_size: partySize,
        notes,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Save failed'); return; }
    setSaved(true);
  }

  if (loading) return <p className="text-center py-12 text-slate-500">Loading...</p>;

  if (error) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Link issue</h1>
        <p className="text-slate-600 text-sm">{error}</p>
      </div>
    );
  }

  if (saved) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-green-200 bg-green-50 p-8 mt-12 text-center">
        <h1 className="text-2xl font-semibold mb-2">Saved!</h1>
        <p className="text-slate-700">Your accommodation request has been updated.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-4">Update your request</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" value={name} onChange={setName} required />
        <Field label="Phone" type="tel" value={phone} onChange={setPhone} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Arrival" type="date" value={arrival} onChange={setArrival} required />
          <Field label="Departure" type="date" value={departure} onChange={setDeparture} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Number of people</label>
          <input
            type="number" min={1} max={20} value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={saving}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type={type} value={value} required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm" />
    </div>
  );
}
