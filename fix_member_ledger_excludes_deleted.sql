-- Run this once in the Supabase SQL editor.
--
-- get_my_credit_ledger_v2_by_phone (v2_member_rpcs.sql) powers member.html's
-- own "Payment History" passbook, but it never filtered out deleted_at rows
-- — unlike admin.html's own per-student ledger view, which does. So a class
-- charge that was correctly refunded/deleted via the admin's "delete this
-- transaction" button would still show up in the STUDENT's own passbook
-- forever, even though it's already excluded from their real balance. This
-- is very likely why an already-refunded charge still looked "there" to
-- students. Re-running create-or-replace is idempotent and safe.

create or replace function public.get_my_credit_ledger_v2_by_phone(
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
        return '[]'::jsonb;
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return '[]'::jsonb;
    end if;

    return coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', t.id,
            'type', t.type,
            'amount', t.amount,
            'note', t.note,
            'attendance_date', t.attendance_date,
            'created_at', t.created_at
        ) order by t.created_at desc)
        from public.v2_credit_transactions t
        where t.student_id = p_student_id
          and t.deleted_at is null
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_credit_ledger_v2_by_phone(bigint, text, text) to anon;
