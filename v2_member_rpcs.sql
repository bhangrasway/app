-- ============================================================================
-- V2 MEMBER RPCS — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Supports member_v2.html — three new phone/passcode-verified RPCs, isolated
-- from the old billing model exactly like admin_v2.html is. Every other RPC
-- member_v2.html needs (find_members_by_phone, set_student_passcode_by_phone,
-- request_passcode_reset_by_phone, the batch/medical-certificate/invoices/
-- photo/checkin/performance RPCs) is reused completely as-is from the
-- existing member.html — none of it is billing-model-specific, so none of
-- it needs a v2 twin. Only the balance/ledger/old-payments surface does.
--
-- Column names below were confirmed against member_credit_status.sql's
-- existing get_student_report_by_phone (students.name/parentname/joindate/
-- monthlyfees/batch, attendance.studentid/attendancedate/ispresent/isdemo,
-- fees_paid.studentid/ispaid/paiddate/amount — all lowercase, no
-- underscores, the older-table convention) and admin_preview_bypass.sql
-- (students.photo_path). v2_credit_balance / pre_cutover_balance_snapshot /
-- v2_credit_transactions are this project's own v2_cutover.sql columns.
-- ============================================================================

-- ===== 1. Core dashboard payload =====
-- Mirrors get_student_report_by_phone's verification, but only ever reads
-- v2 fields — never credit_balance, never fees_paid's cycle math. Old
-- fees_paid rows are still returned (read-only) for the Historical Record
-- section; they're never summed into anything live here.
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
                'pre_cutover_balance_snapshot', s.pre_cutover_balance_snapshot
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

-- ===== 2. The student's own v2 credit ledger =====
-- Same pattern as get_my_credit_ledger_by_phone, pointed at
-- v2_credit_transactions instead of the old credit_transactions.
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
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_credit_ledger_v2_by_phone(bigint, text, text) to anon;
