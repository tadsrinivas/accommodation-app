-- Run this in Supabase SQL Editor
-- This creates all tables for the accommodation coordinator app

-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- ============================================================
-- HOSTS: people offering accommodation
-- ============================================================
create table if not exists hosts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  phone text,
  capacity integer not null default 1,       -- max guests they can host
  address text,
  notes text,

  -- Reconfirmation state for this year
  confirm_token uuid not null default uuid_generate_v4() unique,
  reconfirm_sent_at timestamptz,
  reconfirm_attempts integer not null default 0,
  confirmed_available boolean,                -- null=no response, true=yes, false=declined
  confirmed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hosts_confirm_token_idx on hosts(confirm_token);
create index if not exists hosts_available_idx on hosts(confirmed_available);

-- ============================================================
-- GUESTS: people requesting accommodation
-- ============================================================
create table if not exists guests (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null,
  phone text,
  arrival_date date not null,
  departure_date date not null,
  party_size integer not null default 1,
  notes text,

  created_at timestamptz not null default now()
);

create index if not exists guests_dates_idx on guests(arrival_date, departure_date);

-- ============================================================
-- MATCHES: host <-> guest pairings with two-sided confirmation
-- ============================================================
create table if not exists matches (
  id uuid primary key default uuid_generate_v4(),
  host_id uuid not null references hosts(id) on delete cascade,
  guest_id uuid not null references guests(id) on delete cascade,

  -- Tokens for confirmation links
  host_confirm_token uuid not null default uuid_generate_v4() unique,
  guest_confirm_token uuid not null default uuid_generate_v4() unique,

  host_response text check (host_response in ('accepted', 'declined')),
  guest_response text check (guest_response in ('accepted', 'declined')),
  host_responded_at timestamptz,
  guest_responded_at timestamptz,

  -- Set to true once BOTH sides accept; triggers contact exchange email
  contacts_exchanged boolean not null default false,
  contacts_exchanged_at timestamptz,

  -- Coordinator workflow
  proposed_at timestamptz not null default now(),
  notifications_sent_at timestamptz,
  status text not null default 'proposed' check (status in ('proposed', 'notified', 'confirmed', 'declined', 'cancelled')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(host_id, guest_id)
);

create index if not exists matches_host_idx on matches(host_id);
create index if not exists matches_guest_idx on matches(guest_id);
create index if not exists matches_status_idx on matches(status);

-- ============================================================
-- NOTIFICATION LOG: audit trail for email/SMS sent
-- ============================================================
create table if not exists notifications (
  id uuid primary key default uuid_generate_v4(),
  recipient_type text not null check (recipient_type in ('host', 'guest')),
  recipient_id uuid not null,
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null,                     -- 'reconfirm', 'match_proposed', 'contacts_exchanged', etc.
  success boolean not null,
  error_message text,
  provider_id text,                          -- Resend/Twilio message ID
  sent_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx on notifications(recipient_type, recipient_id);

-- ============================================================
-- Auto-update updated_at timestamps
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists hosts_updated_at on hosts;
create trigger hosts_updated_at before update on hosts
  for each row execute function update_updated_at();

drop trigger if exists matches_updated_at on matches;
create trigger matches_updated_at before update on matches
  for each row execute function update_updated_at();
