-- ============================================================================
-- MEMBER DOCUMENT CENTER — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Builds on member_passcode.sql, medical_certificates.sql, secure_new_tables.sql
-- (must already be applied).
--
-- Lets students, from member.html:
--  - view + delete their own medical certificate (upload already existed)
--  - download their fatture (tax payment receipts), which the admin uploads
--
-- Both tax-pdfs and medical-cert-uploads are private buckets, and member.html
-- has no real login (phone-number matching only, no Supabase Auth session) —
-- there is no way for a Postgres RPC to hand out a signed URL into a private
-- bucket, since Storage authorizes signed-URL requests by the CALLER's own
-- key, not by anything a database function decided. Rather than build a
-- Supabase Edge Function (new infrastructure this project has never used),
-- this uses the same trust model already in production here: the admin's
-- existing "Send via WhatsApp" button (sendTaxPdfWhatsApp, admin.html:1840)
-- already hands out a bare link over WhatsApp that anyone holding it could
-- open for the next hour. This does the same thing, just permanent and
-- self-served: every member-facing file lives in a PUBLIC bucket, but only
-- ever at a long random (unguessable) path — never a predictable one like
-- student_47/doctor_cert.pdf. Only a phone-verified RPC ever hands a student
-- their own token.
-- ============================================================================

-- ===== 1. Public bucket for member-facing document copies ===================
-- The admin's own private copies (tax-pdfs) are untouched and stay the
-- source of truth — this bucket only ever holds a second, public-but-
-- unguessable copy of files that are supposed to be downloadable.
insert into storage.buckets (id, name, public)
values ('member-docs', 'member-docs', true)
on conflict (id) do update set public = true;

drop policy if exists "member_docs_authenticated_all" on storage.objects;
create policy "member_docs_authenticated_all" on storage.objects
    for all to authenticated
    using (bucket_id = 'member-docs') with check (bucket_id = 'member-docs');

-- ===== 2. Schema =============================================================
alter table public.medical_certificate_submissions add column if not exists deleted_at timestamptz;
alter table public.medical_certificate_submissions add column if not exists public_token text;

-- ===== 3. RPC: get the download token for an approved certificate ===========
-- Returns the public_token (null if none/pending/rejected/deleted).
create or replace function public.get_medical_certificate_download_url_by_phone(
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
    v_token text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return null;
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return null;
    end if;

    select public_token into v_token
    from public.medical_certificate_submissions
    where student_id = p_student_id and status = 'approved' and deleted_at is null
    order by reviewed_at desc nulls last, submitted_at desc
    limit 1;

    return v_token;
end;
$$;

grant execute on function public.get_medical_certificate_download_url_by_phone(bigint, text, text) to anon;

-- ===== 4. RPC: student deletes their own certificate (soft delete) ==========
-- Never a hard delete — the row and its history stay for the admin's record.
-- Also clears tax_records.has_doctor so the "on file" status disappears; the
-- actual PDF in tax-pdfs (the admin's own copy) is left untouched.
-- Returns: 'ok' | 'bad_phone' | 'bad_passcode' | 'nothing_to_delete'
create or replace function public.delete_medical_certificate_by_phone(
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
    v_submission_id bigint;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return 'bad_passcode';
    end if;

    select id into v_submission_id
    from public.medical_certificate_submissions
    where student_id = p_student_id and deleted_at is null and status in ('pending', 'approved')
    order by submitted_at desc
    limit 1;

    if v_submission_id is null then
        return 'nothing_to_delete';
    end if;

    update public.medical_certificate_submissions
    set deleted_at = now()
    where id = v_submission_id;

    update public.tax_records
    set has_doctor = false
    where student_id = p_student_id;

    return 'ok';
end;
$$;

grant execute on function public.delete_medical_certificate_by_phone(bigint, text, text) to anon;

-- ===== 5. RPC: student reads their own fatture (payment receipts) ===========
-- tax_records is authenticated-only (security_lockdown.sql); this reads it
-- safely after verifying identity, and only returns entries the admin has
-- made downloadable (i.e. have a publicToken set — see admin.html changes).
create or replace function public.get_my_fatture_by_phone(
    p_student_id bigint,
    p_phone text,
    p_passcode text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_payments jsonb;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return '[]'::jsonb;
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return '[]'::jsonb;
    end if;

    select payments into v_payments from public.tax_records where student_id = p_student_id;
    if v_payments is null then
        return '[]'::jsonb;
    end if;

    return coalesce((
        select jsonb_agg(p order by (p->>'date') desc)
        from jsonb_array_elements(v_payments) p
        where p ? 'publicToken' and (p->>'publicToken') is not null and (p->>'publicToken') <> ''
    ), '[]'::jsonb);
end;
$$;

grant execute on function public.get_my_fatture_by_phone(bigint, text, text) to anon;
