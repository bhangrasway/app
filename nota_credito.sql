-- ============================================================================
-- NOTA DI CREDITO (TD04) — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run). Safe to re-run.
--
-- An accepted fattura can't be changed or deleted at AdE: a wrong name or
-- amount is corrected with a nota di credito for the full amount, then a new
-- correct fattura. The nota di credito is a row of its own in fatture and
-- counts as minus in every total. It has its own numbering, as on the AdE
-- site (fattura 1/26, nota di credito 1/26, fattura 2/26): the unique number
-- is per year AND type.
--
--  tipo_documento             'TD01' fattura | 'TD04' nota di credito
--  collegata_id               on the nota di credito: the fattura it cancels
--  annullata_da               on the cancelled fattura: its nota di credito
--  orig_transaction_id,       on the cancelled fattura: the payment(s) it was
--  orig_extra_transaction_ids linked to. They are released (transaction_id
--                             empty) so the new fattura can take them.
--
-- The member portal shows only accepted fatture with a published PDF: the
-- cancelled fattura's PDF is removed and a nota di credito is never published,
-- so students see only the new correct fattura. No function changes needed.
-- ============================================================================

alter table public.fatture add column if not exists tipo_documento text not null default 'TD01';
alter table public.fatture drop constraint if exists fatture_tipo_documento_check;
alter table public.fatture add constraint fatture_tipo_documento_check
    check (tipo_documento in ('TD01', 'TD04'));
alter table public.fatture add column if not exists collegata_id bigint references public.fatture(id);
alter table public.fatture add column if not exists annullata_da bigint references public.fatture(id);
alter table public.fatture add column if not exists orig_transaction_id bigint;
alter table public.fatture add column if not exists orig_extra_transaction_ids bigint[] not null default '{}';

drop index if exists public.fatture_anno_numero_active;
create unique index if not exists fatture_anno_tipo_numero_active
    on public.fatture (anno, tipo_documento, numero) where deleted_at is null;
