-- ============================================================================
-- ONE-OFF CLEANUP — run once in the Supabase SQL editor, then discard.
--
-- Removes today's (2026-08-26) attendance testing entirely — nothing about
-- this date was a real class. Hard-deletes (not soft-delete) so nothing
-- lingers anywhere, on either admin.html or member.html: no attendance row,
-- no class_deduction transaction, no "Deleted" audit trace. Balances are
-- then recomputed from what's left, restoring exactly the amount each
-- affected student had before today's test.
--
-- Scope is deliberately narrow: only attendance rows dated 2026-08-26, and
-- only v2_credit_transactions rows of type 'class_deduction' dated
-- 2026-08-26. Any real recharge/adjustment made today is untouched.
-- ============================================================================

-- Capture who's affected BEFORE deleting anything below — once the rows are
-- gone, there'd be nothing left to look up for the final balance recompute.
create temp table _affected_students as
    select distinct studentid as student_id from public.attendance where attendancedate = '2026-08-26'
    union
    select distinct student_id from public.v2_credit_transactions where type = 'class_deduction' and attendance_date = '2026-08-26';

delete from public.attendance
where attendancedate = '2026-08-26';

delete from public.v2_credit_transactions
where type = 'class_deduction'
  and attendance_date = '2026-08-26';

update public.students s
set v2_credit_balance = coalesce((
    select sum(t.amount) from public.v2_credit_transactions t
    where t.student_id = s.id and t.deleted_at is null
), 0)
where s.id in (select student_id from _affected_students);

drop table _affected_students;
