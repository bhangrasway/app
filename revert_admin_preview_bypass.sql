-- ============================================================================
-- REVERT ADMIN PREVIEW BYPASS — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Undoes admin_preview_bypass.sql, which added `if auth.role() =
-- 'authenticated' then return true` to _passcode_matches_student and the
-- three photo RPCs — meant to let the admin's "View as Member" button skip
-- entering a student's passcode. The real-world problem: Supabase Auth
-- sessions are stored in the browser per-origin, not per-tab, so the
-- studio's own admin browser stays "authenticated" across every tab on the
-- domain — including a normal member.html/member_v2.html tab open for
-- testing. That silently accepted ANY passcode, right or wrong, for
-- anyone testing from the admin's own browser. The "View as Member"
-- feature itself has been removed client-side too (member_v2.html no
-- longer reads a ?phone= URL param or checks auth.role() at all) — this
-- restores the matching server-side functions to their original, safe
-- definitions from member_passcode.sql / student_photos.sql, with no
-- authenticated-session escape hatch of any kind.
-- ============================================================================

create or replace function public._passcode_matches_student(p_student_id bigint, p_passcode text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_hash text;
begin
    select passcode_hash into v_hash from public.students where id = p_student_id;

    if v_hash is null then
        return true;
    end if;

    return v_hash = crypt(coalesce(p_passcode, ''), v_hash);
end;
$$;

create or replace function public.get_student_photo_status_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
    v_hash text;
    v_photo_path text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;

    select passcode_hash into v_hash from public.students where id = p_student_id;

    if v_hash is null then
        return jsonb_build_object('status', 'ok', 'has_passcode', false, 'photo_path', null);
    end if;

    if v_hash != crypt(coalesce(p_passcode, ''), v_hash) then
        return jsonb_build_object('status', 'bad_passcode', 'has_passcode', true);
    end if;

    select photo_path into v_photo_path from public.students where id = p_student_id;
    return jsonb_build_object('status', 'ok', 'has_passcode', true, 'photo_path', v_photo_path);
end;
$$;

create or replace function public.set_student_photo_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text,
    p_photo_path text
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
        return 'no_passcode';
    end if;

    if v_hash != crypt(coalesce(p_passcode, ''), v_hash) then
        return 'bad_passcode';
    end if;

    update public.students set photo_path = p_photo_path where id = p_student_id;
    return 'ok';
end;
$$;

create or replace function public.remove_student_photo_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text
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
        return 'no_passcode';
    end if;

    if v_hash != crypt(coalesce(p_passcode, ''), v_hash) then
        return 'bad_passcode';
    end if;

    update public.students set photo_path = null where id = p_student_id;
    return 'ok';
end;
$$;
