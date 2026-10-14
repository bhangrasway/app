-- ============================================================================
-- SECURITY FIX — Supabase warning "Table publicly accessible"
-- (rls_disabled_in_public). Run in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- public.locations was created with Row-Level Security OFF
-- (multi_location_setup.sql) and never locked down afterwards, so anyone
-- with the project URL + the public anon key (which is in the website's
-- code) could edit or delete the sedi.
--
-- After this:
--   - everyone can still READ locations (member.html's check-in needs the
--     sede's position and hours),
--   - only the logged-in admin can ADD / CHANGE them (admin.html),
--   - nobody can delete them through the public key.
-- Safe to re-run.
-- ============================================================================

alter table public.locations enable row level security;

drop policy if exists "public_read" on public.locations;
create policy "public_read" on public.locations
    for select to anon, authenticated using (true);

drop policy if exists "authenticated_all" on public.locations;
create policy "authenticated_all" on public.locations
    for all to authenticated using (true) with check (true);

revoke insert, update, delete, truncate on public.locations from anon;
grant select on public.locations to anon;

-- ============================================================================
-- CHECK: any OTHER table still without Row-Level Security?
-- This should return NO rows. If it lists a table, send the name to fix it too.
-- ============================================================================
select tablename as table_without_rls
from pg_tables
where schemaname = 'public' and rowsecurity = false
order by tablename;
