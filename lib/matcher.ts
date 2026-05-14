import { supabaseAdmin } from './supabase';
import { getCapacityUsage } from './capacity';

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
 * Greedy matcher with multi-guest support.
 *
 * Rules:
 *   - Host must have confirmed_available = true, approved, uncancelled
 *   - Host must have REMAINING capacity >= guest party_size
 *     (capacity - sum of party_size of already-matched guests)
 *   - Larger parties get matched first (they're hardest to place)
 *   - Best-fit: among hosts that fit, pick the one with smallest *remaining*
 *     capacity (minimizes leftover space waste)
 *
 * Within a single batch run, the matcher decrements an in-memory copy of
 * remaining capacity as it allocates, so two guests can land at the same
 * host if capacity allows.
 *
 * Returns proposals without persisting. Coordinator reviews and approves.
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

  // Guests already in a non-declined match are excluded (a guest belongs to
  // exactly one host). Host capacity_usage is computed separately so a single
  // host can still appear in the candidate pool with remaining capacity.
  const { data: existing } = await supabaseAdmin
    .from('matches')
    .select('guest_id')
    .neq('status', 'declined')
    .neq('status', 'cancelled');

  const takenGuests = new Set((existing || []).map((m) => m.guest_id));
  const unmatchedGuests = (guests || []).filter((g) => !takenGuests.has(g.id));

  // Compute used capacity per host from the DB, then we'll decrement an
  // in-memory copy as we allocate within this batch.
  const hostIds = (hosts || []).map((h) => h.id);
  const dbUsage = await getCapacityUsage(hostIds);
  const remaining = new Map<string, number>();
  for (const h of hosts || []) {
    remaining.set(h.id, h.capacity - (dbUsage.get(h.id) || 0));
  }

  const proposals: MatchProposal[] = [];

  for (const guest of unmatchedGuests) {
    // Best-fit among hosts whose remaining capacity fits this party
    const candidate = (hosts || [])
      .filter((h) => (remaining.get(h.id) || 0) >= guest.party_size)
      .sort((a, b) => (remaining.get(a.id) || 0) - (remaining.get(b.id) || 0))[0];

    if (!candidate) continue;

    // Decrement the in-memory remaining so future iterations see the update
    remaining.set(candidate.id, (remaining.get(candidate.id) || 0) - guest.party_size);

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
