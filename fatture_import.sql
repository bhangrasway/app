-- ============================================================================
-- FATTURE IMPORT — run once in the Supabase SQL editor, AFTER fatture_xml.sql
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- The Reports tab is gone; the old fatture saved there (tax_records.payments:
-- date + "Tax File No" + PDF) are imported one by one into the fatture
-- register from the Fatture tab ("Da importare dal vecchio archivio").
-- legacy_payment_id remembers which old entry each fattura came from, so an
-- entry can never be imported twice. The old tax_records data is NOT deleted.
-- Safe to re-run.
-- ============================================================================

alter table public.fatture add column if not exists legacy_payment_id text;

create unique index if not exists fatture_legacy_payment_active
    on public.fatture (legacy_payment_id) where deleted_at is null and legacy_payment_id is not null;
