-- ============================================================================
-- COMPETITION (phase 2 + 3: songs + competition day) — run AFTER
-- competition.sql, once, in the Supabase SQL editor. Safe to re-run.
--
--   * songs: comp_entries.solo_song_*, comp_teams.group_song_*, and the
--     "comp-songs" storage bucket (members upload; public read by random path
--     so the Sound screen can play it)
--   * comp_pins   — PIN per role: judge1, judge2, judge3, staff (sound, anchor,
--                   projector, door share the staff PIN). Admin only.
--   * comp_slots  — the running order (lottery), one row per solo / group / break
--   * comp_live   — what is happening now (current slot, timer, reveal, door counts)
--   * comp_scores — one row per judge per slot (criteria as json)
--
-- comp.html (the competition-day page) reads/writes through the PIN-checked
-- RPCs below; the Control screen is the logged-in admin and uses the tables.
-- ============================================================================

-- ===== songs ===============================================================
alter table public.comp_entries add column if not exists solo_song_path text;
alter table public.comp_entries add column if not exists solo_song_seconds numeric;
alter table public.comp_entries add column if not exists solo_song_name text;
alter table public.comp_teams add column if not exists group_song_path text;
alter table public.comp_teams add column if not exists group_song_seconds numeric;
alter table public.comp_teams add column if not exists group_song_name text;
alter table public.comp_teams add column if not exists group_song_by bigint;

insert into storage.buckets (id, name, public)
values ('comp-songs', 'comp-songs', true)
on conflict (id) do update set public = true;

drop policy if exists "comp_songs_anon_insert" on storage.objects;
create policy "comp_songs_anon_insert" on storage.objects
    for insert to anon
    with check (bucket_id = 'comp-songs');

drop policy if exists "comp_songs_admin_all" on storage.objects;
create policy "comp_songs_admin_all" on storage.objects
    for all to authenticated
    using (bucket_id = 'comp-songs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'comp-songs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

-- Allowed song length in seconds for a category + round (target ± margin).
create or replace function public._comp_song_range(p_event public.comp_events, p_category text, p_kind text)
returns numeric[]
language plpgsql
stable
as $$
declare
    v_margin numeric := coalesce((p_event.settings ->> 'margin_seconds')::numeric, 10);
    v_solo   numeric := coalesce((p_event.settings -> 'solo_minutes' ->> p_category)::numeric, case when p_category = 'A' then 2 else 1.5 end) * 60;
begin
    if p_kind = 'solo' then
        return array[v_solo - v_margin, v_solo + v_margin];
    elsif p_category = 'A' then
        return array[5 * 60 - v_margin, 6 * 60 + v_margin];      -- A group 5–6 min
    else
        return array[4 * 60 - v_margin, 4 * 60 + v_margin];      -- B group 4 min
    end if;
end;
$$;

-- Member saves the song they just uploaded to comp-songs.
-- p_kind: 'solo' (their own) or 'group' (their team's; any member, last wins)
-- Returns {status:'ok'|'not_registered'|'no_team'|'bad_length'|'closed'|...,
--          min, max} — min/max in seconds when the length is wrong.
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
    where event_id = v_event.id and student_id = p_student_id and not withdrawn and kind = 'compete';
    if not found or v_entry.category is null then
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

-- get_my_competition_by_phone, now with songs (same signature, replaces the
-- phase-1 version from competition.sql).
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

    select * into v_entry from public.comp_entries
    where event_id = v_event.id and student_id = p_student_id;
    if found and v_entry.team_id is not null and v_event.status <> 'registration' then
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
            'songs_open', v_event.status in ('registration', 'locked')),
        'entry', case when v_entry.id is null or v_entry.withdrawn then null else jsonb_build_object(
            'kind', v_entry.kind, 'category', v_entry.category,
            'fee_charged', v_entry.fee_tx_id is not null,
            'solo_song', v_entry.solo_song_path is not null,
            'solo_song_name', v_entry.solo_song_name,
            'solo_song_seconds', v_entry.solo_song_seconds,
            'solo_range', case when v_entry.category is null then null
                else to_jsonb(public._comp_song_range(v_event, v_entry.category, 'solo')) end) end,
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
                where e.team_id = v_team.id and not e.withdrawn and e.student_id <> p_student_id
            ), '[]'::jsonb)) end
    );
end;
$$;
grant execute on function public.get_my_competition_by_phone(bigint, text, text) to anon;

-- ===== competition day =====================================================
create table if not exists public.comp_pins (
    event_id  bigint not null references public.comp_events(id) on delete cascade,
    role      text not null check (role in ('judge1', 'judge2', 'judge3', 'staff')),
    pin       text not null,
    judge_name text,
    primary key (event_id, role)
);

create table if not exists public.comp_slots (
    id        bigint generated by default as identity primary key,
    event_id  bigint not null references public.comp_events(id) on delete cascade,
    position  integer not null,
    code      text,                          -- "B-07"
    category  text check (category in ('A', 'B')),
    kind      text not null check (kind in ('solo', 'group', 'break', 'kids')),
    entry_id  bigint references public.comp_entries(id) on delete cascade,
    team_id   bigint references public.comp_teams(id) on delete cascade,
    label     text,                          -- break text / kids show title
    minutes   numeric,                       -- break length
    status    text not null default 'waiting' check (status in ('waiting', 'done', 'disqualified')),
    unique (event_id, position)
);

create table if not exists public.comp_live (
    event_id         bigint primary key references public.comp_events(id) on delete cascade,
    current_slot_id  bigint references public.comp_slots(id) on delete set null,
    phase            text not null default 'idle' check (phase in ('idle', 'changeover', 'performing', 'break', 'results')),
    phase_started_at timestamptz,
    revealed         jsonb,                  -- results shown on the projector (null = hidden)
    door_cash        integer not null default 0,
    door_free        integer not null default 0,
    updated_at       timestamptz not null default now()
);

create table if not exists public.comp_scores (
    id         bigint generated by default as identity primary key,
    event_id   bigint not null references public.comp_events(id) on delete cascade,
    slot_id    bigint not null references public.comp_slots(id) on delete cascade,
    judge      integer not null check (judge between 1 and 3),
    criteria   jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    unique (slot_id, judge)
);

alter table public.comp_pins enable row level security;
alter table public.comp_slots enable row level security;
alter table public.comp_live enable row level security;
alter table public.comp_scores enable row level security;
do $$
declare t text;
begin
    foreach t in array array['comp_pins', 'comp_slots', 'comp_live', 'comp_scores'] loop
        execute format('drop policy if exists "admin_only" on public.%I', t);
        execute format('create policy "admin_only" on public.%I for all to authenticated
            using (lower(auth.jwt() ->> ''email'') = ''bhangrasway@gmail.com'')
            with check (lower(auth.jwt() ->> ''email'') = ''bhangrasway@gmail.com'')', t);
    end loop;
end $$;

create or replace function public._comp_current_event()
returns public.comp_events
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select * from public.comp_events where status <> 'finished' order by created_at desc limit 1;
$$;
revoke execute on function public._comp_current_event() from public, anon;

create or replace function public._comp_pin_ok(p_event_id bigint, p_role text, p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (select 1 from public.comp_pins
                   where event_id = p_event_id and role = p_role and pin = trim(coalesce(p_pin, '')) and length(trim(coalesce(p_pin, ''))) >= 4);
$$;
revoke execute on function public._comp_pin_ok(bigint, text, text) from public, anon;

-- Everything a screen needs: the running order with names and songs, and
-- the live state. Judges see only their own scores. Results only once revealed.
-- p_role: 'judge1'|'judge2'|'judge3'|'staff'
create or replace function public.comp_screen_state(p_role text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_judge integer;
begin
    v_event := public._comp_current_event();
    if v_event.id is null then
        return jsonb_build_object('status', 'none');
    end if;
    if not public._comp_pin_ok(v_event.id, p_role, p_pin) then
        return jsonb_build_object('status', 'bad_pin');
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
                 from public.comp_scores sc where sc.event_id = v_event.id and sc.judge = v_judge), '{}'::jsonb) end
    );
end;
$$;
grant execute on function public.comp_screen_state(text, text) to anon;

-- A judge saves scores for the slot on stage now (or the one just finished,
-- until the admin presses Next). p_criteria: {"energy":8.5,...} each 1–10, halves.
create or replace function public.comp_judge_save(p_role text, p_pin text, p_slot_id bigint, p_criteria jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_judge integer;
    v_live  public.comp_live;
    k text; v numeric;
begin
    v_event := public._comp_current_event();
    if v_event.id is null or not public._comp_pin_ok(v_event.id, p_role, p_pin) then
        return jsonb_build_object('status', 'bad_pin');
    end if;
    v_judge := case p_role when 'judge1' then 1 when 'judge2' then 2 when 'judge3' then 3 else null end;
    if v_judge is null then
        return jsonb_build_object('status', 'bad_pin');
    end if;
    select * into v_live from public.comp_live where event_id = v_event.id;
    if v_live.current_slot_id is distinct from p_slot_id then
        return jsonb_build_object('status', 'locked');      -- admin already pressed Next
    end if;
    for k, v in select key, value::numeric from jsonb_each_text(p_criteria) loop
        if k not in ('energy', 'technique', 'rhythm', 'expression', 'costume', 'sync', 'formations')
           or v < 1 or v > 10 or (v * 2) <> floor(v * 2) then
            return jsonb_build_object('status', 'bad_score');
        end if;
    end loop;
    insert into public.comp_scores (event_id, slot_id, judge, criteria, updated_at)
    values (v_event.id, p_slot_id, v_judge, p_criteria, now())
    on conflict (slot_id, judge) do update set criteria = excluded.criteria, updated_at = now();
    return jsonb_build_object('status', 'ok');
end;
$$;
grant execute on function public.comp_judge_save(text, text, bigint, jsonb) to anon;

-- Door volunteer: +1 / −1 on the cash or free (under 6) counter.
create or replace function public.comp_door_count(p_pin text, p_kind text, p_delta integer)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_event public.comp_events;
    v_live  public.comp_live;
begin
    v_event := public._comp_current_event();
    if v_event.id is null or not public._comp_pin_ok(v_event.id, 'staff', p_pin) then
        return jsonb_build_object('status', 'bad_pin');
    end if;
    if p_kind not in ('cash', 'free') or p_delta not in (-1, 1) then
        return jsonb_build_object('status', 'bad_kind');
    end if;
    insert into public.comp_live (event_id) values (v_event.id) on conflict (event_id) do nothing;
    update public.comp_live
    set door_cash = greatest(0, door_cash + case when p_kind = 'cash' then p_delta else 0 end),
        door_free = greatest(0, door_free + case when p_kind = 'free' then p_delta else 0 end),
        updated_at = now()
    where event_id = v_event.id
    returning * into v_live;
    return jsonb_build_object('status', 'ok', 'door_cash', v_live.door_cash, 'door_free', v_live.door_free);
end;
$$;
grant execute on function public.comp_door_count(text, text, integer) to anon;
