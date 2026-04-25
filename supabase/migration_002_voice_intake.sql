-- ============================================================
-- MIGRATION 002: Voice intake sessions for guests
-- Run this AFTER migration_001_outreach.sql
-- ============================================================

create table if not exists guest_intake_sessions (
  id uuid primary key default uuid_generate_v4(),
  call_sid text unique,                        -- Twilio CallSid (in-progress identifier)
  caller_phone text,                           -- captured from call metadata
  confirm_token uuid not null default uuid_generate_v4() unique,

  -- Captured during the call (may be partial if caller hung up)
  name text,
  name_raw text,                               -- raw STT output before any cleanup
  arrival_date date,
  departure_date date,
  party_size integer,

  -- State machine: which step the caller is on
  step text not null default 'started' check (step in (
    'started',
    'collecting_name',
    'confirming_name',
    'collecting_arrival',
    'collecting_departure',
    'collecting_party_size',
    'sms_sent',
    'completed',                                -- form submitted, materialized into guests
    'expired',
    'abandoned'
  )),

  -- Audit
  sms_sent_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  call_started_at timestamptz not null default now(),
  call_ended_at timestamptz,

  -- Link back once materialized
  guest_id uuid references guests(id) on delete set null
);

create index if not exists guest_intake_sessions_token_idx on guest_intake_sessions(confirm_token);
create index if not exists guest_intake_sessions_call_idx on guest_intake_sessions(call_sid);

-- RLS: API routes use service role and bypass this. No direct anon access.
alter table guest_intake_sessions enable row level security;
