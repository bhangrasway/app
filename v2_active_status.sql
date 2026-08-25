-- ============================================================================
-- V2 ACTIVE STATUS — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Supports admin_v2.html's active/inactive student feature. No data is
-- ever deleted by this — a student's batch roster and payment history stay
-- fully intact either way, only whether they count toward batch capacity
-- and payment totals by default changes.
--
-- null   = auto-detect (inactive after 3 months with no attendance —
--          see INACTIVE_MONTHS_THRESHOLD / isStudentActive() in admin_v2.html)
-- true   = admin has manually forced this student active
-- false  = admin has manually forced this student inactive
-- ============================================================================

alter table public.students add column if not exists active_override boolean;
