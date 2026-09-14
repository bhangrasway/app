-- ============================================================================
-- MOBILE PUSH NOTIFICATIONS for pending admin requests — run once in the
-- Supabase SQL editor (Project -> SQL Editor -> New query -> paste -> Run).
--
-- Today the admin dashboard only shows pending requests (passcode resets,
-- manual check-ins, batch changes) as small red dots while index.html is
-- open — nothing reaches your phone if you're not looking at the page.
--
-- This migration adds a database trigger that fires the moment a new
-- 'pending' row is inserted into any of the three request tables, and posts
-- a push notification via ntfy.sh (https://ntfy.sh) — a free push service
-- with no signup and no server of your own to run.
--
-- SETUP (do these two things, in either order):
--
--   1. On your phone: install the "ntfy" app (Android: Play Store / F-Droid,
--      iPhone: App Store), open it, tap "+", and subscribe to this exact
--      topic name:
--
--          bhangrasway-admin-01872c093b55ae99f4d5
--
--      Treat that topic name like a password — anyone who knows it can send
--      to it or read your notifications, since ntfy.sh topics aren't
--      authenticated by default. If you ever want to rotate it, change
--      v_topic below, re-run this file, and re-subscribe in the app.
--
--   2. In the Supabase dashboard: Database -> Extensions -> enable "pg_net"
--      (needed so the database can make an outgoing HTTP call). Then run
--      this whole file in the SQL editor.
--
-- That's it — no app code changes, no service worker, nothing to deploy.
-- ============================================================================

-- ===== 1. Enable pg_net (outgoing HTTP from Postgres) ======================
create extension if not exists pg_net with schema extensions;

-- ===== 2. Trigger function: build a message and push it to ntfy.sh ========
create or replace function public.notify_admin_ntfy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_topic   text := 'bhangrasway-admin-01872c093b55ae99f4d5'; -- keep secret
    v_title   text;
    v_message text;
begin
    if TG_TABLE_NAME = 'passcode_reset_requests' then
        v_title   := 'Passcode reset requested';
        v_message := coalesce(new.student_name, 'A student') || ' requested a passcode reset.';
    elsif TG_TABLE_NAME = 'checkin_requests' then
        v_title   := 'Manual check-in requested';
        v_message := coalesce(new.student_name, 'A student') || ' requested a manual check-in'
                     || case when nullif(trim(new.reason), '') is not null
                             then ' (' || new.reason || ')' else '' end || '.';
    elsif TG_TABLE_NAME = 'batch_change_requests' then
        v_title   := 'Batch change requested';
        v_message := coalesce(new.student_name, 'A student') || ' asked to move to '
                     || coalesce(new.requested_batch, 'a new batch') || '.';
    else
        v_title   := 'Admin panel';
        v_message := 'New pending request.';
    end if;

    perform net.http_post(
        url  := 'https://ntfy.sh/',
        body := jsonb_build_object(
            'topic', v_topic,
            'title', v_title,
            'message', v_message,
            'priority', 4,
            'tags', jsonb_build_array('bell')
        )
    );

    return new;
end;
$$;

-- ===== 3. Attach the trigger to each request table (pending rows only) =====
drop trigger if exists trg_notify_passcode_reset on public.passcode_reset_requests;
create trigger trg_notify_passcode_reset
    after insert on public.passcode_reset_requests
    for each row
    when (new.status = 'pending')
    execute function public.notify_admin_ntfy();

drop trigger if exists trg_notify_checkin_request on public.checkin_requests;
create trigger trg_notify_checkin_request
    after insert on public.checkin_requests
    for each row
    when (new.status = 'pending')
    execute function public.notify_admin_ntfy();

drop trigger if exists trg_notify_batch_change on public.batch_change_requests;
create trigger trg_notify_batch_change
    after insert on public.batch_change_requests
    for each row
    when (new.status = 'pending')
    execute function public.notify_admin_ntfy();

-- ===== 4. Quick test (optional) =============================================
-- After running everything above and subscribing in the ntfy app, run this
-- line by itself to send yourself a test push, then delete the test row:
--   select net.http_post(
--       url  := 'https://ntfy.sh/',
--       body := jsonb_build_object(
--           'topic', 'bhangrasway-admin-01872c093b55ae99f4d5',
--           'title', 'Test',
--           'message', 'If you see this on your phone, it works!'
--       )
--   );
