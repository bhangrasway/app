-- ============================================================================
-- PHONE-ONLY IDENTIFICATION — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Builds on security_lockdown.sql (which must already be applied — it is).
--
-- Before this migration, the public pages identified students by NAME:
-- anyone could open checkin.html / report.html and browse the full member
-- list through the students_public view, then confirm with a PIN that was
-- just the last 4 digits of the phone on file.
--
-- After this migration, no member name is public anywhere:
--   * A member types their FULL phone number; matching happens inside the
--     database and returns only the member(s) registered under that number
--     (siblings often share a parent's phone, hence "members" plural — the
--     page then shows a picker containing only that family).
--   * The phone number itself is the credential: every action RPC re-verifies
--     student id + phone together, so a leaked/guessed id alone does nothing.
--   * The students_public view and the old PIN-based RPCs are dropped.
--
-- Designed so a date-of-birth second factor can be added later: collect DOBs,
-- add a date_of_birth column, and extend _phone_matches_student to also
-- compare p_dob — the page flow stays the same.
--
-- IMPORTANT: run this in the same sitting as deploying the new
-- checkin.html / report.html — the currently deployed pages use the old
-- name-list + PIN path, which stops existing the moment this runs.
-- ============================================================================

-- ===== 1. Phone normalization helpers (not callable from outside) ===========
-- Numbers get stored and typed in every format ("+39 333 123 4567",
-- "3331234567", "0039..."): strip to digits and compare the LAST 9 digits,
-- which covers Italian mobiles (10 digits) with or without country code and
-- is still far too large a space to guess (a wrong number just says
-- "not found"). Stored numbers with fewer than 9 digits can never match —
-- same "ask your instructor" outcome as the old no_phone case.
create or replace function public._phone_digits(p text)
returns text
language sql
immutable
as $$
    select regexp_replace(coalesce(p, ''), '\D', '', 'g')
$$;

revoke execute on function public._phone_digits(text) from public, anon;

-- Returns true only when p_phone matches the phone on file for p_student_id.
create or replace function public._phone_matches_student(p_student_id bigint, p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_entered text := public._phone_digits(p_phone);
    v_stored  text;
begin
    if length(v_entered) < 9 then
        return false;
    end if;

    select public._phone_digits(phone) into v_stored
    from public.students
    where id = p_student_id;

    if not found or length(v_stored) < 9 then
        return false;
    end if;

    return right(v_stored, 9) = right(v_entered, 9);
end;
$$;

revoke execute on function public._phone_matches_student(bigint, text) from public, anon;

-- ===== 2. RPC: who is registered under this phone number? ===================
-- Returns: {status:'invalid'} (fewer than 9 digits typed)
--        | {status:'not_found'}
--        | {status:'ok', members:[{id, name}, ...]}  — only the members on
--          this exact number, i.e. the caller's own household.
create or replace function public.find_members_by_phone(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_entered text := public._phone_digits(p_phone);
    v_members jsonb;
begin
    if length(v_entered) < 9 then
        return jsonb_build_object('status', 'invalid');
    end if;

    select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
    into v_members
    from public.students s
    where length(public._phone_digits(s.phone)) >= 9
      and right(public._phone_digits(s.phone), 9) = right(v_entered, 9);

    if v_members is null then
        return jsonb_build_object('status', 'not_found');
    end if;

    return jsonb_build_object('status', 'ok', 'members', v_members);
end;
$$;

grant execute on function public.find_members_by_phone(text) to anon;

-- ===== 3. RPC: self check-in (phone-verified) ================================
-- Same behavior as the old checkin_self, with the phone number as the
-- credential instead of a PIN: enforces the check-in window and records
-- today's attendance server-side using the studio's local date (Europe/Rome).
-- Returns: 'checked_in' | 'already' | 'bad_phone' | 'closed'
create or replace function public.checkin_self_by_phone(p_student_id bigint, p_phone text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_settings public.checkin_settings%rowtype;
    v_now_rome timestamp := (now() at time zone 'Europe/Rome');
    v_today    date      := (now() at time zone 'Europe/Rome')::date;
    v_existing public.attendance%rowtype;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
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

grant execute on function public.checkin_self_by_phone(bigint, text) to anon;

-- ===== 4. RPC: "notify my instructor" (phone-verified) ======================
-- Unlike the old PIN version there is no "delivered but flagged" path: a
-- student only ever reaches this RPC after find_members_by_phone matched
-- them, so an unverifiable phone is an error, not a soft pass. A member whose
-- number on file is wrong/missing simply asks the instructor in person (the
-- check-in window only opens during class hours anyway). Duplicate pending
-- requests from the same day are still collapsed so nobody can spam.
-- Returns: 'sent' | 'already' | 'bad_phone'
create or replace function public.request_manual_checkin_by_phone(
    p_student_id bigint,
    p_phone text,
    p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_today  date := (now() at time zone 'Europe/Rome')::date;
    v_name   text;
    v_reason text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    v_reason := left(coalesce(nullif(trim(p_reason), ''), 'Check-in issue'), 120);

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

grant execute on function public.request_manual_checkin_by_phone(bigint, text, text) to anon;

-- ===== 5. RPC: self-service report data (phone-verified) =====================
-- Same payload as the old get_student_report — profile fields the report
-- needs (never the phone), attendance rows, payment rows — behind the phone
-- check instead of the PIN check.
create or replace function public.get_student_report_by_phone(p_student_id bigint, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
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

grant execute on function public.get_student_report_by_phone(bigint, text) to anon;

-- ===== 6. Remove the public name list and the old PIN path ==================
-- This is the actual privacy fix: after this, the anon role has NO way to
-- enumerate member names — not via a table, not via a view, not via an RPC
-- (find_members_by_phone requires already knowing a member's phone number).
drop view if exists public.students_public;
drop function if exists public.checkin_self(bigint, text);
drop function if exists public.request_manual_checkin(bigint, text, text);
drop function if exists public.get_student_report(bigint, text);
drop function if exists public._verify_student_pin(bigint, text);
