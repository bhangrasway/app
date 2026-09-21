-- DIAGNOSTIC ONLY — no changes made. Run this and paste back what it shows.
--
-- Students have reported an October class charge already sitting in their
-- passbook, even though it's currently September. This checks every table
-- involved for ANY future-dated row (not assuming which student), and shows
-- deleted_at so it's clear which rows are already refunded vs. still live.
-- Uses current_date (not a hardcoded date), so it stays useful if re-run.

-- 1. Future-dated attendance rows (any student, present or demo).
select a.id, a.studentid, s.name, a.attendancedate, a.ispresent, a.isdemo
from public.attendance a
join public.students s on s.id = a.studentid
where a.attendancedate > current_date
order by a.attendancedate, s.name;

-- 2. Future-dated v2_credit_transactions rows — INCLUDING already-deleted
-- ones, so it's visible whether a given charge is still active or was
-- already refunded (deleted_at not null) but is only still showing to the
-- student because of the passbook RPC bug (see fix_member_ledger_excludes_deleted.sql).
select t.id, t.student_id, s.name, t.type, t.amount, t.attendance_date,
       t.created_at, t.deleted_at
from public.v2_credit_transactions t
join public.students s on s.id = t.student_id
where t.attendance_date > current_date
order by t.attendance_date, s.name;

-- 3. Precautionary: future-dated recharge/adjustment rows via created_at —
-- these don't set attendance_date, so query 2 above wouldn't catch a
-- future-date slip from the Recharge modal specifically.
select t.id, t.student_id, s.name, t.type, t.amount, t.created_at, t.deleted_at
from public.v2_credit_transactions t
join public.students s on s.id = t.student_id
where t.type in ('recharge', 'adjustment')
  and t.created_at::date > current_date
order by t.created_at, s.name;
