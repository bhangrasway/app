-- ============================================================================
-- BATCHES: back to 3 Saturday-only batches — run ONCE in the Supabase SQL
-- editor (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Builds on batches_and_requests.sql (must already be applied).
--
-- The studio ran 5 Sat/Sun batches for a while; this merges them back down to
-- three back-to-back Saturday batches:
--
--   Avanzato 1 + Avanzato 2                       -> Avanzato      Sat 1:30-3:30 PM
--   Intermedio                                    -> Intermedio    Sat 3:30-5:30 PM
--   Principianti (primo + secondo livello)        -> Principianti  Sat 5:30-7:30 PM
--
-- Also sets every batch's capacity to max 30, no minimum.
--
-- students.batch stores the batch NAME (existing pattern), so students on a
-- merged-away batch are moved onto the surviving one first — nobody is left
-- pointing at a batch that no longer exists.
--
-- NOT cleanly re-runnable: once the rows are renamed, step 3 matches nothing
-- (harmless), but re-running from a half-applied state could hit the
-- batches.name unique constraint. Run it once, top to bottom.
-- ============================================================================

-- 1. Move students off the two Advance batches onto the single merged one.
update public.students
set batch = 'Avanzato'
where batch in ('Avanzato 1', 'Avanzato 2');

-- 2. Same for the two Beginner batches.
update public.students
set batch = 'Principianti'
where batch in ('Principianti (primo livello)', 'Principianti (secondo livello)');

-- 3. Reshape the three surviving rows: new name, Saturday, new time slot,
--    ordered 1/2/3, active.
update public.batches
set name = 'Avanzato', day = 'Saturday',
    start_time = '1:30 PM', end_time = '3:30 PM',
    sort_order = 1, active = true
where name = 'Avanzato 1';

update public.batches
set day = 'Saturday',
    start_time = '3:30 PM', end_time = '5:30 PM',
    sort_order = 2, active = true
where name = 'Intermedio';

update public.batches
set name = 'Principianti', day = 'Saturday',
    start_time = '5:30 PM', end_time = '7:30 PM',
    sort_order = 3, active = true
where name = 'Principianti (primo livello)';

-- 4. Drop the two now-empty batches.
delete from public.batches
where name in ('Avanzato 2', 'Principianti (secondo livello)');

-- 5. Capacity: cap each batch at 30, with no minimum (removes the
--    "under capacity" warning entirely).
alter table public.batches alter column min_capacity drop not null;
update public.batches set max_capacity = 30, min_capacity = null;

-- 6. Any pending "move me to batch X" request that now points at a batch that
--    no longer exists is stale — dismiss it (same effect as
--    request_batch_change_by_phone replacing a superseded request).
update public.batch_change_requests
set status = 'dismissed', resolved_at = now()
where status = 'pending'
  and requested_batch not in (select name from public.batches where active);

-- 7. Self check-in window: classes are Saturday-only now, last one ends 7:30 PM.
--    Saturday only (JS getDay 6), 1:15 PM - 7:45 PM.
update public.checkin_settings
set active_days = '{6}', start_time = '13:15:00', end_time = '19:45:00', updated_at = now()
where id = 1;
