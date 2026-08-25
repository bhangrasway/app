-- ============================================================================
-- STUDENT PROFILE PHOTOS — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Builds on member_passcode.sql (must already be applied).
--
-- Lets the admin set a student's photo from the registration/edit form, and
-- lets the student set their own from member.html — but ONLY after a real
-- passcode is verified. This is the one deliberate exception in the app:
-- every other member RPC auto-passes a student who never set a passcode
-- (_passcode_matches_student returns true when passcode_hash is null); the
-- photo RPCs below check passcode_hash IS NOT NULL first and refuse outright
-- if it's missing, rather than trusting phone-alone access.
-- ============================================================================

-- ===== 1. Schema =============================================================
alter table public.students add column if not exists photo_path text;

-- ===== 2. Storage: public bucket, unguessable random-token path convention ===
-- Same rationale as member_documents.sql — member.html has no real Supabase
-- Auth session, so a DB function can't hand out a signed URL into a private
-- bucket. A photo isn't as sensitive as a medical certificate, but it's still
-- passcode-gated by policy (see the RPCs below), so the path itself stays
-- unguessable too, as defense in depth.
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "student_photos_authenticated_all" on storage.objects;
create policy "student_photos_authenticated_all" on storage.objects
    for all to authenticated
    using (bucket_id = 'student-photos') with check (bucket_id = 'student-photos');

-- anon (member.html) can upload their own photo directly with the anon key —
-- insert only, no read/list/update/delete, so a student can never browse or
-- overwrite another student's photo blob. "Remove" just clears photo_path
-- via the RPC below rather than deleting the blob (same soft-delete spirit
-- as the medical certificate — the old file is orphaned, not reachable
-- without its token, and there's no anon list/select policy to find it).
drop policy if exists "student_photos_anon_insert" on storage.objects;
create policy "student_photos_anon_insert" on storage.objects
    for insert to anon
    with check (bucket_id = 'student-photos');

-- ===== 3. RPC: photo status (strict passcode gate) ===========================
-- Returns {has_passcode, photo_path}. has_passcode:false means there is
-- nothing to enter yet — the caller should prompt to SET a passcode, not
-- enter one. photo_path is only ever returned once a real passcode matches.
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

grant execute on function public.get_student_photo_status_by_phone(bigint, text, text) to anon;

-- ===== 4. RPC: set the student's own photo (strict passcode gate) ===========
-- Returns: 'ok' | 'bad_phone' | 'no_passcode' | 'bad_passcode'
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

grant execute on function public.set_student_photo_by_phone(bigint, text, text, text) to anon;

-- ===== 5. RPC: remove the student's own photo (strict passcode gate) ========
-- Only clears photo_path — the old blob in storage is left orphaned (see
-- note in section 2), never hard-deleted.
-- Returns: 'ok' | 'bad_phone' | 'no_passcode' | 'bad_passcode'
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

grant execute on function public.remove_student_photo_by_phone(bigint, text, text) to anon;
