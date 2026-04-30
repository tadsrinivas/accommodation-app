'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AuditData {
  counts: {
    hostsNoEmail: number;
    stuckIntakes: number;
    confirmedNoEmail: number;
  };
  hostsNoEmail: any[];
  stuckIntakes: any[];
  confirmedNoEmail: any[];
}

export default function AuditPage() {
  const [data, setData] = useState<AuditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    // Read auth from sessionStorage (same pattern as the main coordinator dashboard).
    const token = typeof window !== 'undefined'
      ? window.sessionStorage.getItem('coord_pw')
      : null;

    if (!token) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    const res = await fetch('/api/coordinator/audit', {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (res.status === 401) {
      // Token in sessionStorage was wrong/stale — clear it and prompt login
      window.sessionStorage.removeItem('coord_pw');
      setUnauthorized(true);
      setLoading(false);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'Failed to load');
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

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

  if (loading) return <p className="p-6 text-slate-500">Loading audit...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!data) return null;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Records needing attention</h1>
          <p className="text-sm text-slate-600">
            People the system can&apos;t notify automatically. Reach out to them manually
            (call, personal email, etc.) and use the action links below.
          </p>
        </div>
        <Link href="/coordinator" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to dashboard
        </Link>
      </div>

      <button onClick={load} className="text-sm text-blue-600 hover:underline">
        ↻ Refresh
      </button>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-4">
        <CountCard label="Hosts (no email)" count={data.counts.hostsNoEmail} color="amber" />
        <CountCard label="Stuck voice intakes" count={data.counts.stuckIntakes} color="red" />
        <CountCard label="Confirmed hosts (no email)" count={data.counts.confirmedNoEmail} color="blue" />
      </div>

      {/* Hosts without email */}
      <Section
        title="Hosts without email — being contacted via SMS/voice only"
        description="These are imported hosts who don't have an email on file. The outreach scheduler will still contact them via phone (when SMS works), but you should call them personally to capture their email if possible."
        empty={data.hostsNoEmail.length === 0}
      >
        {data.hostsNoEmail.map((h) => (
          <Row key={h.id}>
            <div className="flex-1">
              <div className="font-medium">{h.name}</div>
              <div className="text-xs text-slate-600">
                {h.phone || 'no phone'} · capacity {h.capacity || '?'} · source: {h.source || 'unknown'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Outreach: step {h.outreach_step}, last attempt {fmt(h.last_attempt_at)} ·
                Status: {h.confirmed_available === null ? 'awaiting' : h.confirmed_available ? 'confirmed' : 'declined'}
              </div>
            </div>
            <a href={h.profile_link} target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-600 hover:underline">Profile link</a>
          </Row>
        ))}
      </Section>

      {/* Stuck intakes */}
      <Section
        title="Voice intakes that didn't complete"
        description="Guests called and gave their details by voice, but never finished the web form (probably because the SMS link didn't reach them). Call them, get their email, complete the intake on their behalf."
        empty={data.stuckIntakes.length === 0}
      >
        {data.stuckIntakes.map((s) => (
          <Row key={s.id}>
            <div className="flex-1">
              <div className="font-medium">{s.name || '(no name captured)'}</div>
              <div className="text-xs text-slate-600">
                {s.caller_phone || 'no phone'} · {s.party_size} guests · {fmt(s.arrival_date)} → {fmt(s.departure_date)}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                SMS sent: {fmt(s.sms_sent_at)}
              </div>
            </div>
            <a href={s.completion_link} target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-600 hover:underline">Completion link</a>
          </Row>
        ))}
      </Section>

      {/* Confirmed hosts without email */}
      <Section
        title="Confirmed hosts without email — manual welcome needed"
        description="These hosts confirmed they can host (via voice or web) but didn't have an email on file, so the welcome email and profile link weren't sent. Call them, get an email, then forward them their profile link manually."
        empty={data.confirmedNoEmail.length === 0}
      >
        {data.confirmedNoEmail.map((h) => (
          <Row key={h.id}>
            <div className="flex-1">
              <div className="font-medium">{h.name}</div>
              <div className="text-xs text-slate-600">
                {h.phone || 'no phone'} · capacity {h.capacity || '?'}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Confirmed: {fmt(h.confirmed_at)}
              </div>
            </div>
            <a href={h.profile_link} target="_blank" rel="noopener noreferrer"
               className="text-xs text-blue-600 hover:underline">Profile link to send</a>
          </Row>
        ))}
      </Section>
    </div>
  );
}

function CountCard({ label, count, color }: { label: string; count: number; color: 'amber' | 'red' | 'blue' }) {
  const palette = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
  }[color];
  return (
    <div className={`border rounded-lg p-4 ${palette}`}>
      <div className="text-3xl font-bold">{count}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}

function Section({ title, description, empty, children }: any) {
  return (
    <section>
      <h2 className="text-lg font-semibold mb-1">{title}</h2>
      <p className="text-xs text-slate-600 mb-3">{description}</p>
      <div className="border border-slate-200 rounded-md divide-y divide-slate-100 bg-white">
        {empty ? (
          <p className="p-6 text-center text-sm text-slate-500">All clear ✓</p>
        ) : children}
      </div>
    </section>
  );
}

function Row({ children }: any) {
  return <div className="flex items-center gap-3 p-3 hover:bg-slate-50">{children}</div>;
}

function fmt(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString();
}
