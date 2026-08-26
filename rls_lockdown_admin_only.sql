-- ============================================================================
-- RLS LOCKDOWN — ADMIN ACCOUNT ONLY — run once in the Supabase SQL editor
-- (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Prompted by the Supabase Security Advisor flagging every app table (and
-- several storage buckets) with an "authenticated_all" / USING (true) policy:
-- ANY Supabase Auth session — not just the studio's own admin login — gets
-- full read/write/delete on students, attendance, credit balances, medical
-- certificates, everything. admin.html is the only intended holder of a
-- Supabase Auth session (member.html never signs in — it verifies phone +
-- passcode per request through security definer RPCs instead), so this
-- migration narrows every one of those policies from "anyone logged in" to
-- "only bhangrasway@gmail.com is logged in".
--
-- This is defense-in-depth on top of disabling public sign-ups in
-- Authentication -> Sign In / Providers -> Email (already done separately in
-- the dashboard, not by SQL) — that stops NEW accounts from being created at
-- all; this migration makes sure that even an existing/leftover account
-- besides the real admin's still couldn't touch any data.
--
-- Some tables (students, attendance, fees_paid, expenses, tax_records) turned
-- out to carry TWO overly-permissive policies each — an older one
-- ("Authenticated only" / "Authenticated users full access") that an earlier
-- migration's `drop policy if exists "authenticated_all"` never actually
-- matched (wrong name) and so never removed, plus the "authenticated_all" one
-- it added alongside it. Both are dropped below.
--
-- If anything looks wrong after running this (a tab in admin.html stops
-- loading data, or login itself fails), the fastest fix is confirming the
-- login email really is bhangrasway@gmail.com (Authentication -> Users in the
-- dashboard) — a typo there is the only likely failure mode, since every
-- policy below is otherwise a straight narrowing of an existing rule.
--
-- Safe to run more than once: every "admin_only" policy is dropped (if it
-- already exists) right before it's recreated, so re-running this after a
-- prior successful pass — or after it stopped partway through — just
-- reapplies the same end state instead of erroring on a duplicate name.
-- ============================================================================

-- ===== 0. Function missing a locked search_path (Security Advisor warning) ==
-- Matches the `set search_path = public, pg_temp` already used by every
-- other function in this project (see e.g. get_student_report_v2_by_phone) —
-- this one predates that convention.
create or replace function public._phone_digits(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
    select regexp_replace(coalesce(p, ''), '\D', '', 'g')
$$;

-- ===== 1. Table policies =====================================================
-- Same shape repeated for every table: drop whatever over-permissive
-- authenticated policy already exists (both possible old names), add one
-- back scoped to the admin's email specifically. lower(...) so a login typed
-- with different casing still matches.

drop policy if exists "Authenticated only" on public.students;
drop policy if exists "authenticated_all" on public.students;
drop policy if exists "admin_only" on public.students;
create policy "admin_only" on public.students
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "Authenticated only" on public.attendance;
drop policy if exists "authenticated_all" on public.attendance;
drop policy if exists "admin_only" on public.attendance;
create policy "admin_only" on public.attendance
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "Authenticated only" on public.fees_paid;
drop policy if exists "authenticated_all" on public.fees_paid;
drop policy if exists "admin_only" on public.fees_paid;
create policy "admin_only" on public.fees_paid
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "Authenticated only" on public.expenses;
drop policy if exists "authenticated_all" on public.expenses;
drop policy if exists "admin_only" on public.expenses;
create policy "admin_only" on public.expenses
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "Authenticated users full access" on public.tax_records;
drop policy if exists "authenticated_all" on public.tax_records;
drop policy if exists "admin_only" on public.tax_records;
create policy "admin_only" on public.tax_records
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.checkin_requests;
drop policy if exists "admin_only" on public.checkin_requests;
create policy "admin_only" on public.checkin_requests
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.checkin_settings;
drop policy if exists "admin_only" on public.checkin_settings;
create policy "admin_only" on public.checkin_settings
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.credit_transactions;
drop policy if exists "admin_only" on public.credit_transactions;
create policy "admin_only" on public.credit_transactions
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.v2_credit_transactions;
drop policy if exists "admin_only" on public.v2_credit_transactions;
create policy "admin_only" on public.v2_credit_transactions
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.medical_certificate_submissions;
drop policy if exists "admin_only" on public.medical_certificate_submissions;
create policy "admin_only" on public.medical_certificate_submissions
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.passcode_reset_requests;
drop policy if exists "admin_only" on public.passcode_reset_requests;
create policy "admin_only" on public.passcode_reset_requests
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.batches;
drop policy if exists "admin_only" on public.batches;
create policy "admin_only" on public.batches
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.batch_change_requests;
drop policy if exists "admin_only" on public.batch_change_requests;
create policy "admin_only" on public.batch_change_requests
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.performances;
drop policy if exists "admin_only" on public.performances;
create policy "admin_only" on public.performances
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.performance_signups;
drop policy if exists "admin_only" on public.performance_signups;
create policy "admin_only" on public.performance_signups
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.performance_movements;
drop policy if exists "admin_only" on public.performance_movements;
create policy "admin_only" on public.performance_movements
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.performance_positions;
drop policy if exists "admin_only" on public.performance_positions;
create policy "admin_only" on public.performance_positions
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.performance_attendance;
drop policy if exists "admin_only" on public.performance_attendance;
create policy "admin_only" on public.performance_attendance
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.site_events;
drop policy if exists "admin_only" on public.site_events;
create policy "admin_only" on public.site_events
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.site_gallery;
drop policy if exists "admin_only" on public.site_gallery;
create policy "admin_only" on public.site_gallery
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "authenticated_all" on public.site_instagram;
drop policy if exists "admin_only" on public.site_instagram;
create policy "admin_only" on public.site_instagram
    for all to authenticated
    using (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

-- ===== 2. Storage bucket policies ============================================
-- Same narrowing, plus each keeps its original bucket_id scope so admin
-- access to one bucket's files still can't spill into another's.

drop policy if exists "member_docs_authenticated_all" on storage.objects;
drop policy if exists "member_docs_admin_only" on storage.objects;
create policy "member_docs_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'member-docs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'member-docs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "performance_songs_authenticated_all" on storage.objects;
drop policy if exists "performance_songs_admin_only" on storage.objects;
create policy "performance_songs_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'performance-songs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'performance-songs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "site_gallery_authenticated_all" on storage.objects;
drop policy if exists "site_gallery_admin_only" on storage.objects;
create policy "site_gallery_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'site-gallery' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'site-gallery' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "student_photos_authenticated_all" on storage.objects;
drop policy if exists "student_photos_admin_only" on storage.objects;
create policy "student_photos_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'student-photos' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'student-photos' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "studio_documents_authenticated_all" on storage.objects;
drop policy if exists "studio_documents_admin_only" on storage.objects;
create policy "studio_documents_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'studio-documents' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'studio-documents' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "tax_pdfs_authenticated_all" on storage.objects;
drop policy if exists "tax_pdfs_admin_only" on storage.objects;
create policy "tax_pdfs_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'tax-pdfs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'tax-pdfs' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

drop policy if exists "medical_cert_authenticated_all" on storage.objects;
drop policy if exists "medical_cert_admin_only" on storage.objects;
create policy "medical_cert_admin_only" on storage.objects
    for all to authenticated
    using (bucket_id = 'medical-cert-uploads' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com')
    with check (bucket_id = 'medical-cert-uploads' and lower(auth.jwt() ->> 'email') = 'bhangrasway@gmail.com');

-- Every anon-facing policy (anon_read_only, anon_read_site_events,
-- anon_read_site_instagram, medical_cert_anon_insert,
-- student_photos_anon_insert, and every phone/passcode-verified RPC) is
-- untouched by this migration — those were already correctly scoped to
-- exactly what public pages need, never a blanket grant.
