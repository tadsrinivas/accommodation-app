import { supabaseAdmin } from './supabase';

/**
 * Compute how much capacity each host is currently using (sum of party_size
 * across non-cancelled, non-declined matches).
 *
 * Returns a Map keyed by host_id. Hosts with no active matches won't appear
 * in the map — callers should treat absence as 0.
 *
 * @param hostIds optional filter — if provided, only computes for these hosts.
 *                Useful for the matcher which has the host list already loaded.
 */
export async function getCapacityUsage(hostIds?: string[]): Promise<Map<string, number>> {
  let query = supabaseAdmin
    .from('matches')
    .select('host_id, guests!inner(party_size)')
    .neq('status', 'declined')
    .neq('status', 'cancelled');

  if (hostIds && hostIds.length > 0) {
    query = query.in('host_id', hostIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const usage = new Map<string, number>();
  for (const m of data || []) {
    const guest = Array.isArray((m as any).guests) ? (m as any).guests[0] : (m as any).guests;
    const partySize = guest?.party_size || 0;
    usage.set(m.host_id, (usage.get(m.host_id) || 0) + partySize);
  }
  return usage;
}

/**
 * Compute remaining capacity for a single host given its total capacity
 * and the current usage map.
 */
export function remainingCapacity(
  capacity: number,
  hostId: string,
  usage: Map<string, number>
): number {
  return capacity - (usage.get(hostId) || 0);
}
