-- ============================================================================
-- ADMIN: "Add a new device" codes — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run). Safe to re-run.
--
-- A new phone/browser must be verified once before the admin opens there
-- (after the password). Besides the emailed link, an already-trusted device can
-- show a 6-digit code (Security -> «Add a new device»), valid 10 minutes and
-- usable once; typing it on the new device verifies it. Needed for the iPhone
-- home-screen app, where the emailed link can't land (it opens in Safari).
-- ============================================================================

create table if not exists public.admin_device_codes (
    code text primary key,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
alter table public.admin_device_codes enable row level security;
drop policy if exists "authenticated_insert" on public.admin_device_codes;
create policy "authenticated_insert" on public.admin_device_codes for insert to authenticated with check (true);
revoke all on public.admin_device_codes from anon;

-- Checks and uses up a code (one time only). Logged-in admin only.
create or replace function public.consume_admin_device_code(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_found boolean;
begin
    delete from public.admin_device_codes where expires_at < now();
    delete from public.admin_device_codes where code = p_code and expires_at >= now();
    get diagnostics v_found = row_count;
    return v_found;
end;
$$;
revoke all on function public.consume_admin_device_code(text) from public, anon;
grant execute on function public.consume_admin_device_code(text) to authenticated;
