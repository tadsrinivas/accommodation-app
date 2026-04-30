'use client';

import { useEffect, useState } from 'react';

/**
 * Coordinator-only edit modal for a single host or guest record.
 * Loads the record on open, lets coordinator update any field, saves on submit.
 *
 * Validation is server-side; the modal shows whatever error the API returns.
 */
export function EditRecordDialog({
  recordType,
  recordId,
  token,
  onClose,
  onSaved,
}: {
  recordType: 'host' | 'guest';
  recordId: string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<any>(null);

  useEffect(() => {
    const url = recordType === 'host'
      ? `/api/coordinator/hosts/${recordId}`
      : `/api/coordinator/guests/${recordId}`;

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setRecord(recordType === 'host' ? d.host : d.guest);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [recordType, recordId, token]);

  function setField(key: string, value: any) {
    setRecord({ ...record, [key]: value });
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);

    // Build the payload — only include fields the user might have edited.
    let payload: any;
    if (recordType === 'host') {
      payload = {
        name: record.name,
        email: record.email,
        phone: record.phone,
        capacity: record.capacity,
        address: record.address,
        notes: record.notes,
        approval_status: record.approval_status,
        confirmed_available: record.confirmed_available,
      };
    } else {
      payload = {
        name: record.name,
        email: record.email,
        phone: record.phone,
        arrival_date: record.arrival_date,
        departure_date: record.departure_date,
        party_size: record.party_size,
        notes: record.notes,
      };
    }

    const url = recordType === 'host'
      ? `/api/coordinator/hosts/${recordId}`
      : `/api/coordinator/guests/${recordId}`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
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
          <h2 className="text-lg font-semibold">
            Edit {recordType}{record?.name ? `: ${record.name}` : ''}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-2xl leading-none" aria-label="Close">×</button>
        </div>

        <div className="p-6 space-y-4">
          {loading && <p className="text-sm text-slate-500">Loading...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!loading && record && recordType === 'host' && (
            <>
              <Field label="Name" value={record.name || ''} onChange={(v) => setField('name', v)} required />
              <Field label="Email" type="email" value={record.email || ''} onChange={(v) => setField('email', v)} />
              <Field label="Phone" type="tel" value={record.phone || ''} onChange={(v) => setField('phone', v)} />
              <NumberField label="Capacity" value={record.capacity || 1} onChange={(v) => setField('capacity', v)} min={1} max={30} />
              <TextArea label="Address" value={record.address || ''} onChange={(v) => setField('address', v)} rows={2} />
              <TextArea label="Notes" value={record.notes || ''} onChange={(v) => setField('notes', v)} rows={3} />

              <div>
                <label className="block text-sm font-medium mb-1">Approval status</label>
                <select
                  value={record.approval_status || 'pending'}
                  onChange={(e) => setField('approval_status', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Availability</label>
                <select
                  value={record.confirmed_available === null ? 'null' : String(record.confirmed_available)}
                  onChange={(e) => setField('confirmed_available',
                    e.target.value === 'null' ? null :
                    e.target.value === 'true' ? true : false
                  )}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="null">Awaiting response</option>
                  <option value="true">Available</option>
                  <option value="false">Declined</option>
                </select>
              </div>
            </>
          )}

          {!loading && record && recordType === 'guest' && (
            <>
              <Field label="Name" value={record.name || ''} onChange={(v) => setField('name', v)} required />
              <Field label="Email" type="email" value={record.email || ''} onChange={(v) => setField('email', v)} required />
              <Field label="Phone" type="tel" value={record.phone || ''} onChange={(v) => setField('phone', v)} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Arrival" type="date" value={record.arrival_date || ''} onChange={(v) => setField('arrival_date', v)} required />
                <Field label="Departure" type="date" value={record.departure_date || ''} onChange={(v) => setField('departure_date', v)} required />
              </div>
              <NumberField label="Party size" value={record.party_size || 1} onChange={(v) => setField('party_size', v)} min={1} max={20} />
              <TextArea label="Notes" value={record.notes || ''} onChange={(v) => setField('notes', v)} rows={3} />
            </>
          )}
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
            onClick={handleSave}
            disabled={submitting || loading || !record}
            className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}

function TextArea({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
      />
    </div>
  );
}
