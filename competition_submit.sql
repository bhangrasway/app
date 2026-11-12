-- ============================================================================
-- COMPETITION: judges press "Call next participant" — run AFTER
-- competition_security.sql. Safe to re-run.
--
-- A judge's scores for a performance count as finished only when the judge
-- presses the button (submitted = true), and the button only works when every
-- point is filled. Changing a score afterwards un-sends it until pressed again.
-- The Control screen's Next waits for all 3 judges to have sent.
-- ============================================================================

alter table public.comp_scores add column if not exists submitted boolean not null default false;

drop function if exists public.comp_judge_save(text, text, bigint, jsonb);
drop function if exists public.comp_judge_save(text, text, bigint, jsonb, boolean);

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
        v_need := array['energy', 'technique', 'rhythm', 'expression', 'costume'];
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

-- comp_screen_state, now also telling a judge which performances they already sent.
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

-- ===== "Finished": the dance ended, the clock stops, judges finish scoring =====
-- Start → performing (clock runs) → Finished (clock frozen at the danced time)
-- → Next (1-minute "get ready" for the next dancer).
alter table public.comp_live add column if not exists last_seconds numeric;
alter table public.comp_live drop constraint if exists comp_live_phase_check;
alter table public.comp_live add constraint comp_live_phase_check
    check (phase in ('idle', 'changeover', 'performing', 'finished', 'break', 'results'));

