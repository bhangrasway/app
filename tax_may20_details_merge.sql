-- ============================================================================
-- Run once in the Supabase SQL editor (Project -> SQL Editor -> New query ->
-- paste -> Run). Safe to re-run.
--
--  1. 20 May push to the admin phone: «Modello Redditi + F24 saldo / 1° acconto,
--     do it between 20/05 and 30/06» (every year, 09:00 Italian time).
--  2. Details corrections sent twice: the new request MERGES with the one still
--     waiting (the newest value of each field wins), so nothing sent before is
--     lost. The admin always sees one request per student, the latest.
-- ============================================================================

-- ---------- 1. 20 May tax reminder ----------
create or replace function public.run_tax_may20_push()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_secret text;
    v_year int := extract(year from now() at time zone 'Europe/Rome')::int;
begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret' limit 1;
    if v_secret is null then return; end if;
    perform net.http_post(
        url     := 'https://geeqcyfnkgamcjclulay.supabase.co/functions/v1/send-push',
        body    := jsonb_build_object(
            'to', 'admin',
            'title', '🧾 Taxes: Modello Redditi + F24',
            'body', 'From today: Modello Redditi ' || (v_year - 1) || ' and F24 saldo + 1° acconto. Do it between 20/05 and 30/06 (30/07 with +0,40%).',
            'url', 'admin.html'
        ),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            -- public anon key (also in admin.html/member.html): only gets past the
            -- function gateway; the real check is x-push-secret
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlZXFjeWZua2dhbWNqY2x1bGF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDYyNjMsImV4cCI6MjA5NzYyMjI2M30.FPEQGtuDMxWK8GnPNQfh88ubXlQ2EIkV7X6FZN_TQpo',
            'x-push-secret', v_secret
        )
    );
end;
$$;
revoke all on function public.run_tax_may20_push() from public, anon, authenticated;

-- 20 May, 07:00 UTC = 09:00 in Italy (summer time).
select cron.unschedule('tax-may20') where exists (select 1 from cron.job where jobname = 'tax-may20');
select cron.schedule('tax-may20', '0 7 20 5 *', $$ select public.run_tax_may20_push(); $$);

-- ---------- 2. Details request sent twice: merge ----------
create or replace function public.request_details_change_by_phone(
    p_student_id bigint,
    p_phone text,
    p_changes jsonb,
    p_passcode text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text;
    v_key text;
    v_old jsonb;
    v_allowed text[] := array[
        'nome', 'cognome', 'codice_fiscale',
        'parent_nome', 'parent_cognome', 'parent_codice_fiscale',
        'addr_via', 'addr_civico', 'addr_cap', 'addr_comune', 'addr_provincia',
        'photo_path'
    ];
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;
    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return 'bad_passcode';
    end if;
    if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
        return 'empty';
    end if;
    for v_key in select jsonb_object_keys(p_changes) loop
        if not (v_key = any (v_allowed)) then
            return 'bad_field';
        end if;
        if length(coalesce(p_changes->v_key->>'new', '')) > 120 then
            return 'bad_field';
        end if;
    end loop;

    select name into v_name from public.students where id = p_student_id;

    -- The request still waiting (if any): keep its fields, the new ones win.
    select changes into v_old
    from public.student_detail_requests
    where student_id = p_student_id and status = 'pending'
    order by id desc
    limit 1;

    update public.student_detail_requests
    set status = 'dismissed', resolved_at = now()
    where student_id = p_student_id and status = 'pending';

    insert into public.student_detail_requests (student_id, student_name, changes)
    values (p_student_id, v_name, coalesce(v_old, '{}'::jsonb) || p_changes);

    return 'sent';
end;
$$;

grant execute on function public.request_details_change_by_phone(bigint, text, jsonb, text) to anon;
