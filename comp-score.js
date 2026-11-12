// ===== Bhangra Competition: scoring (shared by comp.html and the tests) =====
// Rules (agreed with the coach, see comp/manifesto.pdf):
//   * 3 judges, every criterion 1–10 with halves; a score is the judges' average.
//   * Solo = energy + technique + rhythm + expression (max 40). Costume is
//     scored too but only decides Best Costume.
//   * Group = sync + formations + energy + technique + costume (max 50).
//   * Team = 40% of the team's solo average (%) + 60% of the group (%).
//   * Option 1: exact ranking, equal scores share the position.
//     Option 2: teams within `gap` points of the group's top share the position
//     (admin only, gap changeable on the day).
//   * Special awards per category, one per dancer: Best Solo → Best Expression
//     → Best Costume. Best Solo tie: the higher expression gets Best
//     Expression, the other Best Solo. Other ties: higher solo total, then
//     higher expression; shared only if everything is equal.
//   * Extras (switch): Best Solo runner-up, Best Costume runner-up, to the
//     next best dancers without an award.
(function (root) {
    const SOLO_CRITERIA = ['energy', 'technique', 'rhythm', 'expression'];
    const SOLO_EXTRA = ['costume'];
    const GROUP_CRITERIA = ['sync', 'formations', 'energy', 'technique', 'costume'];
    const r2 = (x) => Math.round(x * 100) / 100;
    const r1 = (x) => Math.round(x * 10) / 10;

    // judges: {1:{energy:8,...}, 2:{...}} → average per criterion over the
    // judges that scored it.
    function averageCriteria(judges, criteria) {
        const out = {};
        let complete = true;
        criteria.forEach((c) => {
            const vals = Object.values(judges || {}).map((j) => j && j[c]).filter((v) => typeof v === 'number');
            if (vals.length < 3) complete = false;
            out[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        });
        return { avg: out, complete, judges: Object.keys(judges || {}).length };
    }

    function rankOption1(rows) {
        let pos = 0, prev = null;
        rows.forEach((r, i) => { if (prev === null || r.score !== prev) pos = i + 1; r.opt1 = pos; prev = r.score; });
    }
    // Groups by distance from the group's top score; positions are 1,2,3… per group.
    function rankOption2(rows, gap) {
        let pos = 0, top = null;
        rows.forEach((r) => { if (top === null || r2(top - r.score) > gap) { pos++; top = r.score; } r.opt2 = pos; });
    }

    function pickAwards(solos, extrasOn) {
        const pool = solos.filter((s) => !s.disqualified && s.judges > 0);
        const won = new Set();
        const awards = [];
        const give = (award, list, note) => list.forEach((d) => { won.add(d.slotId); awards.push({ award, slotId: d.slotId, name: d.name, team: d.teamName, note }); });
        const best = (key, tb) => {
            const left = pool.filter((d) => !won.has(d.slotId));
            if (!left.length) return [];
            left.sort((a, b) => b[key] - a[key] || tb.reduce((r, k) => r || b[k] - a[k], 0));
            return left.filter((d) => d[key] === left[0][key] && tb.every((k) => d[k] === left[0][k]));
        };
        const soloTop = Math.max(...pool.map((d) => d.soloTotal), -Infinity);
        const tied = pool.filter((d) => d.soloTotal === soloTop).sort((a, b) => b.expression - a.expression);
        if (tied.length > 1 && tied[0].expression > tied[1].expression) {
            give('Best Expression', [tied[0]], 'tied for Best Solo, higher expression');
            give('Best Solo', best('soloTotal', ['expression']), 'tied for Best Solo');
        } else {
            give('Best Solo', best('soloTotal', ['expression']));
            give('Best Expression', best('expression', ['soloTotal']));
        }
        give('Best Costume', best('costume', ['soloTotal', 'expression']));
        if (extrasOn) {
            give('Best Solo runner-up', best('soloTotal', ['expression']));
            give('Best Costume runner-up', best('costume', ['soloTotal', 'expression']));
        }
        const order = ['Best Solo', 'Best Expression', 'Best Costume', 'Best Solo runner-up', 'Best Costume runner-up'];
        return awards.sort((a, b) => order.indexOf(a.award) - order.indexOf(b.award));
    }

    // slots: [{id, kind:'solo'|'group', category, team_id, name, status}]
    // scores: {slotId: {1:{...}, 2:{...}, 3:{...}}}
    // teams: [{id, name, category}]
    function computeResults({ slots, scores, teams, gap = 1, extrasOn = false }) {
        const teamName = (id) => (teams.find((t) => t.id === id) || {}).name || '?';
        const out = {};
        ['B', 'A'].forEach((cat) => {
            const solos = slots.filter((s) => s.kind === 'solo' && s.category === cat).map((s) => {
                const a = averageCriteria(scores[s.id], SOLO_CRITERIA.concat(SOLO_EXTRA));
                const soloTotal = r2(SOLO_CRITERIA.reduce((x, c) => x + a.avg[c], 0));
                return {
                    slotId: s.id, name: s.name, teamId: s.team_id, teamName: teamName(s.team_id),
                    disqualified: s.status === 'disqualified', complete: a.complete, judges: a.judges,
                    soloTotal, solo100: r2(soloTotal / 40 * 100),
                    expression: r2(a.avg.expression), costume: r2(a.avg.costume), criteria: a.avg
                };
            });
            const teamRows = teams.filter((t) => t.category === cat).map((t) => {
                const mine = solos.filter((s) => s.teamId === t.id && !s.disqualified && s.judges > 0);
                const gslot = slots.find((s) => s.kind === 'group' && s.team_id === t.id);
                const g = averageCriteria(gslot ? scores[gslot.id] : {}, GROUP_CRITERIA);
                const group = r2(GROUP_CRITERIA.reduce((x, c) => x + g.avg[c], 0));
                const soloAvg = mine.length ? r2(mine.reduce((x, s) => x + s.solo100, 0) / mine.length) : 0;
                const group100 = r2(group / 50 * 100);
                return {
                    teamId: t.id, name: t.name, soloCount: mine.length, soloAvg, group, group100,
                    score: r2(0.4 * soloAvg + 0.6 * group100),
                    disqualified: !!(gslot && gslot.status === 'disqualified'),
                    complete: !!gslot && g.complete && mine.every((s) => s.complete)
                };
            });
            const ranked = teamRows.filter((t) => !t.disqualified).sort((a, b) => b.score - a.score || b.group100 - a.group100);
            rankOption1(ranked);
            rankOption2(ranked, gap);
            out[cat] = {
                solos: solos.sort((a, b) => b.soloTotal - a.soloTotal || b.expression - a.expression),
                teams: ranked.concat(teamRows.filter((t) => t.disqualified)),
                awards: pickAwards(solos, extrasOn)
            };
        });
        return out;
    }

    // Lottery running order for one category: shuffled, then fixed so two
    // dancers of the same team never dance one after the other (when possible).
    function lotteryOrder(items, rand) {
        const rnd = rand || Math.random;
        const left = items.slice();
        for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
        const out = [];
        while (left.length) {
            const last = out.length ? out[out.length - 1].team_id : undefined;
            const counts = {};
            left.forEach((x) => { counts[x.team_id] = (counts[x.team_id] || 0) + 1; });
            // A team holding more than half of what is left must go now, or
            // it would end up dancing back to back later.
            const must = Object.keys(counts).find((k) => counts[k] * 2 > left.length && String(last) !== k);
            let idx = must !== undefined ? left.findIndex((x) => String(x.team_id) === must) : left.findIndex((x) => x.team_id !== last);
            if (idx < 0) idx = 0; // only one team left: nothing else possible
            out.push(left.splice(idx, 1)[0]);
        }
        return out;
    }

    // Full day: B solos (break every 11) → B groups → break → A solos → A groups → kids show.
    function buildRunningOrder({ entries, teams, rand, breakEvery = 11 }) {
        const slots = [];
        let pos = 1;
        const push = (s) => slots.push({ position: pos++, ...s });
        ['B', 'A'].forEach((cat, ci) => {
            const solos = lotteryOrder(entries.filter((e) => e.kind === 'compete' && e.category === cat && e.team_id), rand);
            let n = 0;
            solos.forEach((e, i) => {
                if (i > 0 && i % breakEvery === 0) push({ kind: 'break', category: cat, label: 'Judges break', minutes: 5 });
                push({ kind: 'solo', category: cat, entry_id: e.id, code: `${cat}-${String(++n).padStart(2, '0')}` });
            });
            if (solos.length) push({ kind: 'break', category: cat, label: 'Break', minutes: 5 });
            lotteryOrder(teams.filter((t) => t.category === cat).map((t) => ({ ...t, team_id: t.id })), rand)
                .forEach((t) => push({ kind: 'group', category: cat, team_id: t.id, code: `${cat}-${String(++n).padStart(2, '0')}` }));
            if (ci === 0) push({ kind: 'break', category: null, label: 'Break', minutes: 15 });
        });
        if (entries.some((e) => e.kind === 'kids_show')) push({ kind: 'kids', category: null, label: 'Kids special show' });
        return slots;
    }

    const api = { SOLO_CRITERIA, SOLO_EXTRA, GROUP_CRITERIA, computeResults, lotteryOrder, buildRunningOrder, r1 };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CompScore = api;
})(typeof window !== 'undefined' ? window : globalThis);
