-- ============================================================================
-- FATTURE: "Da fatturare" / "Fatturati" — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run), after fatture_xml.sql.
-- Safe to re-run.
--
--  * fattura_settings.invoice_from: recharges from this date on are expected
--    to get a fattura (the P.IVA start). Editable in Impostazioni fattura.
--  * fattura_skips: recharges marked «Non serve» in the Fatture tab (they
--    never get a fattura from the app, e.g. already invoiced elsewhere).
--    «Ripristina» deletes the row.
-- ============================================================================

alter table public.fattura_settings add column if not exists invoice_from date;
update public.fattura_settings set invoice_from = '2025-09-29' where invoice_from is null;

create table if not exists public.fattura_skips (
    transaction_id bigint primary key,
    created_at timestamptz not null default now()
);

alter table public.fattura_skips enable row level security;
drop policy if exists "authenticated_all" on public.fattura_skips;
create policy "authenticated_all" on public.fattura_skips for all to authenticated using (true) with check (true);
revoke all on public.fattura_skips from anon;
