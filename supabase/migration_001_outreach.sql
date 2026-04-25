-- ============================================================
-- MIGRATION: Sequential outreach (Option D)
-- Run this AFTER schema.sql + policies.sql
-- ============================================================

-- Track each channel attempt independently with timestamps + counts
alter table hosts
  add column if not exists outreach_started_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists last_attempt_channel text,           -- 'sms' | 'email' | 'voice'
  add column if not exists sms_attempts integer not null default 0,
  add column if not exists email_attempts integer not null default 0,
  add column if not exists voice_attempts integer not null default 0,
  add column if not exists outreach_stage text not null default 'pending'
    check (outreach_stage in (
      'pending',         -- not started yet
      'sent_initial',    -- Day 0: SMS + email sent
      'sent_sms_2',      -- Day 2: 2nd SMS reminder
      'sent_email_2',    -- Day 4: 2nd email reminder
      'sent_voice',      -- Day 6: voice call placed
      'manual_required', -- Day 8: all auto attempts exhausted
      'responded'        -- host has responded (yes or no)
    )),
  add column if not exists voice_call_sid text,                 -- Twilio call SID
  add column if not exists voice_call_status text,              -- queued, ringing, answered, no-answer, failed, completed
  add column if not exists voice_call_response text,            -- 'pressed_1' | 'pressed_2' | 'no_input' | null
  add column if not exists do_not_contact boolean not null default false;  -- coordinator override

-- Allow 'voice' as a notification channel
alter table notifications drop constraint if exists notifications_channel_check;
alter table notifications add constraint notifications_channel_check
  check (channel in ('email', 'sms', 'voice'));

-- Helpful index for the cron scheduler that picks who to contact next
create index if not exists hosts_outreach_idx
  on hosts(outreach_stage, last_attempt_at)
  where confirmed_available is null and do_not_contact = false;

-- When a host responds, mark outreach_stage = 'responded' so the scheduler stops
create or replace function mark_responded_on_confirm()
returns trigger as $$
begin
  if new.confirmed_available is not null and old.confirmed_available is null then
    new.outreach_stage = 'responded';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists hosts_mark_responded on hosts;
create trigger hosts_mark_responded before update on hosts
  for each row execute function mark_responded_on_confirm();
