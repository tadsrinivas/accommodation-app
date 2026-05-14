'use client';

import { useEffect, useState } from 'react';

interface Host {
  id: string;
  name: string;
  capacity: number;
  used_capacity: number;
  remaining_capacity: number;
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
 * Modal for manually creating a new match.
 *
 * Two dropdowns (host, guest), both required. Shows live capacity preview.
 * If selection exceeds capacity, requires explicit acknowledgement.
 * On submit, calls POST /api/coordinator/matches/manual.
 *
 * No notifications are sent — match goes into 'proposed' state and gets
 * picked up next time coordinator clicks "Notify all proposed matches".
 */
export function ManualMatchDialog({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (hostName: string, guestName: string) => void;
}) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [hostId, setHostId] = useState<string>('');
  const [guestId, setGuestId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowOver, setAllowOver] = useState(false);

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

  const selectedHost = hosts.find((h) => h.id === hostId);
  const selectedGuest = guests.find((g) => g.id === guestId);
  const overBy = selectedHost && selectedGuest
    ? selectedGuest.party_size - selectedHost.remaining_capacity
    : 0;
  const isOver = overBy > 0;

  async function handleCreate() {
    if (!hostId || !guestId) {
      setError('Please select both a host and a guest.');
      return;
    }
    if (isOver && !allowOver) {
      setError(`This pairing exceeds host capacity by ${overBy}. Check the box below to proceed anyway.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch('/api/coordinator/matches/manual', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host_id: hostId,
        guest_id: guestId,
        allow_overcapacity: allowOver,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error === 'overcapacity' ? body.message : (body.error || 'Create failed'));
      setSubmitting(false);
      return;
    }
    const d = await res.json();
    onCreated(d.host_name || 'host', d.guest_name || 'guest');
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add manual match</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-6 space-y-4">
          {loading && <p className="text-sm text-slate-500">Loading hosts and guests...</p>}

          {!loading && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Host</label>
                <select
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="">— Select a host —</option>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} (capacity {h.used_capacity}/{h.capacity}){h.host_type === 'hotel' ? ' [Hotel]' : ''}
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
                  <option value="">— Select a guest —</option>
                  {guests.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.party_size} guests, {g.arrival_date} → {g.departure_date})
                    </option>
                  ))}
                </select>
              </div>

              {selectedHost && selectedGuest && (
                <div className={`border rounded p-3 text-xs ${
                  isOver
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-green-50 border-green-200 text-green-900'
                }`}>
                  {isOver ? (
                    <>
                      <p className="mb-2">
                        <strong>Warning:</strong> This pairing exceeds host capacity by <strong>{overBy}</strong>.
                        Host has {selectedHost.remaining_capacity} remaining
                        (out of {selectedHost.capacity}); guest party is {selectedGuest.party_size}.
                      </p>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={allowOver}
                          onChange={(e) => setAllowOver(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>I understand this exceeds capacity — proceed anyway.</span>
                      </label>
                    </>
                  ) : (
                    <p>
                      Capacity check ✓ — Host has {selectedHost.remaining_capacity} remaining
                      (out of {selectedHost.capacity}); guest party is {selectedGuest.party_size}.
                      {selectedHost.remaining_capacity - selectedGuest.party_size > 0 && (
                        <> {selectedHost.remaining_capacity - selectedGuest.party_size} capacity will remain after this match.</>
                      )}
                    </p>
                  )}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs text-slate-700">
                The match will be created in <strong>proposed</strong> state. No notifications are sent
                yet — click <strong>Notify all proposed matches</strong> on the dashboard when you&apos;re
                ready to email both parties.
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
          <button onClick={handleCreate} disabled={submitting || loading || !hostId || !guestId || (isOver && !allowOver)}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creating...' : 'Create match'}
          </button>
        </div>
      </div>
    </div>
  );
}
