-- ONE-OFF CLEANUP — run once in the Supabase SQL editor, then discard.
-- Corrected date (2026-10-26, not 2026-08-26) confirmed via the duplicate-
-- finder diagnostic. Same shape as the earlier (wrong-date) cleanup script:
-- hard delete, no soft-delete trace, since a future date can never be a
-- real class.

create temp table _affected_students as
    select distinct studentid as student_id from public.attendance where attendancedate = '2026-10-26'
    union
    select distinct student_id from public.v2_credit_transactions where type = 'class_deduction' and attendance_date = '2026-10-26';

delete from public.attendance
where attendancedate = '2026-10-26';

delete from public.v2_credit_transactions
where type = 'class_deduction'
  and attendance_date = '2026-10-26';

update public.students s
set v2_credit_balance = coalesce((
    select sum(t.amount) from public.v2_credit_transactions t
    where t.student_id = s.id and t.deleted_at is null
), 0)
where s.id in (select student_id from _affected_students);

drop table _affected_students;

-- Verify: should return zero rows.
select student_id, attendance_date, count(*)
from public.v2_credit_transactions
where type = 'class_deduction' and deleted_at is null
group by student_id, attendance_date
having count(*) > 1;
