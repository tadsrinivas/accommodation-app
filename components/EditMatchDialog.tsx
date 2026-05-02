'use client';

import { useEffect, useState } from 'react';

interface Host {
  id: string;
  name: string;
  capacity: number;
  host_type: 'residence' | 'hotel';
  address: string | null;
}

interface Guest {
  id: string;
  name: string;
  party_size: number;
  arrival_date: string;
  departure_date: string;
}

/**
 * Modal for editing a 'proposed' match — coordinator can swap host or guest.
 * Resets host_response/guest_response since the pairing has changed.
 */
export function EditMatchDialog({
  matchId,
  currentHostId,
  currentGuestId,
  currentHostName,
  currentGuestName,
  token,
  onClose,
  onSaved,
}: {
  matchId: string;
  currentHostId: string;
  currentGuestId: string;
  currentHostName: string;
  currentGuestName: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [hostId, setHostId] = useState(currentHostId);
  const [guestId, setGuestId] = useState(currentGuestId);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/coordinator/matches/eligible?match_id=${matchId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setHosts(d.hosts || []);
        setGuests(d.guests || []);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [matchId, token]);

  async function handleSave() {
    if (hostId === currentHostId && guestId === currentGuestId) {
      setError('Nothing changed.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/coordinator/matches/${matchId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ host_id: hostId, guest_id: guestId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Save failed');
      setSubmitting(false);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Edit match</h2>
            <p className="text-xs text-slate-500 mt-1">
              Currently: <strong>{currentHostName}</strong> ↔ <strong>{currentGuestName}</strong>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-6 space-y-4">
          {loading && <p className="text-sm text-slate-500">Loading options...</p>}

          {!loading && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Host</label>
                <select
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  {/* Always include the current host so it appears even if no longer "eligible" */}
                  {!hosts.find((h) => h.id === currentHostId) && (
                    <option value={currentHostId}>{currentHostName} (current)</option>
                  )}
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} (capacity {h.capacity}){h.host_type === 'hotel' ? ' [Hotel]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Guest</label>
                <select
                  value={guestId}
                  onChange={(e) => setGuestId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  {!guests.find((g) => g.id === currentGuestId) && (
                    <option value={currentGuestId}>{currentGuestName} (current)</option>
                  )}
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.party_size} guests, {g.arrival_date} → {g.departure_date})
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
                Editing this match will reset both parties&apos; accept/decline status.
                You&apos;ll need to re-run notifications afterwards.
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 text-sm rounded border border-slate-300 bg-white">
            Cancel
          </button>
          <button onClick={handleSave} disabled={submitting || loading}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
