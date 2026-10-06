-- Run once in the Supabase SQL editor.
--
-- Two member-facing RPCs need to know about locations now:
--   1. get_student_report_v2_by_phone needs to return the student's
--      location_id, so member.html can look up the right geofence/check-in
--      window instead of always using Cremona's.
--   2. request_batch_change_by_phone should refuse a request for a batch at
--      a different location than the student's own — the dropdown in
--      member.html already only offers same-location batches, but this is
--      the server-side backstop in case that ever gets bypassed.

create or replace function public.get_student_report_v2_by_phone(
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
        'student', (
            select jsonb_build_object(
                'id', s.id,
                'name', s.name,
                'parentname', s.parentname,
                'batch', s.batch,
                'age', s.age,
                'joindate', s.joindate,
                'photo_path', s.photo_path,
                'monthlyfees', coalesce(s.monthlyfees, 0),
                'v2_credit_balance', coalesce(s.v2_credit_balance, 0),
                'per_class_rate', coalesce(s.per_class_rate, 10),
                'pre_cutover_balance_snapshot', s.pre_cutover_balance_snapshot,
                'location_id', s.location_id
            )
            from public.students s
            where s.id = p_student_id
        ),
        'attendance', coalesce((
            select jsonb_agg(jsonb_build_object(
                'attendancedate', a.attendancedate,
                'ispresent', a.ispresent,
                'isdemo', a.isdemo
            ) order by a.attendancedate)
            from public.attendance a
            where a.studentid = p_student_id
        ), '[]'::jsonb),
        'oldPayments', coalesce((
            select jsonb_agg(jsonb_build_object(
                'month', f.month,
                'ispaid', f.ispaid,
                'paiddate', f.paiddate,
                'amount', f.amount
            ) order by f.paiddate)
            from public.fees_paid f
            where f.studentid = p_student_id and f.ispaid = true
        ), '[]'::jsonb)
    );
end;
$$;

grant execute on function public.get_student_report_v2_by_phone(bigint, text, text) to anon;

-- ===== request_batch_change_by_phone: refuse a cross-location request =====
create or replace function public.request_batch_change_by_phone(
    p_student_id bigint,
    p_phone text,
    p_requested_batch text,
    p_passcode text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text;
    v_current_batch text;
    v_student_location bigint;
    v_batch_location bigint;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return 'bad_passcode';
    end if;

    select location_id into v_batch_location from public.batches where name = p_requested_batch and active;
    if v_batch_location is null then
        return 'unknown_batch';
    end if;

    select name, batch, location_id into v_name, v_current_batch, v_student_location
    from public.students where id = p_student_id;

    if v_student_location is distinct from v_batch_location then
        return 'unknown_batch';
    end if;

    -- Replace any existing pending request instead of stacking duplicates.
    update public.batch_change_requests
    set status = 'dismissed', resolved_at = now()
    where student_id = p_student_id and status = 'pending';

    insert into public.batch_change_requests (student_id, student_name, current_batch, requested_batch)
    values (p_student_id, v_name, v_current_batch, p_requested_batch);

    return 'sent';
end;
$$;

grant execute on function public.request_batch_change_by_phone(bigint, text, text, text) to anon;
