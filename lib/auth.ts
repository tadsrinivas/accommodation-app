import { NextRequest } from 'next/server';

/**
 * Minimal auth for coordinator API routes.
 * Checks a bearer token against COORDINATOR_PASSWORD.
 * For stronger security, swap in Supabase Auth.
 */
export function requireCoordinator(req: NextRequest): { ok: boolean; error?: string } {
  const password = process.env.COORDINATOR_PASSWORD;
  if (!password) return { ok: false, error: 'COORDINATOR_PASSWORD not set' };

  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (token !== password) return { ok: false, error: 'Unauthorized' };
  return { ok: true };
}
