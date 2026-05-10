'use client';

import { useEffect, useState } from 'react';

interface RemovedHost {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  capacity: number;
  cancelled_at: string;
  cancellation_source: string | null;
  source: string | null;
}

interface RemovedGuest {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  party_size: number;
  arrival_date: string | null;
  departure_date: string | null;
  cancelled_at: string;
  cancellation_source: string | null;
}

export function RemovedTab({ token }: { token: string }) {
  const [hosts, setHosts] = useState<RemovedHost[]>([]);
  const [guests, setGuests] = useState<RemovedGuest[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const r = await fetch('/api/coordinator/removed', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError(b.error || 'Failed to load removed records');
      setLoading(false);
      return;
    }
    const d = await r.json();
    setHosts(d.hosts || []);
    setGuests(d.guests || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [token]);

  async function restore(type: 'host' | 'guest', id: string, name: string) {
    setStatus(null);
    setError(null);
    const url = type === 'host' ? `/api/coordinator/hosts/${id}/restore` : `/api/coordinator/guests/${id}/restore`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError(b.error || 'Restore failed');
      return;
    }
    setStatus(`Restored ${name}.`);
    load();
  }

  async function permanentDelete(type: 'host' | 'guest', id: string, name: string) {
    const ok = window.confirm(
      `Permanently delete ${name}? This cannot be undone.\n\n` +
      `All matches, notifications, and edit tokens for this ${type} will also be deleted.`
    );
    if (!ok) return;

    // Second confirmation for typed name
    const typed = window.prompt(`Type the ${type}'s name "${name}" to confirm permanent deletion:`);
    if (typed !== name) {
      setError('Name did not match. Permanent deletion cancelled.');
      return;
    }

    setStatus(null);
    setError(null);
    const url = type === 'host'
      ? `/api/coordinator/hosts/${id}/permanent`
      : `/api/coordinator/guests/${id}/permanent`;
    const r = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setError(b.error || 'Permanent delete failed');
      return;
    }
    setStatus(`Permanently deleted ${name}.`);
    load();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading removed records...</p>;

  return (
    <div className="space-y-6">
      {status && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded text-sm">{status}</div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">{error}</div>
      )}

      <p className="text-sm text-slate-600">
        Records you&apos;ve removed. You can restore any record (it goes back to the active list)
        or permanently delete it. Permanent deletion cannot be undone.
      </p>

      <section>
        <h3 className="text-md font-semibold mb-2">Removed hosts ({hosts.length})</h3>
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          {hosts.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No removed hosts.</p>
          ) : (
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Email</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Capacity</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Removed</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">By</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{h.name}</td>
                    <td className="px-3 py-2 text-xs">{h.email || '—'}</td>
                    <td className="px-3 py-2">{h.capacity}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmt(h.cancelled_at)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{h.cancellation_source || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => restore('host', h.id, h.name)}
                          className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => permanentDelete('host', h.id, h.name)}
                          className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          Delete forever
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h3 className="text-md font-semibold mb-2">Removed guests ({guests.length})</h3>
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          {guests.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No removed guests.</p>
          ) : (
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Email</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Dates</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Party</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Removed</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">By</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-slate-600 whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{g.name}</td>
                    <td className="px-3 py-2 text-xs">{g.email || '—'}</td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {g.arrival_date} → {g.departure_date}
                    </td>
                    <td className="px-3 py-2">{g.party_size}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmt(g.cancelled_at)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{g.cancellation_source || '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => restore('guest', g.id, g.name)}
                          className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => permanentDelete('guest', g.id, g.name)}
                          className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          Delete forever
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function fmt(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}
