-- ============================================================
-- MIGRATION 008: Add host_type column to hosts
-- Run this AFTER migration_007_coordinator_alerts.sql
-- ============================================================
--
-- host_type distinguishes residence hosts (volunteers offering their homes)
-- from hotel hosts (commercial partners). Residence hosts go through the
-- reconfirmation outreach flow; hotels do not. Both can be matched with guests.
--
-- The column is NOT exposed through public signup forms — every public
-- signup defaults to 'residence'. Only coordinators can change a host
-- to 'hotel' via the admin edit modal.
-- ============================================================

alter table hosts
  add column if not exists host_type text not null default 'residence'
    check (host_type in ('residence', 'hotel'));

-- Index helps the outreach scheduler filter quickly.
create index if not exists hosts_residence_active_idx on hosts(id)
  where host_type = 'residence' and cancelled_at is null;
