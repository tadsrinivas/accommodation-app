import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client-side / public use (respects RLS)
export const supabase = createClient(url, anonKey);

// Server-side admin use (bypasses RLS — NEVER expose this to the browser)
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
