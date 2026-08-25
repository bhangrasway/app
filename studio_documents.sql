-- ============================================================================
-- STUDIO RULES PDF — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Public bucket (same pattern as site-gallery in site_content.sql): admin.html
-- uploads rules.pdf at a fixed path (upsert:true, so the public URL never
-- changes across re-uploads), member.html links to it directly, no DB row
-- or table needed for this since it's a single static file.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('studio-documents', 'studio-documents', true)
on conflict (id) do update set public = true;

drop policy if exists "studio_documents_authenticated_all" on storage.objects;
create policy "studio_documents_authenticated_all" on storage.objects
    for all to authenticated
    using (bucket_id = 'studio-documents') with check (bucket_id = 'studio-documents');
