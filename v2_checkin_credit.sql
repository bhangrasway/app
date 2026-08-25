-- ============================================================================
-- V2 CHECKIN CREDIT — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Supersedes the checkin_self_by_phone(bigint, text, text) function defined
-- in member_passcode.sql (the CURRENT one in production — member_passcode.sql
-- had already dropped an older 2-parameter version of this same function, so
-- this migration only ever redefines the 3-parameter one, never recreates
-- the dropped signature). Both member.html and checkin.html call this same
-- RPC — member.html passes all three args, checkin.html calls it with just
-- p_student_id/p_phone and relies on p_passcode's default — so neither file
-- needs any change for this fix to take effect everywhere self check-in
-- already works today.
--
-- The gap this closes: self check-in has only ever written to the shared
-- attendance table. It never touched the old credit_balance/credit_transactions
-- either, so that half of the behavior is untouched here on purpose — this
-- migration only adds a NEW deduction path for the v2 balance system
-- (v2_credit_balance/v2_credit_transactions), gated strictly on the
-- attendance date being on/after the 2 September 2026 cutover. A student
-- self-checking in before the cutover still behaves exactly as today.
-- ============================================================================

create or replace function public.checkin_self_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_settings public.checkin_settings%rowtype;
    v_now_rome timestamp := (now() at time zone 'Europe/Rome');
    v_today    date      := (now() at time zone 'Europe/Rome')::date;
    v_existing public.attendance%rowtype;
    v_newly_present boolean := false;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return 'bad_passcode';
    end if;

    select * into v_settings from public.checkin_settings where id = 1;
    if not found
       or not (extract(dow from v_now_rome)::smallint = any (v_settings.active_days))
       or v_now_rome::time < v_settings.start_time
       or v_now_rome::time > v_settings.end_time then
        return 'closed';
    end if;

    select * into v_existing
    from public.attendance
    where studentid = p_student_id and attendancedate = v_today
    limit 1;

    if found then
        if v_existing.ispresent then
            return 'already';
        end if;
        update public.attendance
        set ispresent = true
        where id = v_existing.id;
        v_newly_present := true;
    else
        insert into public.attendance (studentid, attendancedate, ispresent, isdemo)
        values (p_student_id, v_today, true, false);
        v_newly_present := true;
    end if;

    -- v2 credit system: a self check-in on/after the cutover deducts one
    -- class, exactly like an admin marking the same day present from
    -- admin_v2.html's Attendance tab (deductV2CreditForAttendance). Never
    -- touches the old credit_balance/credit_transactions columns.
    if v_newly_present and v_today >= '2026-09-02'::date then
        update public.students
        set v2_credit_balance = coalesce(v2_credit_balance, 0) - 10
        where id = p_student_id;

        insert into public.v2_credit_transactions (student_id, type, amount, note, attendance_date)
        values (p_student_id, 'class_deduction', -10, 'Class attendance — self check-in', v_today);
    end if;

    return 'checked_in';
end;
$$;

grant execute on function public.checkin_self_by_phone(bigint, text, text) to anon;
