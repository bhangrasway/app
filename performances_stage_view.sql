-- ============================================================================
-- PERFORMANCE STAGE VIEW (read-only, all joined members) — run once in the
-- Supabase SQL editor.
--
-- get_my_spot_by_phone only ever returns the caller's OWN spot for the
-- latest movement (phone_privacy.sql's whole point — no dancer's page lists
-- everyone else's name/position). get_captain_workspace_by_phone returns
-- the full roster/positions but is gated to the one starred captain.
--
-- This adds a THIRD tier: any dancer who has actually joined the performance
-- can call this to watch the full show — every formation, everyone's
-- position, the song itself — read-only. No write RPC exists for this tier;
-- only save_performance_position_by_phone (captain-gated) can ever change a
-- position.
-- ============================================================================

-- Returns status: 'bad_phone' | 'bad_passcode' | 'not_joined' | 'ok'
create or replace function public.get_performance_stage_view_by_phone(
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

    if not exists (
        select 1 from public.performance_signups
        where performance_id = p_performance_id and student_id = p_student_id
    ) then
        return jsonb_build_object('status', 'not_joined');
    end if;

    return jsonb_build_object(
        'status', 'ok',
        'song_url', (select song_url from public.performances where id = p_performance_id),
        'movements', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', m.id, 'movement_order', m.movement_order, 'label', m.label, 'start_seconds', m.start_seconds
            ) order by m.movement_order)
            from public.performance_movements m
            where m.performance_id = p_performance_id
        ), '[]'::jsonb),
        'comments', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', c.id, 'timestamp_seconds', c.timestamp_seconds, 'text', c.text
            ) order by c.timestamp_seconds)
            from public.performance_comments c
            where c.performance_id = p_performance_id
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

grant execute on function public.get_performance_stage_view_by_phone(bigint, text, text, bigint) to anon;

-- ===== My performances list (title/date/status + my own dress color) =====
-- Powers member.html's Perform tab list — every performance this student
-- has joined, so they can see at a glance what to wear and pick which one
-- to open (their spot, or the full read-only stage view above), instead of
-- only ever seeing whichever single call happens to be open right now.
create or replace function public.get_my_performances_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null
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

    return jsonb_build_object(
        'status', 'ok',
        'performances', coalesce((
            select jsonb_agg(jsonb_build_object(
                'id', perf.id, 'title', perf.title, 'event_date', perf.event_date, 'status', perf.status,
                'roster_status', sg.roster_status, 'team', sg.team, 'dress_color', sg.dress_color
            ) order by perf.event_date desc nulls last, perf.created_at desc)
            from public.performance_signups sg
            join public.performances perf on perf.id = sg.performance_id
            where sg.student_id = p_student_id
        ), '[]'::jsonb)
    );
end;
$$;

grant execute on function public.get_my_performances_by_phone(bigint, text, text) to anon;

-- ===== get_my_spot_by_phone gains an optional p_performance_id =====
-- Previously always "whichever performance I joined most recently" — now
-- the member.html list can ask for a SPECIFIC performance's spot instead
-- (p_performance_id null keeps the old "most recent" behavior, so nothing
-- that already calls the 3-arg form breaks).
drop function if exists public.get_my_spot_by_phone(bigint, text, text);

-- Returns status: 'bad_phone' | 'bad_passcode' | 'not_joined' | 'no_movements' | 'ok'
create or replace function public.get_my_spot_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null,
    p_performance_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_signup   public.performance_signups%rowtype;
    v_movement public.performance_movements%rowtype;
    v_pos      public.performance_positions%rowtype;
    v_row_band text;
    v_col_band text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return jsonb_build_object('status', 'bad_passcode');
    end if;

    select * into v_signup
    from public.performance_signups
    where student_id = p_student_id
      and (p_performance_id is null or performance_id = p_performance_id)
    order by joined_at desc
    limit 1;

    if not found then
        return jsonb_build_object('status', 'not_joined');
    end if;

    select * into v_movement
    from public.performance_movements
    where performance_id = v_signup.performance_id
    order by movement_order desc
    limit 1;

    if not found then
        return jsonb_build_object('status', 'no_movements');
    end if;

    select * into v_pos
    from public.performance_positions
    where movement_id = v_movement.id and student_id = p_student_id;

    if not found then
        return jsonb_build_object('status', 'no_movements');
    end if;

    v_row_band := case
        when v_pos.y < 33 then 'Front row'
        when v_pos.y < 66 then 'Middle row'
        else 'Back row'
    end;
    v_col_band := case
        when v_pos.x < 40 then 'left side'
        when v_pos.x > 60 then 'right side'
        else 'center'
    end;

    return jsonb_build_object(
        'status', 'ok',
        'dress_color', v_signup.dress_color,
        'movement_label', coalesce(v_movement.label, 'Movement ' || v_movement.movement_order),
        'position_text', v_row_band || ', ' || v_col_band
    );
end;
$$;

grant execute on function public.get_my_spot_by_phone(bigint, text, text, bigint) to anon;
