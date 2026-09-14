-- Run in the Supabase SQL editor.
-- tax-pdfs was capped at 2 MB (2097152 bytes) — fine for a scanned PDF, too
-- small for a real phone photo (a JPEG converted from a modern iPhone/Android
-- camera commonly lands in the 3-10 MB range). Raising it to 20 MB.

update storage.buckets
set file_size_limit = 20971520  -- 20 MB
where id = 'tax-pdfs';

-- Confirm:
select id, allowed_mime_types, file_size_limit from storage.buckets where id = 'tax-pdfs';
