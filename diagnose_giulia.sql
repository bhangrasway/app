-- DIAGNOSTIC ONLY — no changes made. Run this and paste back what it shows.

select id, name from public.students where name ilike '%Giulia Ferrari%';

-- Replace <ID> below with the id from the row above.
select id, studentid, attendancedate, ispresent, isdemo
from public.attendance
where studentid = <ID>
order by attendancedate;

select id, student_id, type, amount, attendance_date, created_at, deleted_at
from public.v2_credit_transactions
where student_id = <ID>
order by created_at;
