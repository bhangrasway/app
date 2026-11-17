-- ============================================================================
-- COMPETITION rule change 2026-11-17 — run once in the Supabase SQL editor,
-- AFTER the other competition*.sql files. Safe to re-run.
--
-- 1. Song length, the same for every category (A and B):
--      solo  2:30 to 3:30 (150 - 210 s)    group  4:00 to 5:00 (240 - 300 s)
-- 2. Registration has three independent ticks: Solo, Group, Extra activity
--    (non-competitive). One fee for the person, however many are ticked.
--      comp_entries.do_solo / do_group / do_activity
--      comp_entries.activity_paid  ('paid' | 'unpaid' | null): admin's own note
--      for people who only do the extra activity (the app does not charge them)
-- 3. Members register with register_competition_v2_by_phone.
-- 4. Group registration closes on comp_events.reg_close (20 Nov, teams lock 21 Nov).
--    Solo and extra activity can still be registered until settings.solo_close
--    (1 Dec 2026). After the group close, a person's Group tick can no longer change.
-- ============================================================================

-- ===== 1. song length ======================================================
create or replace function public._comp_song_range(p_event public.comp_events, p_category text, p_kind text)
returns numeric[]
language sql
stable
as $$
    select case when p_kind = 'solo' then array[150, 210]::numeric[] else array[240, 300]::numeric[] end;
$$;

-- ===== 2. the three ticks ==================================================
alter table public.comp_entries add column if not exists do_solo boolean not null default false;
alter table public.comp_entries add column if not exists do_group boolean not null default false;
alter table public.comp_entries add column if not exists do_activity boolean not null default false;
alter table public.comp_entries add column if not exists activity_paid text;
alter table public.comp_entries drop constraint if exists comp_entries_activity_paid_check;
alter table public.comp_entries add constraint comp_entries_activity_paid_check
    check (activity_paid is null or activity_paid in ('paid', 'unpaid'));

-- Entries made before this change: «compete» = solo + group, «kids_show» = extra activity.
update public.comp_entries set do_solo = true, do_group = true
where kind = 'compete' and not do_solo and not do_group and not do_activity;
update public.comp_entries set do_activity = true
where kind = 'kids_show' and not do_solo and not do_group and not do_activity;

-- ===== 3. member registration ==============================================
-- Solo / extra activity stay open until settings.solo_close, group closes earlier.
update public.comp_events
set settings = coalesce(settings, '{}'::jsonb) || '{"solo_close": "2026-12-01"}'::jsonb
where title = 'Bhangra Competition 2027' and not (coalesce(settings, '{}'::jsonb) ? 'solo_close');

-- Returns {status:'ok'|'closed'|'none'|'nothing_ticked'|'bad_phone'|'bad_passcode'}
create or replace function public.register_competition_v2_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text,
    p_solo boolean,
    p_group boolean,
    p_activity boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_existing public.comp_entries;
    v_solo_close date;
    v_group_open boolean;
    v_group boolean;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;
    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return jsonb_build_object('status', 'bad_passcode');
    end if;

    select * into v_event from public.comp_events
    where status <> 'finished' order by created_at desc limit 1;
    if not found then
        return jsonb_build_object('status', 'none');
    end if;
    v_solo_close := coalesce((v_event.settings ->> 'solo_close')::date, v_event.reg_close);
    v_group_open := v_event.status = 'registration' and (v_event.reg_close is null or current_date <= v_event.reg_close);

    if v_group_open then
        v_group := coalesce(p_group, false);
    else
        -- group is closed: only solo / extra activity, until solo_close; the group tick stays as it was
        if v_event.status not in ('registration', 'locked') or v_solo_close is null or current_date > v_solo_close then
            return jsonb_build_object('status', 'closed');
        end if;
        select * into v_existing from public.comp_entries where event_id = v_event.id and student_id = p_student_id;
        v_group := coalesce(v_existing.do_group and not v_existing.withdrawn, false);
    end if;

    if not (coalesce(p_solo, false) or v_group or coalesce(p_activity, false)) then
        return jsonb_build_object('status', 'nothing_ticked');
    end if;

    insert into public.comp_entries (event_id, student_id, kind, do_solo, do_group, do_activity)
    values (v_event.id, p_student_id,
            case when coalesce(p_solo, false) or v_group then 'compete' else 'kids_show' end,
            coalesce(p_solo, false), v_group, coalesce(p_activity, false))
    on conflict (event_id, student_id)
    do update set
        kind = excluded.kind,
        do_solo = excluded.do_solo, do_group = excluded.do_group, do_activity = excluded.do_activity,
        withdrawn = false;

    return jsonb_build_object('status', 'ok');
end;
$$;
grant execute on function public.register_competition_v2_by_phone(bigint, text, text, boolean, boolean, boolean) to anon;

-- ===== 4. song upload: needs the matching tick; length rule above =========
create or replace function public.set_my_comp_song_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text,
    p_kind text,
    p_path text,
    p_seconds numeric,
    p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_entry public.comp_entries;
    v_range numeric[];
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;
    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return jsonb_build_object('status', 'bad_passcode');
    end if;
    if p_kind not in ('solo', 'group') or p_path is null or p_path not like 'songs/%' then
        return jsonb_build_object('status', 'bad_kind');
    end if;

    select * into v_event from public.comp_events
    where status <> 'finished' order by created_at desc limit 1;
    if not found then
        return jsonb_build_object('status', 'none');
    end if;
    if v_event.status in ('live', 'finished') then
        return jsonb_build_object('status', 'closed');
    end if;

    select * into v_entry from public.comp_entries
    where event_id = v_event.id and student_id = p_student_id and not withdrawn
      and ((p_kind = 'solo' and do_solo) or (p_kind = 'group' and do_group));
    if not found then
        return jsonb_build_object('status', 'not_registered');
    end if;

    v_range := public._comp_song_range(v_event, v_entry.category, p_kind);
    if p_seconds is null or p_seconds < v_range[1] or p_seconds > v_range[2] then
        return jsonb_build_object('status', 'bad_length', 'min', v_range[1], 'max', v_range[2]);
    end if;

    if p_kind = 'solo' then
        update public.comp_entries
        set solo_song_path = p_path, solo_song_seconds = p_seconds, solo_song_name = left(p_name, 120)
        where id = v_entry.id;
    else
        if v_entry.team_id is null or v_event.status = 'registration' then
            return jsonb_build_object('status', 'no_team');
        end if;
        update public.comp_teams
        set group_song_path = p_path, group_song_seconds = p_seconds, group_song_name = left(p_name, 120), group_song_by = p_student_id
        where id = v_entry.team_id;
    end if;
    return jsonb_build_object('status', 'ok');
end;
$$;
grant execute on function public.set_my_comp_song_by_phone(bigint, text, text, text, text, numeric, text) to anon;

-- ===== 5. what the member sees =============================================
create or replace function public.get_my_competition_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_entry public.comp_entries;
    v_team  public.comp_teams;
    v_by    text;
    v_solo_close date;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;
    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return jsonb_build_object('status', 'bad_passcode');
    end if;

    select * into v_event from public.comp_events
    where status <> 'finished' order by created_at desc limit 1;
    if not found then
        return jsonb_build_object('status', 'none');
    end if;
    v_solo_close := coalesce((v_event.settings ->> 'solo_close')::date, v_event.reg_close);

    select * into v_entry from public.comp_entries
    where event_id = v_event.id and student_id = p_student_id;
    if found and v_entry.do_group and v_entry.team_id is not null and v_event.status <> 'registration' then
        select * into v_team from public.comp_teams where id = v_entry.team_id;
        select split_part(trim(name), ' ', 1) into v_by from public.students where id = v_team.group_song_by;
    end if;

    return jsonb_build_object(
        'status', 'ok',
        'event', jsonb_build_object(
            'id', v_event.id, 'title', v_event.title, 'status', v_event.status,
            'reg_close', v_event.reg_close, 'fee', v_event.fee,
            'can_register', v_event.status = 'registration'
                and (v_event.reg_close is null or current_date <= v_event.reg_close),
            'can_register_solo', v_event.status in ('registration', 'locked')
                and (v_solo_close is null or current_date <= v_solo_close),
            'solo_close', v_solo_close,
            'songs_open', v_event.status in ('registration', 'locked')),
        'entry', case when v_entry.id is null or v_entry.withdrawn then null else jsonb_build_object(
            'kind', v_entry.kind, 'category', v_entry.category,
            'do_solo', v_entry.do_solo, 'do_group', v_entry.do_group, 'do_activity', v_entry.do_activity,
            'do_volunteer', v_entry.do_volunteer, 'volunteer_roles', to_jsonb(v_entry.volunteer_roles),
            'fee_charged', v_entry.fee_tx_id is not null,
            'solo_song', v_entry.solo_song_path is not null,
            'solo_song_name', v_entry.solo_song_name,
            'solo_song_seconds', v_entry.solo_song_seconds,
            'solo_range', to_jsonb(public._comp_song_range(v_event, v_entry.category, 'solo'))) end,
        'team', case when v_team.id is null or v_entry.withdrawn then null else jsonb_build_object(
            'name', v_team.name, 'category', v_team.category,
            'group_song', v_team.group_song_path is not null,
            'group_song_name', v_team.group_song_name,
            'group_song_seconds', v_team.group_song_seconds,
            'group_song_by', v_by,
            'group_range', to_jsonb(public._comp_song_range(v_event, v_team.category, 'group')),
            'teammates', coalesce((
                select jsonb_agg(split_part(trim(s.name), ' ', 1) order by s.name)
                from public.comp_entries e join public.students s on s.id = e.student_id
                where e.team_id = v_team.id and not e.withdrawn and e.do_group and e.student_id <> p_student_id
            ), '[]'::jsonb)) end
    );
end;
$$;
grant execute on function public.get_my_competition_by_phone(bigint, text, text) to anon;

-- ===== 6. no special awards: the solo is scored on 4 points (no costume) =====
-- A judge's "Call next participant" needs energy, technique, rhythm and expression for a solo.
-- (The group still scores sync, formations, energy, technique and costume.)
create or replace function public.comp_judge_save(p_role text, p_pin text, p_slot_id bigint, p_criteria jsonb, p_submitted boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_judge integer;
    v_live  public.comp_live;
    v_slot  public.comp_slots;
    v_gate  text;
    v_need  text[];
    k text; v numeric;
begin
    v_event := public._comp_current_event();
    if v_event.id is null then
        return jsonb_build_object('status', 'bad_pin');
    end if;
    v_judge := case p_role when 'judge1' then 1 when 'judge2' then 2 when 'judge3' then 3 else null end;
    if v_judge is null then
        return jsonb_build_object('status', 'bad_pin');
    end if;
    v_gate := public._comp_pin_gate(v_event.id, p_role, p_pin);
    if v_gate <> 'ok' then
        return jsonb_build_object('status', v_gate);
    end if;
    select * into v_live from public.comp_live where event_id = v_event.id;
    if v_live.current_slot_id is distinct from p_slot_id then
        return jsonb_build_object('status', 'locked');      -- admin already pressed Next
    end if;
    select * into v_slot from public.comp_slots where id = p_slot_id;
    if v_slot.kind = 'solo' then
        v_need := array['energy', 'technique', 'rhythm', 'expression'];   -- no costume in the solo any more
    elsif v_slot.kind = 'group' then
        v_need := array['sync', 'formations', 'energy', 'technique', 'costume'];
    else
        return jsonb_build_object('status', 'no_scores');   -- break / kids show
    end if;
    for k, v in select key, value::numeric from jsonb_each_text(p_criteria) loop
        if not (k = any(v_need)) or v < 1 or v > 10 or (v * 2) <> floor(v * 2) then
            return jsonb_build_object('status', 'bad_score');
        end if;
    end loop;
    if p_submitted and exists (select 1 from unnest(v_need) c where not (p_criteria ? c)) then
        return jsonb_build_object('status', 'incomplete');
    end if;
    insert into public.comp_scores (event_id, slot_id, judge, criteria, submitted, updated_at)
    values (v_event.id, p_slot_id, v_judge, p_criteria, coalesce(p_submitted, false), now())
    on conflict (slot_id, judge) do update
        set criteria = excluded.criteria, submitted = excluded.submitted, updated_at = now();
    return jsonb_build_object('status', 'ok');
end;
$$;
grant execute on function public.comp_judge_save(text, text, bigint, jsonb, boolean) to anon;

-- ===== 7. volunteers ======================================================
-- A fourth tick: Volunteer, with exactly ONE job: backstage, music, stage (on stage) or mic (on the mic).
-- A person who only volunteers is not a participant: no fee, no trophy; they get a volunteer
-- certificate and the volunteers' special prize.
alter table public.comp_entries add column if not exists do_volunteer boolean not null default false;
alter table public.comp_entries add column if not exists volunteer_roles text[] not null default '{}';

-- Returns {status:'ok'|'closed'|'none'|'nothing_ticked'|'pick_role'|'bad_phone'|'bad_passcode'}
create or replace function public.register_competition_v3_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text,
    p_solo boolean,
    p_group boolean,
    p_activity boolean,
    p_volunteer boolean,
    p_roles text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_existing public.comp_entries;
    v_solo_close date;
    v_group_open boolean;
    v_group boolean;
    v_roles text[] := coalesce(p_roles, '{}');
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return jsonb_build_object('status', 'bad_phone');
    end if;
    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return jsonb_build_object('status', 'bad_passcode');
    end if;

    select * into v_event from public.comp_events
    where status <> 'finished' order by created_at desc limit 1;
    if not found then
        return jsonb_build_object('status', 'none');
    end if;
    v_solo_close := coalesce((v_event.settings ->> 'solo_close')::date, v_event.reg_close);
    v_group_open := v_event.status = 'registration' and (v_event.reg_close is null or current_date <= v_event.reg_close);

    if v_group_open then
        v_group := coalesce(p_group, false);
    else
        if v_event.status not in ('registration', 'locked') or v_solo_close is null or current_date > v_solo_close then
            return jsonb_build_object('status', 'closed');
        end if;
        select * into v_existing from public.comp_entries where event_id = v_event.id and student_id = p_student_id;
        v_group := coalesce(v_existing.do_group and not v_existing.withdrawn, false);
    end if;

    if coalesce(p_volunteer, false) then
        if cardinality(v_roles) <> 1 or not (v_roles <@ array['backstage', 'music', 'stage', 'mic']) then
            return jsonb_build_object('status', 'pick_role');
        end if;
    else
        v_roles := '{}';
    end if;

    if not (coalesce(p_solo, false) or v_group or coalesce(p_activity, false) or coalesce(p_volunteer, false)) then
        return jsonb_build_object('status', 'nothing_ticked');
    end if;

    insert into public.comp_entries (event_id, student_id, kind, do_solo, do_group, do_activity, do_volunteer, volunteer_roles)
    values (v_event.id, p_student_id,
            case when coalesce(p_solo, false) or v_group then 'compete' else 'kids_show' end,
            coalesce(p_solo, false), v_group, coalesce(p_activity, false), coalesce(p_volunteer, false), v_roles)
    on conflict (event_id, student_id)
    do update set
        kind = excluded.kind,
        do_solo = excluded.do_solo, do_group = excluded.do_group, do_activity = excluded.do_activity,
        do_volunteer = excluded.do_volunteer, volunteer_roles = excluded.volunteer_roles,
        withdrawn = false;

    return jsonb_build_object('status', 'ok');
end;
$$;
grant execute on function public.register_competition_v3_by_phone(bigint, text, text, boolean, boolean, boolean, boolean, text[]) to anon;
