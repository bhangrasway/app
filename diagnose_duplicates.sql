-- DIAGNOSTIC ONLY — no changes made. Finds every student who has more than
-- one active class_deduction transaction for the same attendance_date,
-- regardless of what that date actually is (removes any guessing about
-- exact dates/timezones from the picture).

select student_id, attendance_date, count(*) as duplicate_count,
       array_agg(id order by id) as transaction_ids,
       array_agg(amount order by id) as amounts,
       array_agg(created_at order by id) as created_at_values
from public.v2_credit_transactions
where type = 'class_deduction'
  and deleted_at is null
group by student_id, attendance_date
having count(*) > 1
order by attendance_date desc, student_id;
