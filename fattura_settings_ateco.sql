-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- ATECO code of the activity (e.g. 85.52.01), typed in the fattura Settings.
-- Shown in the header of the exports for offices next to the tax regime
-- («Regime forfettario · ATECO 85.52.01»). Not used in the fattura XML.

alter table public.fattura_settings add column if not exists codice_ateco text;
