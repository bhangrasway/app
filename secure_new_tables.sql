-- ============================================================================
-- SECURITY FIX — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Locks down the 4 tables added today (batches_and_requests.sql,
-- credit_system.sql, medical_certificates.sql) which were left with RLS
-- disabled, matching an OLDER convention in this repo (checkin_settings.sql)
-- that security_lockdown.sql had already moved away from for the core
-- tables (students, attendance, fees_paid, tax_records, checkin_requests).
-- These 4 reintroduced that open pattern by mistake — this file matches
-- them to the same authenticated-only model security_lockdown.sql already
-- established, without changing any table's data or columns.
--
-- Nothing in admin.html breaks: it always operates as the "authenticated"
-- role (logged in via Supabase Auth), which every policy below still grants
-- full access to, exactly as before.
-- ============================================================================

-- ===== 1. credit_transactions — financial data, admin-only ==================
alter table public.credit_transactions enable row level security;

drop policy if exists "authenticated_all" on public.credit_transactions;
create policy "authenticated_all" on public.credit_transactions
    for all to authenticated using (true) with check (true);

revoke all on public.credit_transactions from anon;

-- ===== 2. medical_certificate_submissions — admin-only ======================
-- member.html never reads/writes this table directly — submission goes
-- through submit_medical_certificate_by_phone (security definer, unaffected
-- by RLS) and status is read through get_medical_certificate_status_by_phone
-- (also security definer) — so locking this down breaks nothing on the
-- member side.
alter table public.medical_certificate_submissions enable row level security;

drop policy if exists "authenticated_all" on public.medical_certificate_submissions;
create policy "authenticated_all" on public.medical_certificate_submissions
    for all to authenticated using (true) with check (true);

revoke all on public.medical_certificate_submissions from anon;

-- ===== 3. batch_change_requests — admin-only, mirrors passcode_reset_requests
-- Writes already only ever happen through request_batch_change_by_phone
-- (security definer). member.html's own pending-status check used to read
-- this table directly as anon — that's replaced below with a phone-verified
-- RPC (get_batch_request_status_by_phone), same pattern as the medical
-- certificate status check, so the member-side "pending" display still works
-- once this table is locked down.
alter table public.batch_change_requests enable row level security;

drop policy if exists "authenticated_all" on public.batch_change_requests;
create policy "authenticated_all" on public.batch_change_requests
    for all to authenticated using (true) with check (true);

revoke all on public.batch_change_requests from anon;

create or replace function public.get_batch_request_status_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_requested_batch text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return null;
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return null;
    end if;

    select requested_batch into v_requested_batch
    from public.batch_change_requests
    where student_id = p_student_id and status = 'pending'
    limit 1;

    return v_requested_batch; -- null if no pending request
end;
$$;

grant execute on function public.get_batch_request_status_by_phone(bigint, text, text) to anon;

-- ===== 4. batches — low-sensitivity (schedule metadata only), but still =====
-- shouldn't allow anon WRITE (only the admin dashboard should edit
-- schedules). member.html/index.html need read access for the batch
-- dropdown, so this gets a public-read + authenticated-write split instead
-- of a full lockdown like the tables above.
alter table public.batches enable row level security;

drop policy if exists "authenticated_all" on public.batches;
create policy "authenticated_all" on public.batches
    for all to authenticated using (true) with check (true);

drop policy if exists "anon_read_only" on public.batches;
create policy "anon_read_only" on public.batches
    for select to anon using (true);
