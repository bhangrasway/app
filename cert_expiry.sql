-- ============================================================================
-- MEDICAL CERTIFICATE EXPIRY — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- tax_records (has_doctor / doctor_pdf_path / doctor_pdf_name) is the
-- authoritative "current certificate on file" record the Tax modal in
-- admin.html already manages — this just gives it an expiry date so the
-- Student View Modal can show "Valid until X" or "⚠️ Expired X".
-- ============================================================================

alter table public.tax_records add column if not exists doctor_cert_expires_at date;

-- Also tracked on the submission itself, so a value set during admin review
-- carries through to the audit trail (medical_certificate_submissions),
-- independent of tax_records.
alter table public.medical_certificate_submissions add column if not exists expires_at date;
