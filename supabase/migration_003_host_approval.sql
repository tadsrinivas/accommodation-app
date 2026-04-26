-- ============================================================
-- MIGRATION 003: Host approval workflow (public signup)
-- Run this AFTER migration_002_voice_intake.sql
-- ============================================================

alter table hosts
  add column if not exists approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists source text not null default 'imported'
    check (source in ('imported', 'signup', 'manual')),
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists rejection_note text;

-- Existing rows (from Excel import) default to approved + imported.
-- New rows from public signup will default to pending + signup.

create index if not exists hosts_approval_idx on hosts(approval_status);
