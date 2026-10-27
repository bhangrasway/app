-- ============================================================================
-- PAYMENT LOCK + PAYMENT METHOD — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run). Safe to re-run.
--
--  * v2_credit_transactions.payment_method: 'cash' | 'bonifico'. Required by
--    admin.html for every new recharge; old rows stay empty until set.
--  * Invoiced payments are locked: once a fattura (not deleted, not
--    rejected — a draft XML counts too) points to a payment, its amount,
--    date, student and type can't change and it can't be deleted (for a
--    draft XML: delete the draft first). The payment method is NOT in the
--    fattura, so it can always be changed.
-- ============================================================================

alter table public.v2_credit_transactions add column if not exists payment_method text;
alter table public.v2_credit_transactions drop constraint if exists v2_credit_transactions_payment_method_check;
alter table public.v2_credit_transactions add constraint v2_credit_transactions_payment_method_check
    check (payment_method is null or payment_method in ('cash', 'bonifico'));

-- ============================================================================
-- ONE BONIFICO FOR SEVERAL STUDENTS
--  * payment_group: the same value on every share of one bonifico.
--  * fatture.extra_transaction_ids: the other shares a fattura covers (siblings
--    with the same parent get ONE fattura with all the names; transaction_id
--    stays the first share).
-- ============================================================================

alter table public.v2_credit_transactions add column if not exists payment_group uuid;
alter table public.fatture add column if not exists extra_transaction_ids bigint[] not null default '{}';

-- Lock: also the shares covered through extra_transaction_ids, and the
-- group itself can't be changed once invoiced.
create or replace function public.v2_tx_invoice_lock()
returns trigger
language plpgsql
as $$
declare
    v_f record;
begin
    select anno, numero into v_f
    from public.fatture
    where (transaction_id = old.id or old.id = any(extra_transaction_ids))
      and deleted_at is null and status <> 'rejected'
    limit 1;
    if not found then
        return case when tg_op = 'DELETE' then old else new end;
    end if;

    if tg_op = 'DELETE'
        or new.amount is distinct from old.amount
        or new.created_at is distinct from old.created_at
        or new.deleted_at is distinct from old.deleted_at
        or new.student_id is distinct from old.student_id
        or new.type is distinct from old.type
        or new.payment_group is distinct from old.payment_group
    then
        raise exception 'Invoiced (fattura %/%): amount and date can''t change (only the payment method can).',
            v_f.numero, right(v_f.anno::text, 2);
    end if;
    return new;
end;
$$;

-- Member app: a sibling also sees the shared fattura (one of its covered
-- payments is theirs).
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
            'pdf_token', f.pdf_token
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

drop trigger if exists v2_tx_invoice_lock on public.v2_credit_transactions;
create trigger v2_tx_invoice_lock
    before update or delete on public.v2_credit_transactions
    for each row execute function public.v2_tx_invoice_lock();
