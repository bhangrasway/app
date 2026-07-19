-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- Supports manually force-closing an incomplete cycle (e.g. a student going on
-- long vacation, or an admin giving someone a fresh start) without waiting for
-- the normal 4-class / 2-month auto-extension to run its course. Deliberately
-- a NEW, separate column rather than reusing paid_end_date: paid_end_date is
-- already written on every past payment as a naive "start + 1 month" value,
-- even for cycles that were actually extended further, so treating it as an
-- authoritative cycle-end would silently rewrite the timeline for every
-- already-extended cycle in the app. This column stays null unless an admin
-- explicitly force-closes a cycle, so existing behavior is unaffected.

alter table public.fees_paid
    add column if not exists closedearly date;

-- Supabase/PostgREST caches the schema; nudge it to pick up the new column
-- immediately instead of waiting for the next automatic refresh.
notify pgrst, 'reload schema';
