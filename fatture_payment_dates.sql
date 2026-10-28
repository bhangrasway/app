-- Run once in the Supabase SQL editor.
--
-- Same as payment_lock.sql's get_my_fatture_v2_by_phone, plus 'pagamenti':
-- the payments each fattura covers (its own + extra_transaction_ids), so the
-- member portal can show «per i pagamenti del 16/10, 17/10 e 23/10/2026».
-- A sibling of a shared fattura sees only their own payments in it.

create or replace function public.get_my_fatture_v2_by_phone(
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
            'anno', f.anno,
            'numero', f.numero,
            'data', f.data_fattura,
            'importo', f.importo,
            'pdf_token', f.pdf_token,
            'pagamenti', coalesce((
                select jsonb_agg(jsonb_build_object('data', t.created_at, 'importo', t.amount) order by t.created_at)
                from public.v2_credit_transactions t
                where (t.id = f.transaction_id or t.id = any(f.extra_transaction_ids))
                  and t.student_id = p_student_id
                  and t.deleted_at is null
            ), '[]'::jsonb)
        ) order by f.data_fattura desc, f.numero desc)
        from public.fatture f
        where (f.student_id = p_student_id
               or exists (select 1 from public.v2_credit_transactions t
                          where t.id = any(f.extra_transaction_ids) and t.student_id = p_student_id))
          and f.deleted_at is null
          and f.status = 'accepted'
          and f.pdf_token is not null
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_fatture_v2_by_phone(bigint, text, text) to anon;

-- Payment History in the member portal: each payment also says which
-- ACCEPTED fattura covers it (own or one of extra_transaction_ids), so the
-- student gets a «Fattura 29/26» button opening the same PDF on every payment
-- of a merged fattura. Same as fix_member_ledger_excludes_deleted.sql plus
-- 'fattura' (null when there's none, or it isn't accepted yet).
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
            'created_at', t.created_at,
            'fattura', (
                select jsonb_build_object('anno', f.anno, 'numero', f.numero, 'pdf_token', f.pdf_token)
                from public.fatture f
                where (f.transaction_id = t.id or t.id = any(f.extra_transaction_ids))
                  and f.deleted_at is null
                  and f.status = 'accepted'
                  and f.pdf_token is not null
                order by f.data_fattura desc, f.numero desc
                limit 1
            )
        ) order by t.created_at desc)
        from public.v2_credit_transactions t
        where t.student_id = p_student_id
          and t.deleted_at is null
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_credit_ledger_v2_by_phone(bigint, text, text) to anon;
