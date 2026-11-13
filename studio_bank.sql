-- ============================================================================
-- STUDIO BANK DETAILS (IBAN for bonifico) — run once in the Supabase SQL
-- editor. Safe to re-run.
--
-- The IBAN and the account holder are typed in admin → Fatture → Settings
-- (never written in the code: the repository is public). Students see them in
-- member.html through the phone/passcode-verified RPC below, with copy buttons.
-- ============================================================================

alter table public.fattura_settings add column if not exists iban text;
alter table public.fattura_settings add column if not exists iban_holder text;

-- Returns {status:'ok', iban, holder} (iban null when not set yet)
create or replace function public.get_studio_bank_by_phone(
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
        'iban', (select iban from public.fattura_settings where id = 1),
        'holder', (select iban_holder from public.fattura_settings where id = 1)
    );
end;
$$;
grant execute on function public.get_studio_bank_by_phone(bigint, text, text) to anon;
