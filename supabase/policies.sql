-- Run this AFTER schema.sql
-- Row-level security: the anon key is used by the browser, so we lock it down.
-- All writes happen via API routes that use the service_role key server-side.

alter table hosts enable row level security;
alter table guests enable row level security;
alter table matches enable row level security;
alter table notifications enable row level security;

-- Default: deny everything for anon role.
-- Our API routes use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.

-- The ONLY thing anon clients need to do is:
--   1. Insert into guests (public guest form)
--   2. Read their own host record via confirm_token (host confirmation page)
--   3. Read their own match record via confirm_token

-- Allow public INSERT on guests (the guest form is public)
create policy "anon can insert guests"
  on guests for insert
  to anon
  with check (true);

-- Note: Host confirmation and match confirmation pages call API routes
-- (not Supabase directly) so no anon SELECT policies are needed.
-- This is the safest approach — no data is readable from the browser directly.
