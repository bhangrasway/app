-- ============================================================================
-- V2 CUSTOM CLASS RATE — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Lets specific students (e.g. family) pay a different flat per-class rate
-- than the standard €10. null = standard rate; a number = that student's
-- real per-class charge. Set from admin.html's Student View modal.
-- ============================================================================

alter table public.students add column if not exists per_class_rate numeric;

-- A rate of 0 or below is never a valid charge — "this class is free" is
-- already a separate, per-class action (the Free Class / demo flow), not a
-- permanent rate. Guarding here keeps bad data out at the source.
alter table public.students drop constraint if exists students_per_class_rate_positive;
alter table public.students add constraint students_per_class_rate_positive
    check (per_class_rate is null or per_class_rate > 0);
