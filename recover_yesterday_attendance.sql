-- ============================================================================
-- RECOVER YESTERDAY'S ATTENDANCE — run in the Supabase SQL editor.
--
-- The old Save Attendance bug (fixed in admin.html) could wipe OTHER
-- students' attendance rows back to absent while you were only touching one
-- student. It never touched v2_credit_transactions though — so every class
-- deduction (which records its own attendance_date, separate from when the
-- transaction was created) is still sitting there as proof of who actually
-- attended. This rebuilds the missing attendance rows from that record.
--
-- Only INSERTs rows that are currently missing — never deletes or changes
-- anything that already exists. Safe to run more than once.
--
-- CAVEAT: demo classes are free and never get a class_deduction transaction
-- (see admin.html's deductV2CreditForAttendance comment), so a demo student
-- who attended yesterday and got wiped can't be recovered by this script —
-- check for those separately if you had any demo trials yesterday.
-- ============================================================================

-- ===== STEP 1: PREVIEW — run this first, check the names look right =====
select t.student_id, s.name, t.attendance_date::date as class_date
from public.v2_credit_transactions t
join public.students s on s.id = t.student_id
where t.type = 'class_deduction'
  and t.deleted_at is null
  and t.attendance_date::date = ((now() at time zone 'Europe/Rome')::date - 1)
  and not exists (
      select 1 from public.attendance a
      where a.studentid = t.student_id
        and a.attendancedate = t.attendance_date::date
  )
order by s.name;

-- ===== STEP 2: APPLY — once the list above looks right, run this =====
insert into public.attendance (studentid, attendancedate, ispresent, isdemo)
select distinct t.student_id, t.attendance_date::date, true, false
from public.v2_credit_transactions t
where t.type = 'class_deduction'
  and t.deleted_at is null
  and t.attendance_date::date = ((now() at time zone 'Europe/Rome')::date - 1)
  and not exists (
      select 1 from public.attendance a
      where a.studentid = t.student_id
        and a.attendancedate = t.attendance_date::date
  );
