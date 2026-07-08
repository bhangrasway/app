-- ============================================================================
-- SECURITY LOCKDOWN — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Before this migration, RLS was disabled on every table, so the anon key
-- embedded in the public pages (checkin.html / report.html) could read and
-- write EVERYTHING — including every student's full phone number, which is
-- also the PIN the public pages verify against, client-side.
--
-- After this migration:
--   * The logged-in admin dashboard (index.html, Supabase Auth session,
--     "authenticated" role) keeps full access to every table — unchanged.
--   * The anon role (public pages) can only:
--       - read checkin_settings          (to show the check-in window)
--       - read the students_public view  (id / name / parent — NO phone)
--       - call the three RPCs below, which verify the PIN *inside* the
--         database, so phone numbers never leave the server.
--
-- IMPORTANT: run this in the same sitting as deploying the new
-- checkin.html / report.html — the old public pages stop working the
-- moment this runs (they read tables the anon role can no longer see).
-- ============================================================================

-- ===== 1. Enable RLS everywhere ============================================
alter table public.students          enable row level security;
alter table public.attendance        enable row level security;
alter table public.fees_paid         enable row level security;
alter table public.expenses          enable row level security;
alter table public.tax_records       enable row level security;
alter table public.checkin_requests  enable row level security;
alter table public.checkin_settings  enable row level security;

-- ===== 2. Admin (authenticated role): full access, same as before ==========
drop policy if exists "authenticated_all" on public.students;
create policy "authenticated_all" on public.students
    for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.attendance;
create policy "authenticated_all" on public.attendance
    for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.fees_paid;
create policy "authenticated_all" on public.fees_paid
    for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.expenses;
create policy "authenticated_all" on public.expenses
    for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.tax_records;
create policy "authenticated_all" on public.tax_records
    for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.checkin_requests;
create policy "authenticated_all" on public.checkin_requests
    for all to authenticated using (true) with check (true);

drop policy if exists "authenticated_all" on public.checkin_settings;
create policy "authenticated_all" on public.checkin_settings
    for all to authenticated using (true) with check (true);

-- ===== 3. Public pages (anon role) =========================================
-- checkin_settings stays readable so checkin.html can show "open Sat & Sun,
-- 1:15 PM - 7:00 PM" — it contains nothing sensitive. Everything else is
-- closed to anon: RLS with no anon policy denies, and we also revoke the
-- default table grants as defense in depth.
drop policy if exists "anon_read_checkin_settings" on public.checkin_settings;
create policy "anon_read_checkin_settings" on public.checkin_settings
    for select to anon using (true);

revoke all on public.students         from anon;
revoke all on public.attendance       from anon;
revoke all on public.fees_paid        from anon;
revoke all on public.expenses         from anon;
revoke all on public.tax_records      from anon;
revoke all on public.checkin_requests from anon;

-- ===== 4. Public student picker (NO phone numbers) =========================
-- The public pages need a name list for their search box. This view runs
-- with the owner's rights (security_invoker off = default), so anon can read
-- it even though the base table is closed. has_pin tells the page whether a
-- PIN check is even possible for that student.
create or replace view public.students_public as
select
    id,
    name,
    parentname,
    length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 4 as has_pin
from public.students;

grant select on public.students_public to anon, authenticated;

-- ===== 5. Server-side PIN helper (not callable from outside) ===============
-- Returns: 'ok' | 'bad_pin' | 'no_phone' | 'no_student'
create or replace function public._verify_student_pin(p_student_id bigint, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_digits text;
begin
    select regexp_replace(coalesce(phone, ''), '\D', '', 'g')
    into v_digits
    from public.students
    where id = p_student_id;

    if not found then
        return 'no_student';
    end if;
    if length(v_digits) < 4 then
        return 'no_phone';
    end if;
    if right(v_digits, 4) <> coalesce(p_pin, '') then
        return 'bad_pin';
    end if;
    return 'ok';
end;
$$;

revoke execute on function public._verify_student_pin(bigint, text) from public, anon;

-- ===== 6. RPC: self check-in ================================================
-- Verifies the PIN, enforces the check-in window, and records today's
-- attendance — all server-side, using the studio's local date
-- (Europe/Rome), which also fixes the old client-side UTC date bug.
-- Returns: 'checked_in' | 'already' | 'bad_pin' | 'no_phone' | 'no_student'
--        | 'closed'
create or replace function public.checkin_self(p_student_id bigint, p_pin text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_pin_status text;
    v_settings   public.checkin_settings%rowtype;
    v_now_rome   timestamp := (now() at time zone 'Europe/Rome');
    v_today      date      := (now() at time zone 'Europe/Rome')::date;
    v_existing   public.attendance%rowtype;
begin
    v_pin_status := public._verify_student_pin(p_student_id, p_pin);
    if v_pin_status <> 'ok' then
        return v_pin_status;
    end if;

    select * into v_settings from public.checkin_settings where id = 1;
    if not found
       or not (extract(dow from v_now_rome)::smallint = any (v_settings.active_days))
       or v_now_rome::time < v_settings.start_time
       or v_now_rome::time > v_settings.end_time then
        return 'closed';
    end if;

    select * into v_existing
    from public.attendance
    where studentid = p_student_id and attendancedate = v_today
    limit 1;

    if found then
        if v_existing.ispresent then
            return 'already';
        end if;
        update public.attendance
        set ispresent = true
        where id = v_existing.id;
        return 'checked_in';
    end if;

    insert into public.attendance (studentid, attendancedate, ispresent, isdemo)
    values (p_student_id, v_today, true, false);
    return 'checked_in';
end;
$$;

grant execute on function public.checkin_self(bigint, text) to anon;

-- ===== 7. RPC: "notify my instructor" (manual check-in request) ============
-- These requests are always reviewed by a human (the instructor taps "Mark
-- Present" per name), so a wrong or unverifiable PIN doesn't block the
-- request — it just gets flagged "(PIN not verified)" on the instructor's
-- list. This keeps the page's "Trouble with your PIN?" escape hatch working
-- (e.g. a student whose phone number changed). Duplicate pending requests
-- from the same day are collapsed so nobody can spam the instructor.
-- Returns: 'sent' | 'already' | 'no_student'
create or replace function public.request_manual_checkin(
    p_student_id bigint,
    p_pin text,
    p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_pin_status text;
    v_today      date := (now() at time zone 'Europe/Rome')::date;
    v_name       text;
    v_reason     text;
begin
    v_pin_status := public._verify_student_pin(p_student_id, p_pin);
    if v_pin_status = 'no_student' then
        return 'no_student';
    end if;

    v_reason := left(coalesce(nullif(trim(p_reason), ''), 'Check-in issue'), 120);
    if v_pin_status <> 'ok' then
        v_reason := v_reason || ' (PIN not verified)';
    end if;

    select name into v_name from public.students where id = p_student_id;

    if exists (
        select 1 from public.attendance
        where studentid = p_student_id and attendancedate = v_today and ispresent
    ) then
        return 'already';
    end if;

    if exists (
        select 1 from public.checkin_requests
        where student_id = p_student_id
          and status = 'pending'
          and requested_at >= v_today
    ) then
        return 'sent'; -- already queued today, don't spam the instructor
    end if;

    insert into public.checkin_requests (student_id, student_name, reason)
    values (p_student_id, v_name, v_reason);
    return 'sent';
end;
$$;

grant execute on function public.request_manual_checkin(bigint, text, text) to anon;

-- ===== 8. RPC: self-service report data =====================================
-- After a successful PIN check, returns ONLY this student's data (and never
-- the phone number): profile fields the report needs, their attendance rows,
-- and their payment rows. report.html does the membership math client-side
-- with the same shared engine as the admin dashboard.
create or replace function public.get_student_report(p_student_id bigint, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_pin_status text;
begin
    v_pin_status := public._verify_student_pin(p_student_id, p_pin);
    if v_pin_status <> 'ok' then
        return jsonb_build_object('status', v_pin_status);
    end if;

    return jsonb_build_object(
        'status', 'ok',
        'student', (
            select jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'parentname', s.parentname,
                'joindate', s.joindate,
                'nextpaymentdate', s.nextpaymentdate,
                'monthlyfees', s.monthlyfees
            )
            from public.students s
            where s.id = p_student_id
        ),
        'attendance', coalesce((
            select jsonb_agg(jsonb_build_object(
                'studentid', a.studentid,
                'attendancedate', a.attendancedate,
                'ispresent', a.ispresent,
                'isdemo', a.isdemo
            ) order by a.attendancedate)
            from public.attendance a
            where a.studentid = p_student_id
        ), '[]'::jsonb),
        'fees', coalesce((
            select jsonb_agg(to_jsonb(f) order by f.id)
            from public.fees_paid f
            where f.studentid = p_student_id
        ), '[]'::jsonb)
    );
end;
$$;

grant execute on function public.get_student_report(bigint, text) to anon;

-- ===== 9. Storage: tax PDFs are admin-only ==================================
-- As of 2026-07-08 the anon key could LIST (and read) the 'tax-pdfs' bucket —
-- tax receipts and doctor certificates are sensitive, so this section makes
-- storage admin-only: it drops every storage.objects policy that grants
-- anything to the anon role, adds a full-access policy for the logged-in
-- admin, and flips the bucket private in case it was marked public.
do $$
declare
    pol record;
begin
    for pol in
        select policyname
        from pg_policies
        where schemaname = 'storage'
          and tablename = 'objects'
          and (roles @> array['anon']::name[] or roles @> array['public']::name[])
    loop
        execute format('drop policy %I on storage.objects', pol.policyname);
    end loop;
end $$;

drop policy if exists "tax_pdfs_authenticated_all" on storage.objects;
create policy "tax_pdfs_authenticated_all" on storage.objects
    for all to authenticated
    using (bucket_id = 'tax-pdfs') with check (bucket_id = 'tax-pdfs');

update storage.buckets set public = false where id = 'tax-pdfs';
