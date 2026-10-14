-- ============================================================================
-- PERFORMANCE — Supabase Performance Advisor (14 Oct 2026):
-- "Unindexed foreign keys" (INFO). Adds the 9 missing indexes so lookups by
-- student / location / performance stay fast as the data grows.
-- Only adds indexes: no data or behaviour changes. Safe to re-run.
-- ============================================================================

create index if not exists attendance_studentid_idx             on public.attendance (studentid);
create index if not exists batches_location_id_idx              on public.batches (location_id);
create index if not exists expenses_location_id_idx             on public.expenses (location_id);
create index if not exists fees_paid_studentid_idx              on public.fees_paid (studentid);
create index if not exists performance_attendance_student_id_idx on public.performance_attendance (student_id);
create index if not exists performance_comments_performance_id_idx on public.performance_comments (performance_id);
create index if not exists performance_positions_student_id_idx  on public.performance_positions (student_id);
create index if not exists performance_signups_student_id_idx    on public.performance_signups (student_id);
create index if not exists students_location_id_idx             on public.students (location_id);
