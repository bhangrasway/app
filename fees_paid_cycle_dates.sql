-- Run this once in the Supabase SQL editor (Project -> SQL Editor -> New query).
-- fees_paid has never had columns to record a payment's cycle start/end date,
-- so insertFeesPaidWithSchemaFallback (admin.html) has always silently dropped
-- them and fallen back to attaching payments to whichever cycle the trust-based
-- membership engine (membership.js) reaches first, instead of the cycle the
-- payment was actually recorded for. Column names match the app's "compact"
-- insert variant (studentid/ispaid/paiddate convention, no underscores) so the
-- very first insert attempt succeeds without ever needing to fall back.

alter table public.fees_paid
    add column if not exists paidstartdate date,
    add column if not exists paidenddate date;

-- Supabase/PostgREST caches the schema; nudge it to pick up the new columns
-- immediately instead of waiting for the next automatic refresh.
notify pgrst, 'reload schema';
