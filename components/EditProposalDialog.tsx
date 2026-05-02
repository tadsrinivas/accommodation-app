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
 * Modal for editing an in-memory proposal (before save).
 *
 * Unlike EditMatchDialog (which operates on a DB row), this one returns the
 * edited host_id/guest_id to the parent via onSaved. The parent updates its
 * local proposals array.
 *
 * No DB writes happen here. The Save All button on the dashboard persists
 * the (possibly edited) list of proposals.
 */
export function EditProposalDialog({
  currentHostId,
  currentGuestId,
  currentHostName,
  currentGuestName,
  token,
  onClose,
  onSaved,
}: {
  currentHostId: string;
  currentGuestId: string;
  currentHostName: string;
  currentGuestName: string;
  token: string;
  onClose: () => void;
  onSaved: (newHostId: string, newGuestId: string, newHost: Host, newGuest: Guest) => void;
}) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [hostId, setHostId] = useState(currentHostId);
  const [guestId, setGuestId] = useState(currentGuestId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/coordinator/matches/eligible', {
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
  }, [token]);

  function handleSave() {
    if (hostId === currentHostId && guestId === currentGuestId) {
      setError('Nothing changed.');
      return;
    }
    const newHost = hosts.find((h) => h.id === hostId);
    const newGuest = guests.find((g) => g.id === guestId);
    if (!newHost || !newGuest) {
      setError('Selected host or guest not found.');
      return;
    }
    onSaved(hostId, guestId, newHost, newGuest);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Edit proposal</h2>
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

              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700">
                Changes are local until you click <strong>Save all proposals</strong>. Nothing is sent to participants yet.
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded border border-slate-300 bg-white">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            Apply changes
          </button>
        </div>
      </div>
    </div>
  );
}
