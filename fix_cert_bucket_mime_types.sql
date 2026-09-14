-- Run this in the Supabase SQL editor. Certificates can now be a PDF or a
-- photo (JPG/PNG/HEIC — HEIC gets converted to JPEG in the browser before
-- upload, so buckets only ever actually receive JPEG for that case, but
-- allowing image/heic too doesn't hurt as a safety net).
--
-- Three buckets are involved in the certificate flow end to end:
--   medical-cert-uploads — student's pending submission (member.html)
--   tax-pdfs             — the studio's own copy + admin's direct upload
--   member-docs          — the published copy shown back to the student

-- ===== STEP 1: see what's currently allowed (and the size limit) =====
select id, allowed_mime_types, file_size_limit
from storage.buckets
where id in ('medical-cert-uploads', 'tax-pdfs', 'member-docs');

-- ===== STEP 2: widen the allowlist on all three =====
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
where id in ('medical-cert-uploads', 'tax-pdfs', 'member-docs');

-- Re-run the STEP 1 select afterward to confirm it took.
