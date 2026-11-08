-- ============================================================================
-- FATTURE FOR OLD PAYMENTS (before the app, 2026) — run once in the Supabase
-- SQL editor (Project -> SQL Editor -> New query -> paste -> Run). Safe to re-run.
--
-- Old payments live in fees_paid (the old system). The Fatture tab lists the
-- 2026 ones still without a fattura, suggests the hand-added fattura that
-- probably covers each one, and makes a fattura for the rest.
--
--  fatture.old_payment_keys  the old payments a fattura covers (made from them,
--                            or a hand-added one confirmed as theirs). Text keys
--                            («id:123»), whatever the type of fees_paid.id.
--  fattura_old_skips         old payments marked «Not needed».
-- Admin only, like every other money table.
-- ============================================================================

alter table public.fatture add column if not exists old_payment_keys text[] not null default '{}';

create table if not exists public.fattura_old_skips (
    payment_key text primary key,
    created_at timestamptz not null default now()
);

alter table public.fattura_old_skips enable row level security;
drop policy if exists "admin_only" on public.fattura_old_skips;
create policy "admin_only" on public.fattura_old_skips for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');
revoke all on public.fattura_old_skips from anon;
