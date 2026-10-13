-- ============================================================================
-- CASTELVETRO: its own beginner batch — run in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Castelvetro Piacentino gets ONE batch, "Principianti Castelvetro", and every
-- Castelvetro student is put in it — so no Castelvetro student sits in a
-- Cremona batch (Avanzato / Intermedio / Principianti) any more.
--
-- Batch names are unique across the whole studio (students.batch stores the
-- NAME), which is why it isn't just "Principianti": that one is Cremona's.
--
-- Day/time: Sunday 4:00-6:00 PM, inside Castelvetro's check-in window
-- (Sunday 15:45-18:15). Change it afterwards in the admin's Batches tab if the
-- real class time is different — that never touches the students.
--
-- Safe to re-run.
-- ============================================================================

-- 1. Look first: Castelvetro students and the batch they're in right now.
select s.id, s.name, s.batch
from public.students s
join public.locations l on l.id = s.location_id
where l.name = 'Castelvetro Piacentino'
order by s.name;

-- 2. Create the batch (attached to the Castelvetro location).
insert into public.batches (name, day, start_time, end_time, category, max_capacity, sort_order, active, location_id)
select 'Principianti Castelvetro', 'Sunday', '4:00 PM', '6:00 PM', 'beginner', 30, 10, true, l.id
from public.locations l
where l.name = 'Castelvetro Piacentino'
on conflict (name) do nothing;

-- 3. Put every Castelvetro student in it.
update public.students s
set batch = 'Principianti Castelvetro'
from public.locations l
where l.id = s.location_id
  and l.name = 'Castelvetro Piacentino'
  and s.batch is distinct from 'Principianti Castelvetro';

-- 4. Check: no Castelvetro student left in a batch of another location.
select s.id, s.name, s.batch, b.location_id as batch_location, s.location_id as student_location
from public.students s
left join public.batches b on b.name = s.batch
where b.location_id is distinct from s.location_id
  and s.batch is not null and s.batch <> '';
