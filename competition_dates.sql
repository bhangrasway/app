-- Group registration closes on Tuesday 24 November 2026 (was 20 November).
-- Teams are locked by the coach on the same day (admin → Competition → "Lock teams + charge fee").
-- Run once in the Supabase SQL editor. The member app and the admin read this date from here.
update public.comp_events
   set reg_close = date '2026-11-24'
 where status <> 'finished';

select title, status, reg_close, settings ->> 'solo_close' as solo_close from public.comp_events order by created_at desc limit 1;
