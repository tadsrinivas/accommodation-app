'use client';

import { useEffect, useState } from 'react';

/**
 * Coordinator-only edit modal for a single host or guest record.
 *
 * Two modes:
 *   - Edit: pass recordId. Loads the record, updates via PUT.
 *   - Create: pass recordId={null}. Starts with empty defaults, creates via POST.
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
  recordId: string | null;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isCreating = recordId === null || recordId === '';
  const [loading, setLoading] = useState(!isCreating);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<any>(
    isCreating
      ? defaultRecord(recordType)
      : null
  );

  useEffect(() => {
    if (isCreating) return; // No load needed in create mode

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
  }, [recordType, recordId, token, isCreating]);

  function setField(key: string, value: any) {
    setRecord({ ...record, [key]: value });
  }

  async function handleSave() {
    setSubmitting(true);
    setError(null);

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
        host_type: record.host_type,
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
      // Include send_confirmation only in create mode
      if (isCreating) {
        payload.send_confirmation = record.send_confirmation !== false;
      }
    }

    // Create (POST to collection) vs Update (PUT to item)
    const url = isCreating
      ? (recordType === 'host'
          ? '/api/coordinator/hosts'  // (host create not implemented in this bundle)
          : '/api/coordinator/guests')
      : (recordType === 'host'
          ? `/api/coordinator/hosts/${recordId}`
          : `/api/coordinator/guests/${recordId}`);

    const method = isCreating ? 'POST' : 'PUT';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // Surface zod validation issues if present
      let msg = body.error || 'Save failed';
      if (body.issues?.fieldErrors) {
        const firstField = Object.keys(body.issues.fieldErrors)[0];
        const firstErr = body.issues.fieldErrors[firstField]?.[0];
        if (firstErr) msg = `${firstField}: ${firstErr}`;
      }
      setError(msg);
      setSubmitting(false);
      return;
    }
    onSaved();
  }

  const title = isCreating
    ? (recordType === 'host' ? 'Add host' : 'Add guest')
    : `Edit ${recordType}${record?.name ? `: ${record.name}` : ''}`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
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
                <label className="block text-sm font-medium mb-1">Host type</label>
                <select
                  value={record.host_type || 'residence'}
                  onChange={(e) => setField('host_type', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="residence">Residence (volunteer host)</option>
                  <option value="hotel">Hotel (commercial partner)</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Hotels skip the reconfirmation outreach and are treated as available for matching.
                </p>
              </div>

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
              <Field label="Email" type="email" value={record.email || ''} onChange={(v) => setField('email', v)} required={!isCreating} />
              <Field label="Phone" type="tel" value={record.phone || ''} onChange={(v) => setField('phone', v)} />
              {isCreating && (
                <p className="text-xs text-slate-500 -mt-2">Either email or phone is required.</p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Arrival" type="date" value={record.arrival_date || ''} onChange={(v) => setField('arrival_date', v)} required />
                <Field label="Departure" type="date" value={record.departure_date || ''} onChange={(v) => setField('departure_date', v)} required />
              </div>
              <NumberField label="Party size" value={record.party_size || 1} onChange={(v) => setField('party_size', v)} min={1} max={20} />
              <TextArea label="Notes" value={record.notes || ''} onChange={(v) => setField('notes', v)} rows={3} />

              {isCreating && (
                <div className="bg-slate-50 border border-slate-200 rounded p-3">
                  <label className="flex items-start gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={record.send_confirmation !== false}
                      onChange={(e) => setField('send_confirmation', e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-medium">Send intake confirmation</span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        The guest will receive an email and SMS confirming we&apos;ve received their request.
                        Uncheck if they don&apos;t need to be notified (e.g., already discussed by phone).
                      </span>
                    </span>
                  </label>
                </div>
              )}
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
            {submitting ? 'Saving...' : (isCreating ? 'Create' : 'Save changes')}
          </button>
        </div>
      </div>
    </div>
  );
}

function defaultRecord(recordType: 'host' | 'guest') {
  if (recordType === 'host') {
    return {
      name: '',
      email: '',
      phone: '',
      capacity: 1,
      address: '',
      notes: '',
      host_type: 'residence',
      approval_status: 'approved',
      confirmed_available: null,
    };
  }
  // guest
  return {
    name: '',
    email: '',
    phone: '',
    arrival_date: '',
    departure_date: '',
    party_size: 1,
    notes: '',
    send_confirmation: true,
  };
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
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
