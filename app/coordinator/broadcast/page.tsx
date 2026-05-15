'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Coordinator broadcast composition page.
 *
 * Composes a subject + body, shows live preview with sample guest name,
 * shows recipient count, requires explicit confirm before sending.
 */
export default function BroadcastPage() {
  const [token, setToken] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const [count, setCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);

  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; total: number; errors?: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem('coord_pw') : null;
    if (!saved) {
      setUnauthorized(true);
      setLoadingCount(false);
      return;
    }
    setToken(saved);

    fetch('/api/coordinator/broadcast', {
      headers: { Authorization: `Bearer ${saved}` },
    })
      .then(async (r) => {
        if (r.status === 401) {
          window.sessionStorage.removeItem('coord_pw');
          setUnauthorized(true);
          return;
        }
        const d = await r.json();
        if (d.error) { setError(d.error); return; }
        setCount(d.count);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingCount(false));
  }, []);

  async function handleSend() {
    if (!token) return;
    setSending(true);
    setError(null);
    setResult(null);

    const res = await fetch('/api/coordinator/broadcast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body: bodyText,
        expected_count: count,
      }),
    });

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error === 'count_mismatch' ? b.message : (b.error || 'Send failed'));
      setSending(false);
      setShowConfirm(false);
      return;
    }

    const d = await res.json();
    setResult(d);
    setSending(false);
    setShowConfirm(false);

    // Clear form after success so coordinator doesn't accidentally re-send
    if (d.failed === 0) {
      setSubject('');
      setBodyText('');
    }
  }

  if (unauthorized) {
    return (
      <div className="max-w-lg mx-auto bg-white rounded-lg border border-slate-200 p-8 mt-12 text-center space-y-3">
        <h1 className="text-xl font-semibold">Not signed in</h1>
        <p className="text-slate-600 text-sm">
          You need to sign in to the coordinator dashboard first.
        </p>
        <Link href="/coordinator" className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
          Go to dashboard
        </Link>
      </div>
    );
  }

  const previewSubject = subject.replace(/\{name\}/gi, 'Alex');
  const previewBody = bodyText.replace(/\{name\}/gi, 'Alex');
  const isValid = subject.trim().length > 0 && bodyText.trim().length > 0;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Broadcast to all guests</h1>
          <p className="text-sm text-slate-600 mt-1">
            Send a custom email to every active guest. Use this for event updates, reminders, or announcements.
          </p>
        </div>
        <Link href="/coordinator" className="text-sm text-slate-500 hover:text-slate-700 whitespace-nowrap">
          ← Back
        </Link>
      </div>

      {/* Recipient count card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        {loadingCount ? (
          <p className="text-sm text-slate-600">Counting recipients...</p>
        ) : (
          <p className="text-sm text-blue-900">
            This will email <strong>{count ?? 0}</strong> active guest{count === 1 ? '' : 's'}.
            Guests who have been cancelled or removed are excluded.
          </p>
        )}
      </div>

      {/* Result banner */}
      {result && (
        <div className={`border rounded-lg p-4 text-sm ${
          result.failed === 0
            ? 'bg-green-50 border-green-200 text-green-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          <p className="font-medium">
            {result.failed === 0
              ? `✓ Sent to ${result.sent} guest${result.sent === 1 ? '' : 's'}.`
              : `Sent: ${result.sent} · Failed: ${result.failed} (out of ${result.total})`}
          </p>
          {result.errors && result.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs">Show errors</summary>
              <ul className="mt-2 text-xs space-y-1">
                {result.errors.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {/* Compose form */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g., Important update for Panihati 2026"
            maxLength={200}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Message body</label>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            rows={10}
            maxLength={5000}
            placeholder="Hi {name},&#10;&#10;Type your message here...&#10;&#10;Thanks!"
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm font-mono"
          />
          <p className="text-xs text-slate-500 mt-1">
            Use <code className="bg-slate-100 px-1 rounded">{'{name}'}</code> anywhere to insert the guest&apos;s name.
            Leave blank lines between paragraphs.
          </p>
        </div>
      </div>

      {/* Live preview */}
      {(subject || bodyText) && (
        <div>
          <h2 className="text-sm font-medium mb-2">Preview (as guest &quot;Alex&quot; will see it)</h2>
          <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
            <p className="text-xs text-slate-500 mb-2">Subject:</p>
            <p className="text-sm font-medium mb-4">{previewSubject || <span className="text-slate-400 italic">(no subject)</span>}</p>
            <p className="text-xs text-slate-500 mb-2">Body:</p>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">
              {previewBody || <span className="text-slate-400 italic">(empty)</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <Link
          href="/coordinator"
          className="px-4 py-2 text-sm rounded border border-slate-300 bg-white"
        >
          Cancel
        </Link>
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!isValid || count === 0 || loadingCount || sending}
          className="px-4 py-2 text-sm rounded bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          Send broadcast
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold">Send broadcast?</h2>
            </div>
            <div className="p-6 space-y-3 text-sm text-slate-700">
              <p>This will send the email to <strong>{count} active guest{count === 1 ? '' : 's'}</strong>.</p>
              <p>Once sent, the email cannot be recalled.</p>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2 bg-slate-50">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={sending}
                className="px-4 py-2 text-sm rounded border border-slate-300 bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {sending ? `Sending to ${count}...` : `Send to ${count} guests`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
