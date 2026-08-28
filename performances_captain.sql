-- ============================================================================
-- PERFORMANCE CAPTAIN — run once in the Supabase SQL editor.
--
-- Adds a single "captain" per performance (performance_signups.is_captain) —
-- admin.html sets this via the gold star on the Roster card. The captain can
-- then open member.html on their own phone and drag/save choreography
-- positions for that performance, without needing admin.html access.
--
-- Same trust model as the rest of performances.sql/member_passcode.sql:
-- performance_movements/performance_positions have no anon table policy
-- (they hold names and stage positions), so the captain's read and write
-- both go through phone+passcode-verified security-definer RPCs that also
-- re-check is_captain server-side on every call — a leaked/guessed student
-- id + phone still can't touch these tables unless that student is actually
-- the captain admin.html assigned.
-- ============================================================================

-- ===== 1. Schema ============================================================
alter table public.performance_signups add column if not exists is_captain boolean not null default false;

-- Belt-and-suspenders alongside admin.html's own "clear the old captain
-- first" logic: guarantees at most one captain per performance even if two
-- admin sessions race.
create unique index if not exists performance_signups_one_captain_per_performance
    on public.performance_signups (performance_id)
    where is_captain;

-- ===== 2. Captain-check helper (not callable from outside) =================
create or replace function public._student_is_captain(p_student_id bigint, p_performance_id bigint)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.performance_signups
        where performance_id = p_performance_id and student_id = p_student_id and is_captain
    );
$$;

revoke execute on function public._student_is_captain(bigint, bigint) from public, anon;

-- ===== 3. RPC: captain's read — movements, roster, and every dancer's =====
-- current position for this performance. (get_my_spot_by_phone stays as-is
-- for regular dancers — it only ever returns the caller's own spot; this is
-- the captain-only, full-roster equivalent.)
-- Returns status: 'bad_phone' | 'bad_passcode' | 'not_captain' | 'ok'
create or replace function public.get_captain_workspace_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text,
    p_performance_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return jsonb_build_object('status', 'bad_passcode');
    end if;

    if not public._student_is_captain(p_student_id, p_performance_id) then
        return jsonb_build_object('status', 'not_captain');
    end if;

    return jsonb_build_object(
        'status', 'ok',
        'movements', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', m.id, 'movement_order', m.movement_order, 'label', m.label
            ) order by m.movement_order)
            from public.performance_movements m
            where m.performance_id = p_performance_id
        ), '[]'::jsonb),
        'roster', coalesce((
            select jsonb_agg(jsonb_build_object(
                'student_id', sg.student_id, 'student_name', sg.student_name,
                'team', sg.team, 'dress_color', sg.dress_color, 'gender', st.gender
            ) order by sg.student_name)
            from public.performance_signups sg
            join public.students st on st.id = sg.student_id
            where sg.performance_id = p_performance_id and sg.roster_status <> 'spare'
        ), '[]'::jsonb),
        'positions', coalesce((
            select jsonb_agg(jsonb_build_object(
                'movement_id', p.movement_id, 'student_id', p.student_id, 'x', p.x, 'y', p.y
            ))
            from public.performance_positions p
            join public.performance_movements m on m.id = p.movement_id
            where m.performance_id = p_performance_id
        ), '[]'::jsonb)
    );
end;
$$;

grant execute on function public.get_captain_workspace_by_phone(bigint, text, text, bigint) to anon;

-- ===== 4. RPC: captain's write — save one dancer's position ================
-- Returns: 'ok' | 'bad_phone' | 'bad_passcode' | 'not_captain' | 'invalid'
create or replace function public.save_performance_position_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text,
    p_performance_id bigint,
    p_movement_id bigint,
    p_target_student_id bigint,
    p_x numeric,
    p_y numeric
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return 'bad_passcode';
    end if;

    if not public._student_is_captain(p_student_id, p_performance_id) then
        return 'not_captain';
    end if;

    if not exists (
        select 1 from public.performance_movements
        where id = p_movement_id and performance_id = p_performance_id
    ) then
        return 'invalid';
    end if;

    if not exists (
        select 1 from public.performance_signups
        where performance_id = p_performance_id and student_id = p_target_student_id
    ) then
        return 'invalid';
    end if;

    insert into public.performance_positions (movement_id, student_id, x, y)
    values (p_movement_id, p_target_student_id, p_x, p_y)
    on conflict (movement_id, student_id) do update set x = excluded.x, y = excluded.y;

    return 'ok';
end;
$$;

grant execute on function public.save_performance_position_by_phone(bigint, text, text, bigint, bigint, bigint, numeric, numeric) to anon;
