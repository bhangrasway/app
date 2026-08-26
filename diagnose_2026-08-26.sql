-- DIAGNOSTIC ONLY — no changes made. Run this and paste back what it shows.

select id, student_id, type, amount, attendance_date, deleted_at, created_at
from public.v2_credit_transactions
where attendance_date::text like '2026-08-26%'
order by student_id;

select id, studentid, attendancedate, ispresent
from public.attendance
where attendancedate::text like '2026-08-26%'
order by studentid;
