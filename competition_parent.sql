-- ===== Parent name on the Anchor screen and at the Door =====
-- Run once in the Supabase SQL editor (after competition_coupons.sql). Safe to run again.
--
--   * comp_screen_state: the performers get "parent" and "age" ONLY when the role is 'anchor'
--     (the person who calls the dancers). Judges, sound and the projector never get them.
--   * comp_door_coupon: the answer also carries the parent name of the student who invited the guest,
--     so the door can see "this guest is the parent of ...".
-- The Control screen (admin login) reads the students table directly, no change needed there.

create or replace function public.comp_screen_state(p_role text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_judge integer;
    v_gate  text;
begin
    v_event := public._comp_current_event();
    if v_event.id is null then
        return jsonb_build_object('status', 'none');
    end if;
    v_gate := public._comp_pin_gate(v_event.id, p_role, p_pin);
    if v_gate <> 'ok' then
        return jsonb_build_object('status', v_gate);
    end if;
    v_judge := case p_role when 'judge1' then 1 when 'judge2' then 2 when 'judge3' then 3 else null end;

    return jsonb_build_object(
        'status', 'ok',
        'now', now(),
        'event', jsonb_build_object('id', v_event.id, 'title', v_event.title, 'status', v_event.status, 'settings', v_event.settings),
        'judge_name', (select judge_name from public.comp_pins where event_id = v_event.id and role = p_role),
        'live', (select to_jsonb(l) - 'event_id' from public.comp_live l where l.event_id = v_event.id),
        'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category,
                    'song_path', t.group_song_path, 'song_seconds', t.group_song_seconds) order by t.sort_order)
                 from public.comp_teams t where t.event_id = v_event.id), '[]'::jsonb),
        'slots', coalesce((select jsonb_agg(jsonb_build_object(
                    'id', sl.id, 'position', sl.position, 'code', sl.code, 'category', sl.category, 'kind', sl.kind,
                    'status', sl.status, 'label', sl.label, 'minutes', sl.minutes, 'team_id', coalesce(sl.team_id, e.team_id),
                    'name', s.name,
                    'parent', case when p_role = 'anchor' then s.parentname else null end,
                    'age', case when p_role = 'anchor' then s.age else null end,
                    'song_path', case when sl.kind = 'solo' then e.solo_song_path else t.group_song_path end,
                    'song_seconds', case when sl.kind = 'solo' then e.solo_song_seconds else t.group_song_seconds end
                 ) order by sl.position)
                 from public.comp_slots sl
                 left join public.comp_entries e on e.id = sl.entry_id
                 left join public.students s on s.id = e.student_id
                 left join public.comp_teams t on t.id = sl.team_id
                 where sl.event_id = v_event.id), '[]'::jsonb),
        'my_scores', case when v_judge is null then null else coalesce((
                 select jsonb_object_agg(sc.slot_id::text, sc.criteria)
                 from public.comp_scores sc where sc.event_id = v_event.id and sc.judge = v_judge), '{}'::jsonb) end,
        'my_submitted', case when v_judge is null then null else coalesce((
                 select jsonb_agg(sc.slot_id)
                 from public.comp_scores sc where sc.event_id = v_event.id and sc.judge = v_judge and sc.submitted), '[]'::jsonb) end
    );
end;
$$;
grant execute on function public.comp_screen_state(text, text) to anon;

create or replace function public.comp_door_coupon(p_pin text, p_code text, p_use boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_gate text;
    v_c public.comp_coupons;
    v_student text;
    v_parent text;
begin
    v_event := public._comp_current_event();
    if v_event.id is null then
        return jsonb_build_object('status', 'bad_pin');
    end if;
    v_gate := public._comp_pin_gate(v_event.id, 'staff', p_pin);
    if v_gate <> 'ok' then
        return jsonb_build_object('status', v_gate);
    end if;
    select * into v_c from public.comp_coupons where event_id = v_event.id and code = upper(trim(coalesce(p_code, '')));
    if not found then
        return jsonb_build_object('status', 'not_found');
    end if;
    select name, parentname into v_student, v_parent from public.students where id = v_c.student_id;
    if v_c.used_at is not null then
        return jsonb_build_object('status', 'used', 'guest', v_c.guest_name, 'student', v_student, 'parent', v_parent, 'used_at', v_c.used_at);
    end if;
    if coalesce(p_use, false) then
        update public.comp_coupons set used_at = now() where id = v_c.id;
        insert into public.comp_live (event_id) values (v_event.id) on conflict (event_id) do nothing;
        update public.comp_live set door_coupons = door_coupons + 1, updated_at = now() where event_id = v_event.id;
        return jsonb_build_object('status', 'ok', 'let_in', true, 'guest', v_c.guest_name, 'student', v_student, 'parent', v_parent);
    end if;
    return jsonb_build_object('status', 'ok', 'let_in', false, 'guest', v_c.guest_name, 'student', v_student, 'parent', v_parent);
end;
$$;
grant execute on function public.comp_door_coupon(text, text, boolean) to anon;
