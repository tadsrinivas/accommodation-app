'use client';

import { useEffect, useState } from 'react';

interface MatchPreview {
  id: string;
  status: string;
  guests?: { name: string; email: string; party_size: number; arrival_date: string; departure_date: string };
  hosts?: { name: string; email: string; capacity: number };
}

/**
 * Confirmation modal for soft-deleting a host or guest.
 *
 * On open, fetches active matches involving this record. Coordinator decides
 * for each match: cancel it, or leave it as-is. Then confirms removal.
 */
export function RemoveConfirmDialog({
  recordType,
  recordId,
  recordName,
  token,
  onClose,
  onConfirmed,
}: {
  recordType: 'host' | 'guest';
  recordId: string;
  recordName: string;
  token: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [matches, setMatches] = useState<MatchPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-match decision: id → 'cancel' | 'keep'. Default to 'cancel'.
  const [decisions, setDecisions] = useState<Record<string, 'cancel' | 'keep'>>({});

  useEffect(() => {
    const url = recordType === 'host'
      ? `/api/coordinator/hosts/${recordId}/matches`
      : `/api/coordinator/guests/${recordId}/matches`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        const list: MatchPreview[] = d.matches || [];
        setMatches(list);
        // Default every match to 'cancel'
        const initial: Record<string, 'cancel' | 'keep'> = {};
        list.forEach((m) => { initial[m.id] = 'cancel'; });
        setDecisions(initial);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [recordType, recordId, token]);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    const url = recordType === 'host'
      ? `/api/coordinator/hosts/${recordId}`
      : `/api/coordinator/guests/${recordId}`;

    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_actions: decisions }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to remove');
      setSubmitting(false);
      return;
    }

    onConfirmed();
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold">Remove {recordType}: {recordName}</h2>
          <p className="text-sm text-slate-600 mt-1">
            This will exclude the {recordType} from the active list and matching pool.
            You can restore them later from the <strong>Removed</strong> tab.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {loading && <p className="text-sm text-slate-500">Checking for active matches...</p>}

          {!loading && matches.length === 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded p-3 text-sm text-slate-600">
              No active matches involving this {recordType}. Safe to remove.
            </div>
          )}

          {matches.length > 0 && (
            <div>
              <p className="text-sm text-slate-700 mb-2">
                <strong>{matches.length}</strong> active match{matches.length === 1 ? '' : 'es'} found.
                Decide what to do with each:
              </p>
              <div className="space-y-2">
                {matches.map((m) => {
                  const partner = recordType === 'host' ? m.guests : m.hosts;
                  return (
                    <div key={m.id} className="border border-slate-200 rounded p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            {recordType === 'host' ? 'Guest' : 'Host'}: {partner?.name || '(unknown)'}
                          </div>
                          <div className="text-xs text-slate-600">
                            Status: <span className="font-mono">{m.status}</span>
                            {recordType === 'host' && m.guests && (
                              <> · {m.guests.party_size} guests · {m.guests.arrival_date} → {m.guests.departure_date}</>
                            )}
                            {recordType === 'guest' && m.hosts && (
                              <> · capacity {m.hosts.capacity}</>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setDecisions({ ...decisions, [m.id]: 'cancel' })}
                            className={`px-2 py-1 text-xs rounded border ${
                              decisions[m.id] === 'cancel'
                                ? 'bg-red-600 text-white border-red-600'
                                : 'bg-white border-slate-300 text-slate-700'
                            }`}
                          >
                            Cancel match
                          </button>
                          <button
                            type="button"
                            onClick={() => setDecisions({ ...decisions, [m.id]: 'keep' })}
                            className={`px-2 py-1 text-xs rounded border ${
                              decisions[m.id] === 'keep'
                                ? 'bg-slate-700 text-white border-slate-700'
                                : 'bg-white border-slate-300 text-slate-700'
                            }`}
                          >
                            Keep match
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Heads up: keeping a match while the {recordType} is removed means the partner will
                still see it as pending but the link won&apos;t work. Usually you want to cancel.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded border border-slate-300 bg-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || loading}
            className="px-4 py-2 text-sm rounded bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Removing...' : `Remove ${recordType}`}
          </button>
        </div>
      </div>
    </div>
  );
}
