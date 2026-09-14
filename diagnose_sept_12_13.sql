-- DIAGNOSTIC ONLY — no changes made. Run this and paste back what it shows.
-- Checking both the 12th (the real class date) and 13th (where the recovery
-- script accidentally landed it) in both tables.

select id, studentid, attendancedate, ispresent, isdemo
from public.attendance
where attendancedate in ('2026-09-12', '2026-09-13')
order by attendancedate, studentid;

select id, student_id, type, amount, attendance_date, deleted_at, created_at
from public.v2_credit_transactions
where attendance_date in ('2026-09-12', '2026-09-13')
order by attendance_date, student_id;
