'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function HostEditPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [capacity, setCapacity] = useState(1);
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch(`/api/hosts/${token}`)
      .then((r) => r.json().then((d) => ({ status: r.status, body: d })))
      .then(({ status, body }) => {
        if (status >= 400) {
          setError(body.error || 'Could not load profile');
          return;
        }
        const h = body.host;
        setName(h.name || '');
        setEmail(h.email || '');
        setPhone(h.phone || '');
        setCapacity(h.capacity || 1);
        setAddress(h.address || '');
        setNotes(h.notes || '');
      })
      .finally(() => setLoading(false));
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const res = await fetch(`/api/hosts/${token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, capacity, address, notes }),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Save failed');
      return;
    }
    setSavedAt(new Date());
  }

  if (loading) return <p className="text-center py-12 text-slate-500">Loading...</p>;

  if (error && !email) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center">
        <h1 className="text-xl font-semibold mb-2">Link not valid</h1>
        <p className="text-slate-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-6">
      <h1 className="text-2xl font-semibold mb-1">Manage your hosting profile</h1>
      <p className="text-sm text-slate-600 mb-6">
        Update your details anytime. Your email is locked — contact the coordinator to change it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" value={name} onChange={setName} required />
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-md text-sm text-slate-500"
          />
        </div>
        <Field label="Phone" type="tel" value={phone} onChange={setPhone} required />
        <div>
          <label className="block text-sm font-medium mb-1">Maximum guests you can host</label>
          <input
            type="number"
            min={1}
            max={30}
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
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {savedAt && (
          <p className="text-sm text-green-700">
            ✓ Saved at {savedAt.toLocaleTimeString()}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}
