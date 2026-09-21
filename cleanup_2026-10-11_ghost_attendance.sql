-- ONE-OFF CLEANUP — run once in the Supabase SQL editor, then discard.
--
-- Leftover from the same 2026-08-26 bulk incident that created (and, two
-- minutes later, correctly soft-deleted) 61 class_deduction transactions
-- dated 2026-10-11 — see diagnose_future_dated_v2_rows.sql /
-- fix_member_ledger_excludes_deleted.sql. The credit-ledger side is already
-- resolved; this cleans up the matching attendance rows, which the earlier
-- fix never touched (deleting a v2_credit_transactions row never touches
-- attendance). Confirmed via diagnostic: all 61 rows on this date are
-- ispresent=false, isdemo=false — inert clutter, not affecting any balance
-- or report (2026-10-11 is a Sunday, not even a real class day for this
-- studio). Hard delete, no soft-delete trace, same reasoning as the
-- 2026-10-26 cleanup: a future date can never be a real class.

delete from public.attendance
where attendancedate = '2026-10-11';

-- Verify: should return zero rows.
select id, studentid, attendancedate, ispresent, isdemo
from public.attendance
where attendancedate = '2026-10-11';
