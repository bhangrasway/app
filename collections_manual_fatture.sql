-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Fatture added by hand (e.g. 1/26–10/26) have no payment in the app, so
-- their Cash/Bonifico is stored on the fattura itself. Used only by
-- Income & Expense → Collections (cash on hand / bank). Never written in the
-- fattura XML or PDF.

alter table public.fatture add column if not exists payment_method text;
alter table public.fatture drop constraint if exists fatture_payment_method_check;
alter table public.fatture add constraint fatture_payment_method_check
    check (payment_method is null or payment_method in ('cash', 'bonifico'));
