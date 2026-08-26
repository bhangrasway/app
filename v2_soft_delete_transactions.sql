-- ============================================================================
-- V2 SOFT-DELETE TRANSACTIONS — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Deleting a recharge/adjustment (admin.html's Student View modal) or
-- refunding a class (unmarking attendance) used to hard-delete the row from
-- v2_credit_transactions, leaving no trace. This adds a deleted_at column so
-- admin.html can instead mark rows deleted and keep showing them — struck
-- through, labeled "Deleted" — in both the Transaction History card and each
-- student's Transaction Ledger, without counting them in any balance or
-- income total. A null deleted_at is a normal, active row; every existing
-- row is unaffected (stays null, i.e. active) by this migration.
-- ============================================================================

alter table public.v2_credit_transactions add column if not exists deleted_at timestamptz;
