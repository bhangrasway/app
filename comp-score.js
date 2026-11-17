// ===== Bhangra Competition: scoring (shared by comp.html and the tests) =====
// Rules (agreed with the coach, see comp/manifesto.pdf):
//   * 3 judges, every criterion 1–10 with halves; a score is the judges' average.
//   * Solo = energy + technique + rhythm + expression (max 40).
//   * Group = sync + formations + energy + technique + costume (max 50).
//   * Solo and group are separate competitions (coach, 2026-11-17):
//       - Team score = the group round only, as a % (group / 50 × 100).
//       - Solo has its own ranking per category (solo total /40), 1st/2nd/3rd for dancers.
//   * No special awards (Best Solo / Expression / Costume): the solo positions replace them.
//   * Option 1: exact ranking, equal scores share the position.
//     Option 2: within `gap` points of the top of the group share the position
//     (admin only, gap changeable on the day).
(function (root) {
    const SOLO_CRITERIA = ['energy', 'technique', 'rhythm', 'expression'];
    const SOLO_EXTRA = [];   // costume is no longer scored in the solo
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

    // slots: [{id, kind:'solo'|'group', category, team_id, name, status}]
    // scores: {slotId: {1:{...}, 2:{...}, 3:{...}}}
    // teams: [{id, name, category}]
    function computeResults({ slots, scores, teams, gap = 1 }) {
        const teamName = (id) => (id == null ? '' : (teams.find((t) => t.id === id) || {}).name || '?');
        const out = {};
        ['B', 'A'].forEach((cat) => {
            const solos = slots.filter((s) => s.kind === 'solo' && s.category === cat).map((s) => {
                const a = averageCriteria(scores[s.id], SOLO_CRITERIA.concat(SOLO_EXTRA));
                const soloTotal = r2(SOLO_CRITERIA.reduce((x, c) => x + a.avg[c], 0));
                return {
                    slotId: s.id, name: s.name, teamId: s.team_id, teamName: teamName(s.team_id),
                    disqualified: s.status === 'disqualified', complete: a.complete, judges: a.judges,
                    soloTotal, solo100: r2(soloTotal / 40 * 100),
                    expression: r2(a.avg.expression), criteria: a.avg
                };
            });
            const teamRows = teams.filter((t) => t.category === cat).map((t) => {
                const gslot = slots.find((s) => s.kind === 'group' && s.team_id === t.id);
                const g = averageCriteria(gslot ? scores[gslot.id] : {}, GROUP_CRITERIA);
                const group = r2(GROUP_CRITERIA.reduce((x, c) => x + g.avg[c], 0));
                const group100 = r2(group / 50 * 100);
                return {
                    teamId: t.id, name: t.name, group, group100,
                    score: group100,   // team = group round only
                    disqualified: !!(gslot && gslot.status === 'disqualified'),
                    complete: !!gslot && g.complete
                };
            });
            const ranked = teamRows.filter((t) => !t.disqualified).sort((a, b) => b.score - a.score);
            rankOption1(ranked);
            rankOption2(ranked, gap);
            // Solo ranking: its own positions (same tie / gap rules, on the solo %).
            const soloRanked = solos.filter((x) => !x.disqualified && x.judges > 0)
                .sort((a, b) => b.soloTotal - a.soloTotal || b.expression - a.expression);
            soloRanked.forEach((x) => { x.score = x.solo100; });
            rankOption1(soloRanked);
            rankOption2(soloRanked, gap);
            out[cat] = {
                solos: solos.sort((a, b) => b.soloTotal - a.soloTotal || b.expression - a.expression),
                teams: ranked.concat(teamRows.filter((t) => t.disqualified))
            };
        });
        return out;
    }

    // Lottery running order for one category: shuffled, then fixed so two
    // dancers of the same team never dance one after the other (when possible).
    // A solo-only dancer (no team) counts as a team of one.
    const teamKey = (x) => (x.team_id == null ? 'solo' + x.id : String(x.team_id));
    function lotteryOrder(items, rand) {
        const rnd = rand || Math.random;
        const left = items.slice();
        for (let i = left.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [left[i], left[j]] = [left[j], left[i]]; }
        const out = [];
        while (left.length) {
            const last = out.length ? teamKey(out[out.length - 1]) : undefined;
            const counts = {};
            left.forEach((x) => { counts[teamKey(x)] = (counts[teamKey(x)] || 0) + 1; });
            // A team holding more than half of what is left must go now, or
            // it would end up dancing back to back later.
            const must = Object.keys(counts).find((k) => counts[k] * 2 > left.length && last !== k);
            let idx = must !== undefined ? left.findIndex((x) => teamKey(x) === must) : left.findIndex((x) => teamKey(x) !== last);
            if (idx < 0) idx = 0; // only one team left: nothing else possible
            out.push(left.splice(idx, 1)[0]);
        }
        return out;
    }

    // Full day (coach, 2026-11-17): B solos (a judges break every 11) → A solos →
    // the extra, non-competitive activities → B groups → A groups.
    // entries: {id, do_solo, do_group, do_activity, category, team_id}
    function buildRunningOrder({ entries, teams, rand, breakEvery = 11 }) {
        const slots = [];
        let pos = 1;
        const n = { A: 0, B: 0 };
        const push = (s) => slots.push({ position: pos++, ...s });
        const code = (cat) => `${cat}-${String(++n[cat]).padStart(2, '0')}`;
        ['B', 'A'].forEach((cat) => {
            const solos = lotteryOrder(entries.filter((e) => e.do_solo && e.category === cat), rand);
            solos.forEach((e, i) => {
                if (i > 0 && i % breakEvery === 0) push({ kind: 'break', category: cat, label: 'Judges break', minutes: 5 });
                push({ kind: 'solo', category: cat, entry_id: e.id, code: code(cat) });
            });
            if (solos.length) push({ kind: 'break', category: cat, label: 'Break', minutes: 5 });
        });
        if (entries.some((e) => e.do_activity)) {
            push({ kind: 'kids', category: null, label: 'Extra activities (not a competition)' });
            push({ kind: 'break', category: null, label: 'Break', minutes: 10 });
        }
        ['B', 'A'].forEach((cat, ci) => {
            const cats = teams.filter((t) => t.category === cat);
            lotteryOrder(cats.map((t) => ({ ...t, team_id: t.id })), rand)
                .forEach((t) => push({ kind: 'group', category: cat, team_id: t.id, code: code(cat) }));
            if (ci === 0 && cats.length) push({ kind: 'break', category: null, label: 'Break', minutes: 5 });
        });
        return slots;
    }

    // Trophies: one per person. Every win = a big trophy: a solo podium place, or a
    // podium place of a team (each member of the team gets one). Everyone else takes
    // one small trophy; a winner never also gets a small one.
    // results = computeResults(...); people = [{id, name}];
    // groupMembers = {teamId: [personId, ...]}; soloPerson = {slotId: personId}
    function computeTrophies({ results, option = 1, people, groupMembers, soloPerson }) {
        const pos = (r) => (option === 2 ? r.opt2 : r.opt1);
        const big = [];
        ['B', 'A'].forEach((cat) => {
            (results[cat].solos || []).filter((x) => x.opt1 && pos(x) <= 3)
                .forEach((x) => big.push({ person: soloPerson[x.slotId], why: `Solo ${pos(x)}${['st', 'nd', 'rd'][pos(x) - 1]} (${cat})` }));
            (results[cat].teams || []).filter((t) => !t.disqualified && pos(t) <= 3)
                .forEach((t) => (groupMembers[t.teamId] || []).forEach((pid) => big.push({ person: pid, why: `Group ${pos(t)}${['st', 'nd', 'rd'][pos(t) - 1]} (${t.name})` })));
        });
        const winners = new Set(big.map((b) => b.person));
        const small = people.filter((p) => !winners.has(p.id));
        return { big, small, people: people.length, winners: winners.size };
    }

    const api = { SOLO_CRITERIA, SOLO_EXTRA, GROUP_CRITERIA, computeResults, lotteryOrder, buildRunningOrder, computeTrophies, r1 };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.CompScore = api;
})(typeof window !== 'undefined' ? window : globalThis);
