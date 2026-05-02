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
    .eq('confirmed_available', true)
    .eq('approval_status', 'approved')
    .is('cancelled_at', null);

  if (hostErr) throw hostErr;

  const { data: guests, error: guestErr } = await supabaseAdmin
    .from('guests')
    .select('id, name, party_size, arrival_date, departure_date')
    .is('cancelled_at', null)
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

  // Resolve host_type for each proposed host. Hotel hosts skip the manual
  // accept step — the coordinator has already arranged the booking out-of-band,
  // so we mark host_response='accepted' at save time. The guest still
  // accepts/declines normally, and contacts_exchanged fires when both sides
  // are accepted (which for hotels means as soon as the guest accepts).
  const hostIds = Array.from(new Set(proposals.map((p) => p.host_id)));
  const { data: hostMeta } = await supabaseAdmin
    .from('hosts')
    .select('id, host_type')
    .in('id', hostIds);
  const hostTypeMap = new Map<string, string>();
  for (const h of hostMeta || []) {
    hostTypeMap.set(h.id, h.host_type);
  }

  const now = new Date().toISOString();
  const rows = proposals.map((p) => {
    const isHotel = hostTypeMap.get(p.host_id) === 'hotel';
    return {
      host_id: p.host_id,
      guest_id: p.guest_id,
      status: 'proposed' as const,
      // Hotel hosts are pre-accepted on the coordinator's behalf
      host_response: isHotel ? 'accepted' : null,
      host_responded_at: isHotel ? now : null,
    };
  });

  const { error, count } = await supabaseAdmin
    .from('matches')
    .insert(rows, { count: 'exact' });
  if (error) throw error;
  return { saved: count ?? rows.length };
}
