-- ============================================================
-- MIGRATION 007: Track when coordinator was alerted about a stuck intake
-- Run this AFTER migration_006_host_email_nullable.sql
-- ============================================================
--
-- Why: when a voice intake's SMS link fails to deliver, we send a real-time
-- email alert to the coordinator. We need a flag so that retries (e.g.,
-- re-running the intake step) don't re-alert.
-- ============================================================

alter table guest_intake_sessions
  add column if not exists coordinator_alerted_at timestamptz;
