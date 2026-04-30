-- ============================================================
-- MIGRATION 006: Allow hosts.email to be null
-- Run this AFTER migration_005_cancel_and_verify.sql
-- ============================================================
--
-- Why: imported hosts (from spreadsheets, prior-year data) may not have
-- an email on file. The system contacts them via phone/SMS only and
-- captures email later through manual coordinator action.
--
-- Note: this only affects the database constraint. The public signup
-- form and guest form still validate email as required at the API
-- layer, so user-submitted records always have email.
--
-- Guests table is intentionally NOT changed — guest records always
-- come from forms that require email.
-- ============================================================

alter table hosts alter column email drop not null;

-- Add an index for the audit queries that filter on missing email
create index if not exists hosts_no_email_idx
  on hosts(id)
  where (email is null or email = '');
