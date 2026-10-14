-- ============================================================================
-- SECURITY HARDENING — from the Supabase Security Advisor (14 Oct 2026).
-- Run in the Supabase SQL editor. Safe to re-run.
--
-- Internal helper functions that must NOT be callable from outside through
-- the API (/rest/v1/rpc/...). They're only ever used INSIDE the member-portal
-- functions (which are security definer, so they keep working), and
-- notify_admin_ntfy only runs as a trigger (a trigger doesn't need EXECUTE).
--
-- Not touched on purpose: the public "..._by_phone" functions. They ARE the
-- member portal, and each one verifies the student's phone + passcode itself.
--
-- ALSO DO IN THE DASHBOARD (not possible from SQL):
--   Authentication -> Sign In / Providers:
--     - "Allow new users to sign up"  -> OFF   (the admin is the only user;
--       every admin table trusts any logged-in user)
--     - "Leaked password protection"  -> ON
-- ============================================================================

revoke execute on function public.notify_admin_ntfy() from public, anon, authenticated;
revoke execute on function public._phone_matches_student(bigint, text) from public, anon, authenticated;
revoke execute on function public._passcode_matches_student(bigint, text) from public, anon, authenticated;
revoke execute on function public._student_is_captain(bigint, bigint) from public, anon, authenticated;
