import { supabaseAdmin } from './supabase';

export interface MatchProposal {
  host_id: string;
  guest_id: string;
  host_name: string;
  guest_name: string;
  party_size: number;
  capacity: number;
  arrival: string;
  departure: string;
}

/**
 * Simple greedy matcher.
 * Rules:
 *   - Host must have confirmed_available = true
 *   - Host capacity >= guest party_size
 *   - Host not already assigned to a non-declined match
 *   - Larger parties get matched first (they're hardest to place)
 * Returns proposed matches without persisting them.
 * The coordinator reviews & approves before anyone is notified.
 */
export async function generateMatches(): Promise<MatchProposal[]> {
  const { data: hosts, error: hostErr } = await supabaseAdmin
    .from('hosts')
    .select('id, name, capacity')
    .eq('confirmed_available', true);

  if (hostErr) throw hostErr;

  const { data: guests, error: guestErr } = await supabaseAdmin
    .from('guests')
    .select('id, name, party_size, arrival_date, departure_date')
    .order('party_size', { ascending: false });

  if (guestErr) throw guestErr;

  // Exclude hosts & guests already in a non-declined match
  const { data: existing } = await supabaseAdmin
    .from('matches')
    .select('host_id, guest_id, status')
    .neq('status', 'declined')
    .neq('status', 'cancelled');

  const takenHosts = new Set((existing || []).map((m) => m.host_id));
  const takenGuests = new Set((existing || []).map((m) => m.guest_id));

  const availableHosts = (hosts || []).filter((h) => !takenHosts.has(h.id));
  const unmatchedGuests = (guests || []).filter((g) => !takenGuests.has(g.id));

  const proposals: MatchProposal[] = [];
  const usedHosts = new Set<string>();

  for (const guest of unmatchedGuests) {
    // Find smallest-capacity host that still fits the party (best-fit)
    const candidate = availableHosts
      .filter((h) => !usedHosts.has(h.id) && h.capacity >= guest.party_size)
      .sort((a, b) => a.capacity - b.capacity)[0];

    if (!candidate) continue;

    usedHosts.add(candidate.id);
    proposals.push({
      host_id: candidate.id,
      guest_id: guest.id,
      host_name: candidate.name,
      guest_name: guest.name,
      party_size: guest.party_size,
      capacity: candidate.capacity,
      arrival: guest.arrival_date,
      departure: guest.departure_date,
    });
  }

  return proposals;
}

/** Persist approved match proposals so they can be notified. */
export async function saveMatches(proposals: MatchProposal[]) {
  if (proposals.length === 0) return { saved: 0 };
  const rows = proposals.map((p) => ({
    host_id: p.host_id,
    guest_id: p.guest_id,
    status: 'proposed' as const,
  }));
  const { error, count } = await supabaseAdmin
    .from('matches')
    .insert(rows, { count: 'exact' });
  if (error) throw error;
  return { saved: count ?? rows.length };
}
