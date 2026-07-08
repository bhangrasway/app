// ============================================================================
// Shared trust-based membership engine
// Loaded (as a classic script) by BOTH the admin dashboard (index.html) and
// the public report page (report.html), so the policy math can never drift
// between what the admin sees and what a student sees.
//
// Policy (see the comment above buildMembershipTimeline for the walk):
// cycles run on attendance, not payment — every monthly cycle guarantees
// AUTO_EXTENSION_CLASS_TARGET classes, extending week-by-week up to
// AUTO_EXTENSION_MAX_MONTHS; cycles chain after the effective end; an
// incomplete unpaid cycle pauses the plan and carries its classes into the
// cycle that starts when the student returns; only complete unpaid cycles
// are "owed".
//
// The engine is data-source agnostic: callers pass an `opts` object that
// answers attendance/payment questions (the dashboard answers from its
// global maps, the report page from the rows its RPC returned). Use
// makeRowMembershipOpts() when you have plain row arrays.
// ============================================================================

const AUTO_EXTENSION_CLASS_TARGET = 4; // classes guaranteed per cycle
const AUTO_EXTENSION_MAX_MONTHS = 2;   // max extension past a cycle's natural end

// ===== Local-date helpers (no UTC shift — the studio runs on Europe/Rome) ==
// Parse "YYYY-MM-DD" as LOCAL midnight — avoids UTC timezone shift (e.g. CEST UTC+2)
function parseLocalDate(dateStr) {
    const s = String(dateStr || '').slice(0, 10);
    const parts = s.split('-').map(Number);
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return new Date(NaN);
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

// Format a Date as "YYYY-MM-DD" using LOCAL time (no UTC shift)
function formatLocalDate(date) {
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateInputValue(dateValue) {
    if (dateValue instanceof Date) return formatLocalDate(dateValue);
    const s = String(dateValue || '').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return formatLocalDate(parseLocalDate(s));
}

function formatDisplayDate(dateValue) {
    const date = parseLocalDate(String(dateValue || '').slice(0, 10));
    if (Number.isNaN(date.getTime())) return String(dateValue || '');
    const day = String(date.getDate()).padStart(2, '0');
    const month = date.toLocaleDateString('en', { month: 'short' });
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function addMonthsToDate(dateValue, months) {
    const date = parseLocalDate(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    const originalDay = date.getDate();
    date.setMonth(date.getMonth() + months);
    if (date.getDate() !== originalDay) {
        date.setDate(0);
    }
    return formatLocalDate(date);
}

function addDaysToDate(dateValue, days) {
    const date = parseLocalDate(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    date.setDate(date.getDate() + days);
    return formatLocalDate(date);
}

function getPaymentCycleDates(startDateValue) {
    const startDate = parseLocalDate(startDateValue);
    if (Number.isNaN(startDate.getTime())) return { start: '', end: '' };

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);

    return {
        start: formatLocalDate(startDate),
        end: formatLocalDate(endDate)
    };
}

// Classes run Saturdays and Sundays — the next such date on or after dateStr.
function nextSundayOnOrAfter(dateStr) {
    const date = parseLocalDate(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    for (let i = 0; i < 7; i += 1) {
        if (date.getDay() === 0) return formatLocalDate(date);
        date.setDate(date.getDate() + 1);
    }
    return formatLocalDate(date);
}

// ===== Row-shape tolerant field reads =======================================
function membershipRecordStartDate(record) {
    return String(record?.paid_start_date ?? record?.paidStartDate ?? record?.paidstartdate ?? '').slice(0, 10);
}

function membershipStudentJoinDate(student) {
    return String(student?.joinDate || student?.join_date || student?.joindate || '').slice(0, 10);
}

// This student's paid fee rows, oldest first (by cycle start, falling back to
// paid date). Checks all column-name spellings the app has ever written.
function getStudentPaidRecordsFromRows(studentId, feesRows) {
    return (feesRows || [])
        .filter((record) => String(record.studentid ?? record.studentId ?? record.student_id) === String(studentId))
        .filter((record) => !!(record.ispaid ?? record.isPaid ?? record.is_paid))
        .slice()
        .sort((left, right) => {
            const leftDate = new Date(membershipRecordStartDate(left) || left.paiddate || left.paidDate || left.paid_date || 0).getTime();
            const rightDate = new Date(membershipRecordStartDate(right) || right.paiddate || right.paidDate || right.paid_date || 0).getTime();
            return leftDate - rightDate;
        });
}

// This student's PRESENT attendance rows normalized to { date, isDemo } —
// the input for makeRowMembershipOpts below. One entry per date (duplicate
// rows for the same day count once, matching the dashboard's date-keyed
// map); a date with both a demo and a real row counts as real.
function getStudentAttendanceRows(studentId, attendanceRows) {
    const byDate = new Map();
    (attendanceRows || [])
        .filter((r) => {
            const sid = r.studentId ?? r.student_id ?? r.studentid;
            const present = r.isPresent ?? r.is_present ?? r.ispresent ?? false;
            return String(sid) === String(studentId) && !!present;
        })
        .forEach((r) => {
            const date = String(r.attendanceDate ?? r.attendance_date ?? r.attendancedate ?? r.date ?? '').slice(0, 10);
            if (!date) return;
            const isDemo = !!(r.isdemo ?? r.is_demo ?? r.isDemo ?? false);
            byDate.set(date, (byDate.get(date) === false) ? false : isDemo);
        });
    return Array.from(byDate, ([date, isDemo]) => ({ date, isDemo }));
}

// Builds the engine's `opts` from plain row arrays (public report page).
// The admin dashboard builds its own opts from its in-memory maps instead.
function makeRowMembershipOpts(student, feesRows, studentAttendanceRows) {
    const rows = studentAttendanceRows || [];
    return {
        paidRecords: getStudentPaidRecordsFromRows(student?.id, feesRows),
        nextPaymentOverride: (() => {
            const val = String(student?.nextPaymentDate ?? student?.next_payment_date ?? student?.nextpaymentdate ?? '').trim();
            return val ? val.slice(0, 10) : null;
        })(),
        hasDemoClass: () => rows.some((r) => r.isDemo),
        countAttendanceInRange: (startDate, endDate) => {
            if (!startDate || !endDate) return 0;
            return rows.filter((r) => r.date >= startDate && r.date <= endDate && !r.isDemo).length;
        },
        firstAttendanceAfter: (dateStr) => {
            let earliest = '';
            rows.forEach((r) => {
                if (r.date > dateStr && !r.isDemo) {
                    if (!earliest || r.date < earliest) earliest = r.date;
                }
            });
            return earliest;
        },
        attendedDatesInRange: (startDate, endDate) => rows
            .filter((r) => !r.isDemo && r.date > startDate && r.date <= endDate)
            .map((r) => r.date)
            .sort()
    };
}

// ===== Trust-based membership timeline ======================================
// Cycles run on attendance, not payment: students may pay anytime. The
// timeline walks month-cycles from the student's anchor date; each cycle:
//   - guarantees AUTO_EXTENSION_CLASS_TARGET classes: if fewer were
//     attended, it extends week-by-week up to AUTO_EXTENSION_MAX_MONTHS
//     past its natural end (classes during the extension count),
//   - chains: the next cycle starts the day after the previous cycle's
//     effective (possibly extended) end,
//   - if it ends incomplete AND unpaid, the plan PAUSES — no new cycles
//     (no debt piles up) until the student attends again; his attended
//     classes carry over into the cycle that starts the day he returns,
//   - is "owed" only when complete (got its classes / full month with
//     enough classes) and unpaid.
// Recorded payments pin their cycles to the recorded start dates, so
// history always matches what the admin registered.
function buildMembershipTimeline(student, opts) {
    const empty = { cycles: [], current: null, paused: false, owedCycles: [], unmatchedRecords: [], awaitingFirstClass: false };
    if (!student) return empty;

    const joinDate = membershipStudentJoinDate(student);
    const paidRecords = opts.paidRecords || [];

    // Anchor priority: first paid record's start › genuine cycle-start
    // override › (for students whose first class was a free demo) the first
    // NON-demo attended class › join date. nextPaymentDate auto-set to
    // joinDate+1month at registration is NOT a user override.
    let anchor;
    if (paidRecords.length > 0) {
        const firstRecordStart = membershipRecordStartDate(paidRecords[0]);
        anchor = firstRecordStart || joinDate;
    } else {
        const override = opts.nextPaymentOverride;
        const autoDefault = joinDate ? addMonthsToDate(joinDate, 1) : '';
        if (override && override !== autoDefault) {
            anchor = override;
        } else if (opts.hasDemoClass()) {
            // Demo taken: the plan starts on their first real class.
            anchor = opts.firstAttendanceAfter('');
            if (!anchor) return { ...empty, awaitingFirstClass: true };
        } else {
            anchor = joinDate;
        }
    }
    if (!anchor) return empty;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatLocalDate(today);

    const cycles = [];
    let start = anchor;
    let carry = 0;
    let recordIndex = 0;
    let paused = false;
    let current = null;

    for (let guard = 0; guard < 240 && start; guard += 1) {
        // A recorded payment around this cycle pins it to the recorded start.
        let record = null;
        if (recordIndex < paidRecords.length) {
            const candidate = paidRecords[recordIndex];
            const candidateStart = membershipRecordStartDate(candidate);
            const chainNaturalEnd = getPaymentCycleDates(start).end;
            if (!candidateStart) {
                record = candidate; // paidAtRegistration-style record without dates
                recordIndex += 1;
            } else if (chainNaturalEnd && candidateStart <= chainNaturalEnd) {
                record = candidate;
                recordIndex += 1;
                start = candidateStart;
            }
        }

        const naturalEnd = getPaymentCycleDates(start).end;
        if (!naturalEnd) break;

        let attended = carry + opts.countAttendanceInRange(start, naturalEnd);
        let effectiveEnd = naturalEnd;
        if (attended < AUTO_EXTENSION_CLASS_TARGET) {
            const maxEnd = addMonthsToDate(naturalEnd, AUTO_EXTENSION_MAX_MONTHS);
            // The cycle ends exactly on whichever real attended class reaches
            // the target — never rounded up to a week boundary.
            const extraDates = opts.attendedDatesInRange(naturalEnd, maxEnd);
            let completedOn = '';
            for (const date of extraDates) {
                attended += 1;
                if (attended >= AUTO_EXTENSION_CLASS_TARGET) { completedOn = date; break; }
            }
            if (completedOn) {
                effectiveEnd = completedOn;
            } else if (todayStr < maxEnd) {
                // Still open — classes run weekends, so the rolling deadline
                // is the coming Sunday, not the theoretical 2-month max.
                const reference = todayStr > naturalEnd ? todayStr : naturalEnd;
                const nextSunday = nextSundayOnOrAfter(addDaysToDate(reference, 1));
                effectiveEnd = nextSunday > maxEnd ? maxEnd : nextSunday;
            } else {
                effectiveEnd = maxEnd; // window fully elapsed without reaching target
            }
        }

        const cycle = {
            start,
            naturalEnd,
            effectiveEnd,
            attended,
            carriedIn: carry,
            paid: !!record,
            record,
            complete: attended >= AUTO_EXTENSION_CLASS_TARGET
        };
        cycles.push(cycle);

        if (todayStr <= effectiveEnd) {
            current = cycle;
            break;
        }

        if (cycle.paid || cycle.complete) {
            start = addDaysToDate(effectiveEnd, 1);
            carry = 0;
            continue;
        }

        // Incomplete unpaid cycle: don't stack up new debt. His attended
        // classes carry over; the next cycle starts the day he returns.
        const returnDate = opts.firstAttendanceAfter(effectiveEnd);
        if (!returnDate) {
            paused = true;
            break;
        }
        carry = attended;
        start = returnDate;
    }

    const owedCycles = cycles.filter((cycle) => cycle.complete && !cycle.paid);
    // Payments recorded for cycles beyond the walk (e.g. paid in advance)
    const unmatchedRecords = paidRecords.slice(recordIndex);
    return { cycles, current, paused, owedCycles, unmatchedRecords, awaitingFirstClass: false };
}

// Extension state of the membership's current (or last, if paused) cycle.
// Applies to paid AND unpaid cycles alike — students pay on trust.
function buildAutoExtension(student, opts) {
    const none = { isExtended: false, attendedCount: 0, carriedIn: 0, effectiveEndDate: '', weeksUsed: 0, naturalEndDate: '', paused: false, owedCount: 0, awaitingFirstClass: false };
    const timeline = buildMembershipTimeline(student, opts);
    const cycle = timeline.current || timeline.cycles[timeline.cycles.length - 1] || null;
    if (!cycle) return { ...none, awaitingFirstClass: timeline.awaitingFirstClass };

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const naturalEnd = parseLocalDate(cycle.naturalEnd);
    const effectiveEnd = parseLocalDate(cycle.effectiveEnd);
    const isExtended = !timeline.paused
        && !Number.isNaN(naturalEnd.getTime()) && !Number.isNaN(effectiveEnd.getTime())
        && now > naturalEnd && now <= effectiveEnd;
    const weeksUsed = isExtended ? Math.ceil((now - naturalEnd) / (7 * 86400000)) : 0;

    // Fees are collected in advance, so the current cycle counts as owed
    // too even before it's "complete" by the attendance rule — that rule
    // only governs when a cycle becomes overdue, not whether it's due.
    const currentCycleAlsoOwed = !cycle.paid && !timeline.owedCycles.includes(cycle);
    const owedCount = timeline.owedCycles.length + (currentCycleAlsoOwed ? 1 : 0);

    return {
        isExtended,
        attendedCount: cycle.attended,
        carriedIn: cycle.carriedIn,
        effectiveEndDate: cycle.effectiveEnd,
        weeksUsed,
        naturalEndDate: cycle.naturalEnd,
        paused: timeline.paused,
        owedCount,
        awaitingFirstClass: false
    };
}

// "Active/paid" = the membership cycle containing today has been paid for.
function computePaymentActive(student, opts) {
    const timeline = buildMembershipTimeline(student, opts);
    if (timeline.current && timeline.current.paid) return true;

    // Manual "Extend Plan" override still wins for students who have paid
    // at least once (for never-paid students the override is the cycle
    // anchor, not an extension).
    const override = opts.nextPaymentOverride;
    if (override && (opts.paidRecords || []).length > 0) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const overrideEnd = parseLocalDate(addDaysToDate(override, -1));
        if (!Number.isNaN(overrideEnd.getTime()) && now <= overrideEnd) return true;
    }

    return false;
}
