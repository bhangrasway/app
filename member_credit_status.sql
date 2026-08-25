-- ============================================================================
-- MEMBER PORTAL: CREDIT STATUS — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Builds on member_passcode.sql and credit_system.sql (must already be
-- applied). member.html's "Membership Status" card only ever showed the old
-- monthly-cycle view — it never learned about the new per-class credit
-- system introduced in admin.html (on_credit_plan / credit_balance /
-- credit_transactions). This adds what's needed for member.html to show the
-- new balance-based "Class Credit" card for students who've been migrated.
-- ============================================================================

-- ===== 1. Extend get_student_report_by_phone to also return credit fields ===
-- Same signature as before (no drop needed — the parameter list is
-- unchanged, only the returned jsonb grows two fields), so nothing else that
-- calls this RPC needs to change.
create or replace function public.get_student_report_by_phone(
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
                'joindate', s.joindate,
                'nextpaymentdate', s.nextpaymentdate,
                'monthlyfees', s.monthlyfees,
                'batch', s.batch,
                'on_credit_plan', coalesce(s.on_credit_plan, false),
                'credit_balance', coalesce(s.credit_balance, 0)
            )
            from public.students s
            where s.id = p_student_id
        ),
        'attendance', coalesce((
            select jsonb_agg(jsonb_build_object(
                'studentid', a.studentid,
                'attendancedate', a.attendancedate,
                'ispresent', a.ispresent,
                'isdemo', a.isdemo
            ) order by a.attendancedate)
            from public.attendance a
            where a.studentid = p_student_id
        ), '[]'::jsonb),
        'fees', coalesce((
            select jsonb_agg(to_jsonb(f) order by f.id)
            from public.fees_paid f
            where f.studentid = p_student_id
        ), '[]'::jsonb)
    );
end;
$$;

-- ===== 2. RPC: read a student's own credit ledger ============================
-- credit_transactions is authenticated-only (secure_new_tables.sql), so
-- member.html needs a phone-verified window into just their own rows, same
-- pattern as get_my_fatture_by_phone (member_documents.sql).
create or replace function public.get_my_credit_ledger_by_phone(
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
            'created_at', t.created_at
        ) order by t.created_at desc)
        from public.credit_transactions t
        where t.student_id = p_student_id
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_credit_ledger_by_phone(bigint, text, text) to anon;
