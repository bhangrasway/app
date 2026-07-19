-- ============================================================================
-- TEST STUDENTS — run once in the Supabase SQL editor to get sample data for
-- trying out the Performances feature (team split, dress colors, gender-aware
-- formations, front-row tally, etc). All names start with "TEST -" so they're
-- easy to find and remove later — see the DELETE query at the bottom.
-- ============================================================================

insert into public.students (name, parentname, phone, age, gender, batch, monthlyfees, joindate)
values
    ('TEST - Aarav Singh',   'TEST Parent 1',  '3660000001', 16, 'M', 'Advanced',     30, current_date),
    ('TEST - Simran Kaur',   'TEST Parent 2',  '3660000002', 15, 'F', 'Advanced',     30, current_date),
    ('TEST - Karan Dhillon', 'TEST Parent 3',  '3660000003', 17, 'M', 'Advanced',     30, current_date),
    ('TEST - Harleen Gill',  'TEST Parent 4',  '3660000004', 14, 'F', 'Intermediate', 30, current_date),
    ('TEST - Jaspreet Sidhu','TEST Parent 5',  '3660000005', 18, 'M', 'Intermediate', 30, current_date),
    ('TEST - Manpreet Kaur', 'TEST Parent 6',  '3660000006', 13, 'F', 'Intermediate', 30, current_date),
    ('TEST - Ravi Chahal',   'TEST Parent 7',  '3660000007', 12, 'M', 'Beginner',     30, current_date),
    ('TEST - Amrit Bhullar', 'TEST Parent 8',  '3660000008', 11, 'F', 'Beginner',     30, current_date),
    ('TEST - Sukhwinder Rai','TEST Parent 9',  '3660000009', 20, 'M', 'Professional', 30, current_date),
    ('TEST - Navdeep Brar',  'TEST Parent 10', '3660000010', 19, 'F', 'Professional', 30, current_date),
    ('TEST - Gurpreet Mann', 'TEST Parent 11', '3660000011', 10, 'M', 'Beginner',     30, current_date),
    ('TEST - Kiran Sandhu',  'TEST Parent 12', '3660000012', 16, 'F', 'Intermediate', 30, current_date)
returning id, name, phone, gender, batch;

-- ============================================================================
-- CLEANUP — run this later to remove all the test data above (safe to run
-- any time; it only touches rows whose name starts with "TEST - "):
--
-- delete from public.performance_positions where student_id in (select id from public.students where name like 'TEST - %');
-- delete from public.performance_signups where student_id in (select id from public.students where name like 'TEST - %');
-- delete from public.performance_attendance where student_id in (select id from public.students where name like 'TEST - %');
-- delete from public.attendance where studentid in (select id from public.students where name like 'TEST - %');
-- delete from public.fees_paid where studentid in (select id from public.students where name like 'TEST - %');
-- delete from public.students where name like 'TEST - %';
-- ============================================================================
