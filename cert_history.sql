-- ============================================================================
-- MEDICAL CERTIFICATE HISTORY — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Every certificate is kept. A new certificate (uploaded by the admin or
-- approved from the member portal) no longer overwrites the previous file,
-- and "Elimina" no longer erases it: the previous one moves into
-- doctor_cert_history — [{ path, name, expiresAt, archivedAt, reason }] —
-- shown as "Storico certificati" in the student's view. Safe to re-run.
-- ============================================================================

alter table public.tax_records
    add column if not exists doctor_cert_history jsonb not null default '[]'::jsonb;

-- A student uploading a new certificate before the previous one was checked
-- used to DELETE that earlier upload's row. Now it's kept with status
-- 'replaced' (its file stays in storage), so every upload stays on record —
-- shown in the student's view under "Inviati dal portale e non usati".
create or replace function public.submit_medical_certificate_by_phone(
    p_student_id bigint,
    p_phone text,
    p_file_path text,
    p_passcode text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_name text;
begin
    if not public._phone_matches_student(p_student_id, p_phone) then
        return 'bad_phone';
    end if;

    if not public._passcode_matches_student(p_student_id, p_passcode) then
        return 'bad_passcode';
    end if;

    select name into v_name from public.students where id = p_student_id;

    -- A fresh upload supersedes any earlier pending one — kept, not deleted.
    update public.medical_certificate_submissions
    set status = 'replaced', reviewed_at = now()
    where student_id = p_student_id and status = 'pending';

    insert into public.medical_certificate_submissions (student_id, student_name, file_path)
    values (p_student_id, v_name, p_file_path);

    return 'sent';
end;
$$;

grant execute on function public.submit_medical_certificate_by_phone(bigint, text, text, text) to anon;
