-- ============================================================
-- MIGRATION 005: Soft cancel + verification codes
-- Run this AFTER migration_004_configurable_outreach.sql
-- ============================================================

-- ---- Soft delete columns on guests + hosts ----
alter table guests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_source text
    check (cancellation_source in ('voice', 'web', 'coordinator'));

alter table hosts
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_source text
    check (cancellation_source in ('voice', 'web', 'coordinator'));

create index if not exists guests_active_idx on guests(cancelled_at) where cancelled_at is null;
create index if not exists hosts_active_idx on hosts(cancelled_at) where cancelled_at is null;

-- ---- Verification codes for web form anti-spam ----
create table if not exists verification_codes (
  id uuid primary key default uuid_generate_v4(),
  -- The thing the code is verifying. Either email or phone.
  channel text not null check (channel in ('email', 'sms')),
  destination text not null,                    -- email address, phone, or record id (for edit tokens)
  code_hash text not null,                      -- 6-digit code OR edit token, hashed
  intent text not null,                         -- 'guest_form' | 'host_signup' | 'intake_complete' | 'guest_edit' | 'host_edit'
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  consumed_at timestamptz
);

create index if not exists verification_codes_dest_idx on verification_codes(destination, intent, consumed_at);
create index if not exists verification_codes_expires_idx on verification_codes(expires_at);

alter table verification_codes enable row level security;
-- Service role bypasses; no anon access policies.
