-- ============================================================
-- MIGRATION 004: Configurable outreach sequence
-- Run this AFTER migration_003_host_approval.sql
-- ============================================================
--
-- Switch from named outreach stages to a generic numeric index that
-- references whatever channel sequence is configured via env vars.
-- The original outreach_stage column is kept for audit/history.
--
-- Index values:
--   -1  = pending (not started)
--   0+  = index into OUTREACH_CHANNEL_SEQUENCE that was last sent
--   999 = manual_required (exhausted all configured stages)
-- ============================================================

alter table hosts
  add column if not exists outreach_step integer not null default -1;

-- Backfill from existing named stages so existing data keeps working
update hosts set outreach_step =
  case outreach_stage
    when 'pending' then -1
    when 'sent_initial' then 0
    when 'sent_sms_2' then 1
    when 'sent_email_2' then 2
    when 'sent_voice' then 3
    when 'manual_required' then 999
    when 'responded' then -1   -- responded is tracked via confirmed_available, step doesn't matter
    else -1
  end
where outreach_step = -1;
