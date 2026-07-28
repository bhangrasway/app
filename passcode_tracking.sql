-- ============================================================================
-- PASSCODE CHANGE TRACKING — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Builds on member_passcode.sql (must already be applied — it is).
--
-- Adds a timestamp recording when each student's passcode was last set or
-- changed, and an admin-only RPC to summarize it (how many members have set
-- a passcode, how many changed it recently). Members who already had a
-- passcode set before this migration runs will show passcode_changed_at as
-- null — that's "set before tracking existed", not "never set", and is
-- reported separately below rather than guessed at.
-- ============================================================================

-- ===== 1. Schema =============================================================
alter table public.students add column if not exists passcode_changed_at timestamptz;

-- ===== 2. Stamp the timestamp on every successful set/change ===============
-- Same signatures as member_passcode.sql, so create or replace is enough —
-- no drop/grant needed, PostgREST keeps routing to the same function.

create or replace function public.set_student_passcode_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    if p_passcode !~ '^\d{4}$' then
        return 'invalid_format';
    end if;

    if exists (select 1 from public.students where id = p_student_id and passcode_hash is not null) then
        return 'already_set';
    end if;

    update public.students
    set passcode_hash = crypt(p_passcode, gen_salt('bf')),
        passcode_changed_at = now()
    where id = p_student_id;

    return 'ok';
end;
$$;

create or replace function public.change_student_passcode_by_phone(
    p_student_id bigint,
    p_phone text,
    p_old_passcode text,
    p_new_passcode text
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_hash text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    select passcode_hash into v_hash from public.students where id = p_student_id;
    if v_hash is null then
        return 'no_passcode_set';
    end if;

    if v_hash != crypt(coalesce(p_old_passcode, ''), v_hash) then
        return 'bad_old_passcode';
    end if;

    if p_new_passcode !~ '^\d{4}$' then
        return 'invalid_format';
    end if;

    update public.students
    set passcode_hash = crypt(p_new_passcode, gen_salt('bf')),
        passcode_changed_at = now()
    where id = p_student_id;

    return 'ok';
end;
$$;

-- ===== 3. Admin-only stats RPC ===============================================
-- Deliberately NOT granted to anon — this reports across all students, not
-- one household, so it must only ever be callable by the logged-in admin
-- (the "authenticated" role in admin.html's Supabase Auth session).
create or replace function public.get_passcode_stats()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select jsonb_build_object(
        'total_students', count(*),
        'with_passcode', count(*) filter (where passcode_hash is not null),
        'changed_last_30_days', count(*) filter (where passcode_changed_at >= now() - interval '30 days'),
        'changed_last_90_days', count(*) filter (where passcode_changed_at >= now() - interval '90 days'),
        'set_before_tracking', count(*) filter (where passcode_hash is not null and passcode_changed_at is null)
    )
    from public.students;
$$;

revoke execute on function public.get_passcode_stats() from public, anon;
grant execute on function public.get_passcode_stats() to authenticated;
