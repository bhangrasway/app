-- Demo class support: marks an attendance row as a free demo class.
-- Demo classes don't count toward the 4-classes-per-cycle target, and a
-- student's plan starts from their first NON-demo attended class.
--
-- Run this once in the Supabase SQL editor.
-- (Column name is lowercase "isdemo" to match the existing attendance
--  columns: studentid, attendancedate, ispresent.)

alter table public.attendance
    add column if not exists isdemo boolean not null default false;
