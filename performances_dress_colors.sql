-- ============================================================================
-- PERFORMANCE DRESS COLORS — run once in the Supabase SQL editor.
--
-- performance_signups.dress_color has a check constraint limiting it to the
-- original 6 colors (performances.sql). Widens it to the full set now used
-- in admin.html's Roster card: the original 6, plus olive, pink, and the
-- boys/kid-specific variants (red_boys / sky_blue_boys / yellow_boys /
-- yellow_boy_kid / green_boy_kid — same named color, distinct outfit,
-- tracked separately since it's a different physical garment).
-- ============================================================================

alter table public.performance_signups drop constraint if exists performance_signups_dress_color_check;
alter table public.performance_signups add constraint performance_signups_dress_color_check
    check (dress_color in (
        'red', 'green', 'purple', 'orange', 'sky_blue', 'royal_blue',
        'olive', 'pink', 'red_boys', 'sky_blue_boys', 'yellow_boys',
        'yellow_boy_kid', 'green_boy_kid'
    ));
