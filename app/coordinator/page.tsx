'use client';

import { useEffect, useState } from 'react';
import { RemoveConfirmDialog } from '@/components/RemoveConfirmDialog';
import { RemovedTab } from '@/components/RemovedTab';
import { EditRecordDialog } from '@/components/EditRecordDialog';
import { EditMatchDialog } from '@/components/EditMatchDialog';
import { EditProposalDialog } from '@/components/EditProposalDialog';
import { ManualMatchDialog } from '@/components/ManualMatchDialog';

export default function CoordinatorPage() {
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem('coord_pw') : null;
    if (saved) setAuth(saved);
  }, []);

  if (!auth) {
    return (
      <div className="max-w-sm mx-auto bg-white rounded-lg border border-slate-200 p-6 mt-12">
        <h1 className="text-xl font-semibold mb-4">Coordinator login</h1>
        <input
          type="password"
          placeholder="Coordinator password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm mb-3"
        />
        <button
          onClick={() => {
            window.sessionStorage.setItem('coord_pw', password);
            setAuth(password);
          }}
          className="w-full py-2 bg-blue-600 text-white rounded-md font-medium"
        >
          Login
        </button>
      </div>
    );
  }

  return <Dashboard token={auth} onLogout={() => { window.sessionStorage.removeItem('coord_pw'); setAuth(null); }} />;
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [tab, setTab] = useState<'hosts' | 'outreach' | 'guests' | 'matches' | 'intake' | 'removed'>('hosts');
  const [hosts, setHosts] = useState<any[]>([]);
  const [removeTarget, setRemoveTarget] = useState<{ type: 'host' | 'guest'; id: string; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<{ type: 'host' | 'guest'; id: string | null } | null>(null);
  const [editMatchTarget, setEditMatchTarget] = useState<{ matchId: string; hostId: string; guestId: string; hostName: string; guestName: string } | null>(null);
  const [editProposalIndex, setEditProposalIndex] = useState<number | null>(null);
  const [showManualMatch, setShowManualMatch] = useState(false);
  const [showDeclined, setShowDeclined] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [manualList, setManualList] = useState<any[]>([]);
  const [guests, setGuests] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [existing, setExisting] = useState<any[]>([]);
  const [intakeSessions, setIntakeSessions] = useState<any[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  async function loadHosts() {
    const r = await fetch('/api/hosts', { headers });
    if (r.status === 401) { onLogout(); return; }
    const d = await r.json();
    setHosts(d.hosts || []);
  }
  async function loadPending() {
    const r = await fetch('/api/hosts/approve', { headers });
    if (r.status === 401) { onLogout(); return; }
    const d = await r.json();
    setPending(d.hosts || []);
  }
  async function loadManual() {
    const r = await fetch('/api/outreach/manual', { headers });
    const d = await r.json();
    setManualList(d.hosts || []);
  }
  async function loadGuests() {
    const r = await fetch('/api/guests', { headers });
    const d = await r.json();
    setGuests(d.guests || []);
  }
  async function loadMatches() {
    const r = await fetch('/api/match', { headers });
    const d = await r.json();
    setProposals(d.proposals || []);
    setExisting(d.existing || []);
  }

  async function regenerate() {
    setStatus('Regenerating proposals...');
    const r = await fetch('/api/match', { headers });
    const d = await r.json();
    const proposalCount = (d.proposals || []).length;
    setProposals(d.proposals || []);
    setExisting(d.existing || []);
    setStatus(`Regenerated. ${proposalCount} proposal${proposalCount === 1 ? '' : 's'} ready.`);
  }
  async function loadIntake() {
    const r = await fetch('/api/voice/intake/sessions', { headers });
    const d = await r.json();
    setIntakeSessions(d.sessions || []);
  }

  useEffect(() => {
    if (tab === 'hosts') { loadHosts(); loadPending(); }
    if (tab === 'outreach') { loadHosts(); loadManual(); }
    if (tab === 'guests') loadGuests();
    if (tab === 'matches') { loadMatches(); loadHosts(); loadGuests(); }
    if (tab === 'intake') loadIntake();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function approveHost(hostId: string) {
    const res = await fetch('/api/hosts/approve', {
      method: 'POST', headers,
      body: JSON.stringify({ host_id: hostId, action: 'approve' }),
    });
    if (res.ok) { setStatus('Host approved.'); loadPending(); loadHosts(); }
    else { const d = await res.json(); setStatus(`Approve failed: ${d.error}`); }
  }

  async function rejectHost(hostId: string) {
    const note = window.prompt('Optional rejection note (visible in their email). Leave blank for the default polite message:') || undefined;
    if (note === null) return;
    const res = await fetch('/api/hosts/approve', {
      method: 'POST', headers,
      body: JSON.stringify({ host_id: hostId, action: 'reject', note }),
    });
    if (res.ok) { setStatus('Host rejected.'); loadPending(); loadHosts(); }
    else { const d = await res.json(); setStatus(`Reject failed: ${d.error}`); }
  }

  async function runOutreach() {
    setStatus('Running outreach scheduler...');
    const r = await fetch('/api/outreach/run', { method: 'POST', headers });
    const d = await r.json();
    setStatus(
      `Processed ${d.processed}: sms+email=${d.sent_sms_email ?? 0}, sms=${d.sent_sms ?? 0}, email=${d.sent_email ?? 0}, voice=${d.sent_voice ?? 0}, flagged=${d.flagged_manual ?? 0}, skipped=${d.skipped ?? 0}, errors=${d.errors ?? 0}`
    );
    loadHosts();
    loadManual();
  }

  async function markManual(hostId: string, action: 'mark_yes' | 'mark_no' | 'mark_dnc') {
    await fetch('/api/outreach/manual', {
      method: 'POST', headers,
      body: JSON.stringify({ host_id: hostId, action }),
    });
    loadManual();
    loadHosts();
  }

  async function approveProposals() {
    setStatus('Saving matches...');
    const r = await fetch('/api/match', {
      method: 'POST', headers, body: JSON.stringify({ proposals }),
    });
    const d = await r.json();
    setStatus(`Saved ${d.saved} matches.`);
    loadMatches();
  }

  async function notifyAll() {
    setStatus('Sending match notifications...');
    const r = await fetch('/api/notify', { method: 'POST', headers });
    const d = await r.json();
    setStatus(`Notified ${d.notified} match(es).`);
    loadMatches();
  }

  async function revertMatch(matchId: string, hostName: string, guestName: string) {
    const ok = window.confirm(
      `Revert this match? Both ${hostName} (host) and ${guestName} (guest) will be notified that the match was cancelled.`
    );
    if (!ok) return;
    setStatus('Reverting match...');
    const r = await fetch(`/api/coordinator/matches/${matchId}`, {
      method: 'DELETE',
      headers,
    });
    if (!r.ok) {
      const b = await r.json().catch(() => ({}));
      setStatus(`Revert failed: ${b.error || 'unknown'}`);
      return;
    }
    const d = await r.json();
    setStatus(`Match reverted. Notified ${d.notified} parties.`);
    loadMatches();
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-2xl font-semibold">Coordinator dashboard</h1>
        <div className="flex items-center gap-4">
          <a href="/coordinator/audit" className="text-sm text-amber-700 hover:text-amber-900 underline">
            Records needing attention
          </a>
          <a href="/coordinator/broadcast" className="text-sm text-blue-700 hover:text-blue-900 underline">
            Broadcast email
          </a>
          <button onClick={onLogout} className="text-sm text-slate-500 hover:text-slate-700">Logout</button>
        </div>
      </header>

      <nav className="flex gap-2 border-b border-slate-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        {(['hosts', 'outreach', 'guests', 'intake', 'matches', 'removed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap shrink-0 ${
              tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600'
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {status && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-3 py-2 rounded text-sm">
          {status}
        </div>
      )}

      {tab === 'hosts' && (
        <section className="space-y-4">
          {pending.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">
                Pending approvals <Badge color="amber">{pending.length}</Badge>
              </h2>
              <div className="bg-white border border-amber-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-amber-50">
                    <tr>
                      <Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Cap</Th><Th>Address</Th><Th>Notes</Th><Th>Submitted</Th><Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((h) => (
                      <tr key={h.id} className="border-t border-amber-100">
                        <Td>{h.name}</Td>
                        <Td className="text-xs">{h.email}</Td>
                        <Td className="text-xs">{h.phone || '—'}</Td>
                        <Td>{h.capacity}</Td>
                        <Td className="text-xs">{h.address || '—'}</Td>
                        <Td className="text-xs">{h.notes || '—'}</Td>
                        <Td className="text-xs">{h.submitted_at ? new Date(h.submitted_at).toLocaleDateString() : '—'}</Td>
                        <Td>
                          <div className="flex gap-1">
                            <SmallBtn onClick={() => approveHost(h.id)} color="green">Approve</SmallBtn>
                            <SmallBtn onClick={() => rejectHost(h.id)} color="red">Reject</SmallBtn>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h2 className="text-lg font-semibold">All hosts</h2>
              {hosts.filter((h) => h.confirmed_available === false).length > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDeclined}
                    onChange={(e) => setShowDeclined(e.target.checked)}
                  />
                  <span>
                    Show declined ({hosts.filter((h) => h.confirmed_available === false).length})
                  </span>
                </label>
              )}
            </div>
            <p className="text-sm text-slate-600 mb-2">
              {hosts.length} host(s) total. {hosts.filter((h) => h.confirmed_available === true).length} available, {' '}
              {hosts.filter((h) => h.confirmed_available === false).length} declined, {' '}
              {hosts.filter((h) => h.confirmed_available === null).length} awaiting.
            </p>
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Capacity</Th><Th>Status</Th><Th>Approval</Th><Th>Source</Th><Th>Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {hosts
                    .filter((h) => showDeclined || h.confirmed_available !== false)
                    .map((h) => (
                    <tr key={h.id} className="border-t border-slate-100">
                      <Td>
                        <div className="flex items-center gap-2">
                          <span>{h.name}</span>
                          {h.host_type === 'hotel' && (
                            <Badge color="blue">Hotel</Badge>
                          )}
                        </div>
                      </Td>
                      <Td className="text-xs">{h.email}</Td>
                      <Td className="text-xs">{h.phone || '—'}</Td>
                      <Td>{h.used_capacity ?? 0}/{h.capacity}</Td>
                      <Td>
                        {h.confirmed_available === true && <Badge color="green">Available</Badge>}
                        {h.confirmed_available === false && <Badge color="slate">Declined</Badge>}
                        {h.confirmed_available === null && <Badge color="amber">Awaiting</Badge>}
                      </Td>
                      <Td className="text-xs">
                        {h.approval_status === 'pending' && <Badge color="amber">Pending</Badge>}
                        {h.approval_status === 'approved' && <Badge color="green">Approved</Badge>}
                        {h.approval_status === 'rejected' && <Badge color="red">Rejected</Badge>}
                      </Td>
                      <Td className="text-xs">{h.source || 'imported'}</Td>
                      <Td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => setEditTarget({ type: 'host', id: h.id })}
                            className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setRemoveTarget({ type: 'host', id: h.id, name: h.name })}
                            className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'outreach' && (
        <section className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">Sequential outreach</h2>
            <OutreachConfigSummary token={token} />
            <button
              onClick={runOutreach}
              className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700"
            >
              Run outreach now
            </button>
          </div>

          <OutreachStats hosts={hosts} />

          <div>
            <h2 className="text-lg font-semibold mb-2">Hosts requiring manual call ({manualList.length})</h2>
            <p className="text-xs text-slate-500 mb-3">
              These hosts didn&apos;t respond to any of the automated channels. Please call them directly.
            </p>
            {manualList.length === 0 ? (
              <p className="text-sm text-slate-500 italic">None right now.</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>SMS</Th><Th>Email</Th><Th>Voice</Th><Th>Last call</Th><Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {manualList.map((h) => (
                      <tr key={h.id} className="border-t border-slate-100">
                        <Td>{h.name}</Td>
                        <Td className="text-xs">
                          {h.phone ? (<a className="text-blue-600 hover:underline" href={`tel:${h.phone}`}>{h.phone}</a>) : '—'}
                        </Td>
                        <Td className="text-xs">{h.email}</Td>
                        <Td>{h.sms_attempts}</Td>
                        <Td>{h.email_attempts}</Td>
                        <Td>{h.voice_attempts}</Td>
                        <Td className="text-xs">{h.voice_call_status || '—'}</Td>
                        <Td>
                          <div className="flex gap-1">
                            <SmallBtn onClick={() => markManual(h.id, 'mark_yes')} color="green">Yes</SmallBtn>
                            <SmallBtn onClick={() => markManual(h.id, 'mark_no')} color="slate">No</SmallBtn>
                            <SmallBtn onClick={() => markManual(h.id, 'mark_dnc')} color="red">DNC</SmallBtn>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'guests' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-sm text-slate-600">{guests.length} guest request(s).</p>
            <button
              onClick={() => setEditTarget({ type: 'guest', id: null })}
              className="px-3 py-2 text-sm border border-blue-600 text-blue-700 rounded-md hover:bg-blue-50 font-medium"
            >
              + Add guest
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>Arrival</Th><Th>Departure</Th><Th>Party</Th><Th>Notes</Th><Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <Td>{g.name}</Td>
                    <Td className="text-xs">{g.email}</Td>
                    <Td className="text-xs">
                      {g.phone ? <a className="text-blue-600 hover:underline" href={`tel:${g.phone}`}>{g.phone}</a> : '—'}
                    </Td>
                    <Td>{g.arrival_date}</Td>
                    <Td>{g.departure_date}</Td>
                    <Td>{g.party_size}</Td>
                    <Td>{g.notes || '—'}</Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setEditTarget({ type: 'guest', id: g.id })}
                          className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setRemoveTarget({ type: 'guest', id: g.id, name: g.name })}
                          className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'intake' && (
        <section className="space-y-3">
          <p className="text-sm text-slate-600">
            {intakeSessions.length} voice intake session(s). Sessions move through:
            <span className="text-xs"> started → collecting → sms_sent → completed.</span>
          </p>
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Caller</Th><Th>Phone</Th><Th>Arrival</Th><Th>Departure</Th><Th>Party</Th><Th>Step</Th><Th>Started</Th><Th>Result</Th>
                </tr>
              </thead>
              <tbody>
                {intakeSessions.map((s) => (
                  <tr key={s.id} className="border-t border-slate-100">
                    <Td>{s.name || <span className="text-slate-400 italic">—</span>}</Td>
                    <Td className="text-xs">{s.caller_phone || '—'}</Td>
                    <Td className="text-xs">{s.arrival_date || '—'}</Td>
                    <Td className="text-xs">{s.departure_date || '—'}</Td>
                    <Td>{s.party_size ?? '—'}</Td>
                    <Td className="text-xs">
                      <Badge color={
                        s.step === 'completed' ? 'green' :
                        s.step === 'abandoned' || s.step === 'expired' ? 'red' :
                        s.step === 'sms_sent' ? 'amber' : 'slate'
                      }>{s.step.replace(/_/g, ' ')}</Badge>
                    </Td>
                    <Td className="text-xs">{new Date(s.call_started_at).toLocaleString()}</Td>
                    <Td className="text-xs">{s.guest_id ? '✓ Guest created' : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {intakeSessions.length === 0 && (
            <p className="text-sm text-slate-500 italic">No voice intake calls yet. Configure the Twilio inbound webhook to point to /api/voice/inbound and try calling your Twilio number.</p>
          )}
        </section>
      )}

      {tab === 'matches' && (
        <section className="space-y-6">
          {/* Capacity & demand summary */}
          {(() => {
            const eligibleHosts = hosts.filter(
              (h) => h.approval_status === 'approved' && h.confirmed_available === true && !h.cancelled_at
            );
            const totalCapacity = eligibleHosts.reduce((sum, h) => sum + (h.capacity || 0), 0);
            const usedCapacity = eligibleHosts.reduce((sum, h) => sum + (h.used_capacity || 0), 0);
            const remainingCapacity = totalCapacity - usedCapacity;
            const totalGuests = guests.reduce((sum, g) => sum + (g.party_size || 0), 0);
            const guestPartyCount = guests.length;
            const shortfall = totalGuests - totalCapacity;
            return (
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Capacity vs demand</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SummaryStat label="Total guests" value={totalGuests} sublabel={`${guestPartyCount} party${guestPartyCount === 1 ? '' : 's'}`} />
                  <SummaryStat label="Host capacity" value={totalCapacity} sublabel={`${eligibleHosts.length} host${eligibleHosts.length === 1 ? '' : 's'}`} />
                  <SummaryStat label="Used" value={usedCapacity} sublabel={`${remainingCapacity} remaining`} />
                  <SummaryStat
                    label={shortfall > 0 ? 'Shortfall' : 'Buffer'}
                    value={Math.abs(shortfall)}
                    sublabel={shortfall > 0 ? 'guests over capacity' : 'spare capacity'}
                    color={shortfall > 0 ? 'red' : 'green'}
                  />
                </div>
              </div>
            );
          })()}

          <div>
            <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">Proposed matches ({proposals.length})</h2>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setShowManualMatch(true)} className="px-3 py-2 text-sm border border-blue-600 text-blue-700 rounded-md hover:bg-blue-50 font-medium">+ Add manual match</button>
                <button onClick={regenerate} className="px-3 py-2 text-sm border border-slate-300 rounded-md hover:bg-slate-50">Regenerate</button>
                <button
                  onClick={approveProposals}
                  disabled={proposals.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md font-medium hover:bg-blue-700 disabled:opacity-50"
                >Save all proposals</button>
              </div>
            </div>
            {proposals.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No new matches.</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-slate-50">
                    <tr><Th>Host</Th><Th>Guest</Th><Th>Party</Th><Th>Capacity</Th><Th>Arrival</Th><Th>Departure</Th><Th>Actions</Th></tr>
                  </thead>
                  <tbody>
                    {proposals.map((p, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <Td>{p.host_name}</Td><Td>{p.guest_name}</Td><Td>{p.party_size}</Td><Td>{p.capacity}</Td><Td>{p.arrival}</Td><Td>{p.departure}</Td>
                        <Td>
                          <div className="flex gap-1">
                            <button
                              onClick={() => setEditProposalIndex(i)}
                              className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                if (window.confirm(`Drop this proposal? ${p.host_name} ↔ ${p.guest_name}`)) {
                                  setProposals(proposals.filter((_, idx) => idx !== i));
                                  setStatus('Proposal dropped. Click Regenerate or Save all when ready.');
                                }
                              }}
                              className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                            >
                              Drop
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
              <h2 className="text-lg font-semibold">Saved matches ({existing.length})</h2>
              <button onClick={notifyAll} className="px-4 py-2 bg-green-600 text-white text-sm rounded-md font-medium hover:bg-green-700">Notify all proposed matches</button>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-slate-50">
                  <tr><Th>Host</Th><Th>Guest</Th><Th>Status</Th><Th>Host response</Th><Th>Guest response</Th><Th>Exchanged</Th><Th>Actions</Th></tr>
                </thead>
                <tbody>
                  {existing.map((m) => {
                    const host = Array.isArray(m.hosts) ? m.hosts[0] : m.hosts;
                    const guest = Array.isArray(m.guests) ? m.guests[0] : m.guests;
                    const isCancelled = m.status === 'cancelled';
                    const canEdit = m.status === 'proposed';
                    return (
                      <tr key={m.id} className="border-t border-slate-100">
                        <Td>{host?.name}</Td>
                        <Td>{guest?.name}</Td>
                        <Td><Badge color={m.status === 'confirmed' ? 'green' : m.status === 'declined' || m.status === 'cancelled' ? 'slate' : 'amber'}>{m.status}</Badge></Td>
                        <Td>{m.host_response || '—'}</Td>
                        <Td>{m.guest_response || '—'}</Td>
                        <Td>{m.contacts_exchanged ? '✓' : '—'}</Td>
                        <Td>
                          <div className="flex gap-1">
                            {canEdit && (
                              <button
                                onClick={() => setEditMatchTarget({
                                  matchId: m.id,
                                  hostId: m.host_id,
                                  guestId: m.guest_id,
                                  hostName: host?.name || '',
                                  guestName: guest?.name || '',
                                })}
                                className="px-2 py-1 text-xs rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
                              >
                                Edit
                              </button>
                            )}
                            {!isCancelled && (
                              <button
                                onClick={() => revertMatch(m.id, host?.name || '', guest?.name || '')}
                                className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                              >
                                Revert
                              </button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'removed' && <RemovedTab token={token} />}

      {removeTarget && (
        <RemoveConfirmDialog
          recordType={removeTarget.type}
          recordId={removeTarget.id}
          recordName={removeTarget.name}
          token={token}
          onClose={() => setRemoveTarget(null)}
          onConfirmed={() => {
            setRemoveTarget(null);
            setStatus(`${removeTarget.type === 'host' ? 'Host' : 'Guest'} ${removeTarget.name} was removed.`);
            // Reload the appropriate active list
            if (removeTarget.type === 'host') loadHosts();
            else loadGuests();
          }}
        />
      )}

      {editTarget && (
        <EditRecordDialog
          recordType={editTarget.type}
          recordId={editTarget.id}
          token={token}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            const wasCreating = editTarget.id === null;
            const typeLabel = editTarget.type === 'host' ? 'Host' : 'Guest';
            setEditTarget(null);
            setStatus(wasCreating ? `${typeLabel} created.` : 'Saved.');
            if (editTarget.type === 'host') loadHosts();
            else loadGuests();
          }}
        />
      )}

      {editMatchTarget && (
        <EditMatchDialog
          matchId={editMatchTarget.matchId}
          currentHostId={editMatchTarget.hostId}
          currentGuestId={editMatchTarget.guestId}
          currentHostName={editMatchTarget.hostName}
          currentGuestName={editMatchTarget.guestName}
          token={token}
          onClose={() => setEditMatchTarget(null)}
          onSaved={() => {
            setEditMatchTarget(null);
            setStatus('Match updated. Re-run notifications when ready.');
            loadMatches();
          }}
        />
      )}

      {editProposalIndex !== null && proposals[editProposalIndex] && (
        <EditProposalDialog
          currentHostId={proposals[editProposalIndex].host_id}
          currentGuestId={proposals[editProposalIndex].guest_id}
          currentHostName={proposals[editProposalIndex].host_name}
          currentGuestName={proposals[editProposalIndex].guest_name}
          token={token}
          onClose={() => setEditProposalIndex(null)}
          onSaved={(newHostId, newGuestId, newHost, newGuest) => {
            // Detect conflicts with other proposals in the local list — can't
            // double-book a host or guest in the same batch.
            const conflictsWithHost = proposals.some(
              (p, idx) => idx !== editProposalIndex && p.host_id === newHostId
            );
            const conflictsWithGuest = proposals.some(
              (p, idx) => idx !== editProposalIndex && p.guest_id === newGuestId
            );
            if (conflictsWithHost) {
              setStatus(`Cannot save: ${newHost.name} is already in another proposal in this batch. Drop the other one first.`);
              return;
            }
            if (conflictsWithGuest) {
              setStatus(`Cannot save: ${newGuest.name} is already in another proposal in this batch. Drop the other one first.`);
              return;
            }

            const updated = [...proposals];
            updated[editProposalIndex] = {
              ...updated[editProposalIndex],
              host_id: newHostId,
              host_name: newHost.name,
              capacity: newHost.capacity,
              guest_id: newGuestId,
              guest_name: newGuest.name,
              party_size: newGuest.party_size,
              arrival: newGuest.arrival_date,
              departure: newGuest.departure_date,
            };
            setProposals(updated);
            setEditProposalIndex(null);
            setStatus(`Proposal updated. Click Save all when ready.`);
          }}
        />
      )}
      {showManualMatch && (
        <ManualMatchDialog
          token={token}
          onClose={() => setShowManualMatch(false)}
          onCreated={(hostName, guestName) => {
            setShowManualMatch(false);
            setStatus(`Manual match created: ${hostName} ↔ ${guestName}. Click "Notify all proposed matches" to email both parties.`);
            loadMatches();
            loadHosts();
          }}
        />
      )}
    </div>
  );
}

function OutreachConfigSummary({ token }: { token: string }) {
  const [cfg, setCfg] = useState<{ delay_days: number; sequence: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/outreach/config', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => { if (d.error) setErr(d.error); else setCfg(d); })
      .catch((e) => setErr(String(e)));
  }, [token]);

  if (err) return <p className="text-sm text-red-600">Couldn&apos;t load config: {err}</p>;
  if (!cfg) return <p className="text-sm text-slate-500">Loading config...</p>;

  const channelLabel: Record<string, string> = {
    'sms': 'SMS',
    'email': 'email',
    'sms+email': 'SMS + email',
    'voice': 'voice call',
  };

  return (
    <div className="text-sm text-slate-700 space-y-1">
      <p>
        <span className="font-medium">Delay between stages:</span> {cfg.delay_days} day{cfg.delay_days === 1 ? '' : 's'}
      </p>
      <p>
        <span className="font-medium">Sequence:</span>{' '}
        {cfg.sequence.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="text-slate-400 mx-1">→</span>}
            <span className="inline-block px-2 py-0.5 bg-slate-100 rounded text-xs">
              Day {i * cfg.delay_days}: {channelLabel[c] || c}
            </span>
          </span>
        ))}
        <span className="text-slate-400 mx-1">→</span>
        <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-xs">
          Day {cfg.sequence.length * cfg.delay_days}: manual call
        </span>
      </p>
      <p className="text-xs text-slate-500 pt-1">
        Configured via <code className="bg-slate-100 px-1 rounded">OUTREACH_STAGE_DELAY_DAYS</code> and{' '}
        <code className="bg-slate-100 px-1 rounded">OUTREACH_CHANNEL_SEQUENCE</code> env vars. Restart the server after changing.
      </p>
    </div>
  );
}

function OutreachStats({ hosts }: { hosts: any[] }) {
  const stages = ['pending', 'sent_initial', 'sent_sms_2', 'sent_email_2', 'sent_voice', 'manual_required', 'responded'];
  const counts = stages.map((s) => ({ stage: s, count: hosts.filter((h) => h.outreach_stage === s).length }));
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">Pipeline by stage</h3>
      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
        {counts.map((c) => (
          <div key={c.stage} className="text-center">
            <div className="text-2xl font-semibold">{c.count}</div>
            <div className="text-xs text-slate-500 break-words">{c.stage.replace(/_/g, ' ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="text-left px-3 py-2 font-medium text-slate-600 whitespace-nowrap">{children}</th>;
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
function Badge({ children, color }: { children: React.ReactNode; color: 'green' | 'amber' | 'slate' | 'red' | 'blue' }) {
  const classes = {
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    slate: 'bg-slate-100 text-slate-700',
    red: 'bg-red-100 text-red-800',
    blue: 'bg-blue-100 text-blue-800',
  }[color];
  return <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${classes}`}>{children}</span>;
}
function SmallBtn({ children, onClick, color }: { children: React.ReactNode; onClick: () => void; color: 'green' | 'slate' | 'red' }) {
  const classes = {
    green: 'bg-green-600 hover:bg-green-700 text-white',
    slate: 'bg-slate-600 hover:bg-slate-700 text-white',
    red: 'bg-red-600 hover:bg-red-700 text-white',
  }[color];
  return (
    <button onClick={onClick} className={`px-2 py-1 text-xs rounded font-medium ${classes}`}>
      {children}
    </button>
  );
}

function SummaryStat({
  label,
  value,
  sublabel,
  color,
}: {
  label: string;
  value: number;
  sublabel?: string;
  color?: 'red' | 'green';
}) {
  const valueColor =
    color === 'red' ? 'text-red-700' :
    color === 'green' ? 'text-green-700' :
    'text-slate-900';
  return (
    <div className="text-center">
      <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
      <div className="text-xs text-slate-600 font-medium">{label}</div>
      {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
    </div>
  );
}
