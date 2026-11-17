// ===== Bhangra Competition (competition.sql) — admin panel =====
// Lives at the top of the Performances tab. Registrations come from
// member.html (register_competition_by_phone) or are added here by hand.
// Flow: check categories → Make teams → move dancers by hand → Lock teams
// (charges the fee as an 'extra_charge' row, like the Charge students tool).
//
// Uses admin.html globals: supabaseClient, students, locations,
// v2CreditTransactions, recomputeV2Balance, escapeHtml, getBatchDisplayLabel,
// isStudentActive, renderStudentsList, renderPaymentsList.

// ---------- pure helpers (also loaded by the Node tests) ----------
const COMP_TEAM_SIZE = 6;

// An entry has three independent ticks: solo, group, extra activity.
// kind stays 'compete' when solo or group is ticked, else 'kids_show' (old column).
function compKindFor(solo, group) { return solo || group ? 'compete' : 'kids_show'; }
// The fee is one per person (€20), however many things are ticked. Free under 9.
// Someone who ONLY does the extra activity is not charged by the app: the coach
// marks them Paid / Not paid by hand.
function compNeedsFee(entry, student) {
    if (entry.withdrawn || !(entry.do_solo || entry.do_group)) return false;
    const age = Number(student && student.age);
    return !(Number.isFinite(age) && age > 0 && age < 9);
}
// Trophies: one per person. A win = a big trophy (a solo podium place, or a place
// in a podium team: each member of the team gets one). Everyone else = one small.
// A winner never also gets a small. Returns {people, big, small, winners}.
function compTrophyCount({ people, soloWins, groupWins }) {
    const winnerPeople = new Set([...soloWins.map((w) => w.person), ...groupWins.map((w) => w.person)]);
    const big = soloWins.length + groupWins.length;
    return { people: people.length, big, small: people.filter((p) => !winnerPeople.has(p)).length, winners: winnerPeople.size };
}

// A = Advance + Intermediate, B = Beginners. Only a default: the coach
// changes any dancer's category in the list.
function compDefaultCategory(batchName) {
    return /advan|avanz|interm/i.test(String(batchName || '')) ? 'A' : 'B';
}
// Strength used to spread levels evenly: advanced > intermediate > beginner,
// then older first.
function compStrength(s) {
    const b = String(s.batch || '');
    const level = /advan|avanz/i.test(b) ? 2 : /interm/i.test(b) ? 1 : 0;
    return level * 100 + (Number(s.age) || 0);
}
function compPhoneDigits(p) { return String(p || '').replace(/\D/g, '').slice(-9); }
// Splits dancers into balanced teams of about COMP_TEAM_SIZE. Strongest
// first, each dancer goes to the team with the fewest dancers of the same
// level so far (then the smallest, then the weakest), so every team gets
// the same mix of levels. (Brothers and sisters may be in the same team.)
function compMakeTeams(dancers, teamSize) {
    const size = teamSize || COMP_TEAM_SIZE;
    const n = Math.max(1, Math.round(dancers.length / size));
    const teams = Array.from({ length: n }, () => []);
    const sorted = [...dancers].sort((a, b) => compStrength(b) - compStrength(a) || String(a.name).localeCompare(String(b.name)));
    const cap = Math.ceil(dancers.length / n);
    const level = (d) => Math.floor(compStrength(d) / 100);
    const sum = (t) => t.reduce((x, m) => x + compStrength(m), 0);
    sorted.forEach((d) => {
        const lv = level(d);
        const rank = teams.map((t, k) => k).sort((x, y) =>
            teams[x].filter((m) => level(m) === lv).length - teams[y].filter((m) => level(m) === lv).length
            || teams[x].length - teams[y].length
            || sum(teams[x]) - sum(teams[y]) || x - y);
        const pick = rank.find((k) => teams[k].length < cap) ?? rank[0];
        teams[pick].push(d);
    });
    return teams;
}

if (typeof module !== 'undefined') {
    module.exports = { compDefaultCategory, compStrength, compMakeTeams, compKindFor, compNeedsFee, compTrophyCount };
}

// ---------- admin panel ----------
let compEvent = null;
let compTeams = [];
let compEntries = [];
let compBusy = false;
let compPins = null;
let compCoupons = null;   // null = competition_coupons.sql not run yet

function compStudent(id) { return (typeof students !== 'undefined' ? students : []).find((s) => s.id === id); }
function compLocationName(id) {
    const l = (typeof locations !== 'undefined' ? locations : []).find((x) => x.id === id);
    return l ? l.name : '';
}
function compIsCremona(locationId) {
    const name = compLocationName(locationId);
    return !name || /cremona/i.test(name);
}
function compActiveEntries() { return compEntries.filter((e) => !e.withdrawn); }

async function loadCompetitionAdmin() {
    const box = document.getElementById('compAdmin');
    if (!box) return;
    const { data: ev, error } = await supabaseClient.from('comp_events').select('*')
        .neq('status', 'finished').order('created_at', { ascending: false }).limit(1);
    if (error) {
        console.error('comp_events load failed (has competition.sql been run?):', error);
        box.innerHTML = `<p style="color:var(--ink-faint); font-size:0.88em;">Competition: run <b>competition.sql</b> in Supabase first.</p>`;
        return;
    }
    compEvent = (ev || [])[0] || null;
    if (!compEvent) { box.innerHTML = ''; return; }
    const [t, e] = await Promise.all([
        supabaseClient.from('comp_teams').select('*').eq('event_id', compEvent.id).order('category').order('sort_order'),
        supabaseClient.from('comp_entries').select('*').eq('event_id', compEvent.id).order('created_at')
    ]);
    if (t.error || e.error) { console.error('comp load failed:', t.error || e.error); return; }
    compTeams = t.data || [];
    compEntries = e.data || [];
    const p = await supabaseClient.from('comp_pins').select('*').eq('event_id', compEvent.id);
    compPins = p.error ? null : (p.data || []);   // null = competition_live.sql not run yet
    const cp = await supabaseClient.from('comp_coupons').select('*').eq('event_id', compEvent.id).order('id');
    compCoupons = cp.error ? null : (cp.data || []);
    renderCompetitionAdmin();
}

function compStatusLabel(status) {
    return { registration: 'Registration open', locked: 'Teams locked', live: 'Live', finished: 'Finished' }[status] || status;
}
function compFmtDate(d) { if (!d) return '—'; const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}`; }

// Volunteer jobs (keys match the database and the student app)
const COMP_VOL_ROLES = { backstage: 'Backstage', music: 'Music', stage: 'On stage', mic: 'On the mic' };
function compRolesText(e) { return (e.volunteer_roles || []).map((r) => COMP_VOL_ROLES[r] || r).join(', '); }
function compVolunteers() { return compActiveEntries().filter((x) => x.do_volunteer); }
// People who take part in something (volunteer-only people are not participants: no fee, no trophy)
function compParticipants() { return compActiveEntries().filter((x) => x.do_solo || x.do_group || x.do_activity); }
function compSolos() { return compActiveEntries().filter((x) => x.do_solo); }
function compGroupers() { return compActiveEntries().filter((x) => x.do_group); }
function compActivities() { return compActiveEntries().filter((x) => x.do_activity); }
function compIsActivityOnly(x) { return x.do_activity && !x.do_solo && !x.do_group; }

// How many trophies to buy: one per person, winners get a big one.
function compTrophyEstimate() {
    const people = compParticipants();
    const maxBig = ['A', 'B'].reduce((sum, cat) => {
        const solos = compSolos().filter((x) => x.category === cat).length;
        const sizes = compTeams.filter((t) => t.category === cat)
            .map((t) => compGroupers().filter((x) => x.team_id === t.id).length).sort((a, b) => b - a).slice(0, 3);
        return sum + Math.min(3, solos) + sizes.reduce((a, b) => a + b, 0);
    }, 0);
    return { people: people.length, maxBig };
}

function renderCompetitionAdmin() {
    const box = document.getElementById('compAdmin');
    const ev = compEvent;
    const active = compActiveEntries();
    const solos = compSolos(), groupers = compGroupers(), acts = compActivities();
    const locked = ev.status !== 'registration';
    const countCat = (list, cat) => list.filter((x) => x.category === cat).length;
    const noCat = active.filter((x) => (x.do_solo || x.do_group) && !x.category).length;
    const feeEntries = active.filter((x) => compNeedsFee(x, compStudent(x.student_id)));
    const charged = feeEntries.filter((x) => x.fee_tx_id).length;
    const tr = compTrophyEstimate();

    const teamOptions = (entry) => {
        const opts = compTeams.filter((tm) => tm.category === entry.category)
            .map((tm) => `<option value="${tm.id}" ${entry.team_id === tm.id ? 'selected' : ''}>${escapeHtml(tm.name)}</option>`).join('');
        return `<select onchange="compSetTeam(${entry.id}, this.value)" ${compBusy ? 'disabled' : ''} style="padding:4px 6px; font-size:0.85em;"><option value="">—</option>${opts}</select>`;
    };
    const tick = (entry, key) => `<input type="checkbox" ${entry[key] ? 'checked' : ''} ${compBusy || entry.withdrawn ? 'disabled' : ''} onchange="compSetFlag(${entry.id}, '${key}', this.checked)" style="width:16px; height:16px;">`;
    const row = (entry) => {
        const s = compStudent(entry.student_id) || { name: `#${entry.student_id}` };
        const needsCat = entry.do_solo || entry.do_group;
        const catSel = !needsCat ? '<span style="color:var(--ink-faint);">—</span>'
            : `<select onchange="compSetCategory(${entry.id}, this.value)" ${compBusy || entry.fee_tx_id ? 'disabled' : ''} style="padding:4px 6px; font-size:0.85em;">
                <option value="" ${!entry.category ? 'selected' : ''}>—</option>
                <option value="A" ${entry.category === 'A' ? 'selected' : ''}>A</option>
                <option value="B" ${entry.category === 'B' ? 'selected' : ''}>B</option></select>`;
        const age = Number(s.age);
        const feeCell = entry.fee_tx_id ? `<span style="color:var(--success); font-weight:600;">€${Number(ev.fee)} paid</span>`
            : compIsActivityOnly(entry)
                ? `<select onchange="compSetActivityPaid(${entry.id}, this.value)" ${compBusy ? 'disabled' : ''} style="padding:4px 6px; font-size:0.85em;" title="Extra activity only: the app does not charge, you mark it"><option value="">paid? —</option><option value="paid" ${entry.activity_paid === 'paid' ? 'selected' : ''}>Paid student</option><option value="unpaid" ${entry.activity_paid === 'unpaid' ? 'selected' : ''}>Not paid</option></select>`
                : (Number.isFinite(age) && age > 0 && age < 9 ? '<span style="color:var(--ink-faint);">free (under 9)</span>' : '');
        return `<tr style="${entry.withdrawn ? 'opacity:0.45;' : ''}">
            <td style="padding:6px 8px; font-weight:600;">${escapeHtml(s.name)}${entry.withdrawn ? ' <span style="font-weight:400; color:var(--danger);">(cancelled)</span>' : ''}</td>
            <td style="padding:6px 8px; color:var(--ink-soft);">${s.age ?? '—'}</td>
            <td style="padding:6px 8px; color:var(--ink-soft);">${escapeHtml(compLocationName(s.locationId) || '—')}</td>
            <td style="padding:6px 8px; color:var(--ink-soft);">${escapeHtml(s.batch ? getBatchDisplayLabel(s.batch) : '—')}</td>
            <td style="padding:6px 4px; text-align:center;">${tick(entry, 'do_solo')}</td>
            <td style="padding:6px 4px; text-align:center;">${tick(entry, 'do_group')}</td>
            <td style="padding:6px 4px; text-align:center;">${tick(entry, 'do_activity')}</td>
            <td style="padding:6px 4px; text-align:center; white-space:nowrap;">${tick(entry, 'do_volunteer')}${entry.do_volunteer ? ` <span onclick="compEditRoles(${entry.id})" title="Change the jobs" style="cursor:pointer; font-size:0.78em; color:var(--accent); font-weight:700;">${escapeHtml(compRolesText(entry) || 'pick job')}</span>` : ''}</td>
            <td style="padding:6px 8px;">${catSel}</td>
            <td style="padding:6px 8px;">${entry.do_group && !entry.withdrawn ? teamOptions(entry) : ''}</td>
            <td style="padding:6px 8px; white-space:nowrap;">${feeCell}</td>
            <td style="padding:6px 8px; white-space:nowrap;">${entry.do_solo && !entry.withdrawn ? compSongCell('solo', entry.id, entry.solo_song_path, entry.solo_song_seconds) : ''}</td>
            <td style="padding:6px 8px; text-align:right;">${entry.withdrawn
                ? `<button class="btn btn-outline btn-sm" onclick="compRestore(${entry.id})">Restore</button>`
                : `<button class="btn btn-outline btn-sm" onclick="compWithdraw(${entry.id})">Remove</button>`}</td>
        </tr>`;
    };
    const teamsSummary = compTeams.map((tm) => {
        const members = groupers.filter((x) => x.team_id === tm.id).map((x) => (compStudent(x.student_id) || {}).name || '?');
        return `<div style="border:1px solid var(--border-soft); border-radius:var(--radius-sm); padding:8px 10px; min-width:170px; flex:1;">
            <div style="font-weight:700;">${escapeHtml(tm.name)} <span style="color:var(--ink-faint); font-weight:500;">· ${tm.category} · ${members.length}</span></div>
            <div style="color:var(--ink-soft); font-size:0.82em; margin-top:4px;">${members.map(escapeHtml).join(', ') || '—'}</div>
            <div style="font-size:0.82em; margin-top:6px;">Group song: ${compSongCell('group', tm.id, tm.group_song_path, tm.group_song_seconds)}</div></div>`;
    }).join('');
    const sorted = [...compEntries].sort((a, b) => (a.withdrawn - b.withdrawn)
        || String(a.category || 'Z').localeCompare(String(b.category || 'Z'))
        || String((compStudent(a.student_id) || {}).name || '').localeCompare(String((compStudent(b.student_id) || {}).name || '')));
    const stat = (label, val) => `<span>${label}: <b>${val}</b></span>`;

    box.innerHTML = `
    <div class="card" style="padding:18px 20px; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
                <h3 style="font-size:1.05em; margin:0;">${escapeHtml(ev.title)}</h3>
                <div style="color:var(--ink-soft); font-size:0.85em; margin-top:3px;">${compStatusLabel(ev.status)} · group registration closes ${compFmtDate(ev.reg_close)}${(ev.settings || {}).solo_close ? ` · solo and extra until ${compFmtDate(ev.settings.solo_close)}` : ''} · fee €${Number(ev.fee)} once per person</div>
            </div>
            <a class="btn btn-outline btn-sm" style="text-decoration:none;" href="comp/manifesto.pdf" target="_blank" rel="noopener">Rules PDF</a>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:14px; margin:12px 0 6px; font-size:0.88em;">
            ${stat('Taking part', compParticipants().length)}${stat('Solo', `${solos.length} (A ${countCat(solos, 'A')}, B ${countCat(solos, 'B')})`)}
            ${stat('Group', `${groupers.length} (A ${countCat(groupers, 'A')}, B ${countCat(groupers, 'B')})`)}${stat('Extra activity', acts.length)}${stat('Volunteers', compVolunteers().length)}
            ${noCat ? `<span style="color:var(--danger);">No category: <b>${noCat}</b></span>` : ''}
            ${locked ? `<span style="color:var(--success);">Fee charged: <b>${charged}/${feeEntries.length}</b></span>` : ''}
            ${stat('Solo songs', `${solos.filter((x) => x.solo_song_path).length}/${solos.length}`)}
            ${compTeams.length ? stat('Group songs', `${compTeams.filter((x) => x.group_song_path).length}/${compTeams.length}`) : ''}
        </div>
        <div style="font-size:0.85em; color:var(--ink-soft); margin-bottom:12px;">
            🏆 Trophies: <b>${tr.people}</b> people take part, so at least ${tr.people} trophies. Winners get a <b>big</b> one (up to <b>${tr.maxBig}</b> if every podium place is filled), everybody else a <b>small</b> one, and a winner does not also get a small one. The exact numbers appear in the Control → Certificates tab after the results. 🎁 Volunteers (${compVolunteers().length} so far), judges and sponsors also get a thank-you gift.
        </div>
        ${compShoppingHtml(tr)}
        ${compCouponsHtml()}
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;">
            <input type="text" id="compAddSearch" placeholder="Add a student by name…" oninput="compRenderAddList()" style="padding:7px 9px; border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.88em; min-width:200px;">
            <select id="compAddSelect" style="padding:7px 9px; border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.88em; min-width:220px;"></select>
            <label style="font-size:0.85em;"><input type="checkbox" id="compAddSolo" checked> Solo</label>
            <label style="font-size:0.85em;"><input type="checkbox" id="compAddGroup" checked> Group</label>
            <label style="font-size:0.85em;"><input type="checkbox" id="compAddActivity"> Extra</label>
            <label style="font-size:0.85em;"><input type="checkbox" id="compAddVolunteer"> Volunteer</label>
            <button class="btn btn-outline btn-sm" onclick="compAddStudent()" ${compBusy ? 'disabled' : ''}>Add</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
            <button class="btn btn-outline btn-sm" onclick="compFillCategories()" ${compBusy || locked ? 'disabled' : ''}>Fill empty categories from batch</button>
            <button class="btn btn-outline btn-sm" onclick="compMakeAllTeams()" ${compBusy || locked ? 'disabled' : ''}>Make teams</button>
            <button class="btn btn-primary btn-sm" onclick="compLockTeams()" ${compBusy ? 'disabled' : ''}>${locked ? 'Charge fee to new people' : 'Lock teams + charge fee'}</button>
            ${(ev.status === 'locked' || ev.status === 'live') ? `<button class="btn btn-outline btn-sm" onclick="compReopen()" ${compBusy ? 'disabled' : ''}>Reopen registration</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="compOpenBoard()">Team builder (drag &amp; drop)</button>
            <button class="btn btn-outline btn-sm" onclick="compPrintTeams()">Print teams</button>
        </div>
        ${compTeams.length ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">${teamsSummary}</div>` : ''}
        ${compDayHtml()}
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.88em;">
                <thead><tr style="text-align:left; color:var(--ink-faint); font-size:0.85em;">
                    <th style="padding:6px 8px;">Name</th><th style="padding:6px 8px;">Age</th><th style="padding:6px 8px;">Location</th>
                    <th style="padding:6px 8px;">Batch</th><th style="padding:6px 4px;">Solo</th><th style="padding:6px 4px;">Group</th><th style="padding:6px 4px;">Extra</th><th style="padding:6px 4px;">Volunteer</th>
                    <th style="padding:6px 8px;">Category</th><th style="padding:6px 8px;">Team</th><th style="padding:6px 8px;">Fee</th><th style="padding:6px 8px;">Solo song</th><th></th></tr></thead>
                <tbody>${sorted.map(row).join('') || '<tr><td colspan="13" style="padding:10px; color:var(--ink-faint);">Nobody has registered yet.</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
    compRenderAddList();
    if (typeof compBoardRefresh === 'function') compBoardRefresh();
}

function compRenderAddList() {
    const sel = document.getElementById('compAddSelect');
    if (!sel) return;
    const term = (document.getElementById('compAddSearch').value || '').toLowerCase();
    const taken = new Set(compEntries.filter((e) => !e.withdrawn).map((e) => e.student_id));
    const list = students.filter((s) => !taken.has(s.id) && (term ? s.name.toLowerCase().includes(term) : isStudentActive(s)))
        .sort((a, b) => a.name.localeCompare(b.name));
    sel.innerHTML = list.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('') || '<option value="">No students</option>';
}

async function compRun(fn) {
    if (compBusy) return;
    compBusy = true; renderCompetitionAdmin();
    try { await fn(); } catch (err) { console.error(err); alert('Something went wrong: ' + (err.message || err)); }
    finally { compBusy = false; await loadCompetitionAdmin(); }
}
function compCheck({ error }) { if (error) throw error; }

function compAddStudent() {
    const id = Number(document.getElementById('compAddSelect').value);
    const solo = document.getElementById('compAddSolo').checked, group = document.getElementById('compAddGroup').checked, activity = document.getElementById('compAddActivity').checked, volunteer = document.getElementById('compAddVolunteer').checked;
    if (!id) return;
    if (!(solo || group || activity || volunteer)) { alert('Tick at least one: Solo, Group, Extra or Volunteer.'); return; }
    const s = compStudent(id);
    return compRun(async () => {
        const existing = compEntries.find((e) => e.student_id === id);
        const category = solo || group ? compDefaultCategory(s && s.batch) : null;
        const flags = { do_solo: solo, do_group: group, do_activity: activity, do_volunteer: volunteer, kind: compKindFor(solo, group) };
        if (volunteer && !(existing && (existing.volunteer_roles || []).length)) flags.volunteer_roles = ['backstage'];   // change it with a click on the job
        if (existing) compCheck(await supabaseClient.from('comp_entries').update({ withdrawn: false, ...flags, category: existing.category || category }).eq('id', existing.id));
        else compCheck(await supabaseClient.from('comp_entries').insert({ event_id: compEvent.id, student_id: id, ...flags, category }));
    });
}
// Changing a tick: group off → no team; solo and group both off → the old "kind" follows.
function compSetFlag(entryId, key, value) {
    const e = compEntries.find((x) => x.id === entryId);
    const next = { do_solo: e.do_solo, do_group: e.do_group, do_activity: e.do_activity, do_volunteer: e.do_volunteer, [key]: value };
    if (!(next.do_solo || next.do_group || next.do_activity || next.do_volunteer)) { alert('Tick at least one, or press Remove.'); renderCompetitionAdmin(); return; }
    const patch = { [key]: value, kind: compKindFor(next.do_solo, next.do_group) };
    if (!next.do_group) patch.team_id = null;
    if (key === 'do_volunteer') patch.volunteer_roles = value ? ((e.volunteer_roles || []).length ? e.volunteer_roles : ['backstage']) : [];
    if ((next.do_solo || next.do_group) && !e.category) patch.category = compDefaultCategory((compStudent(e.student_id) || {}).batch);
    return compRun(async () => { compCheck(await supabaseClient.from('comp_entries').update(patch).eq('id', entryId)); });
}
// Click the job text to change it: one job per person.
function compEditRoles(entryId) {
    const e = compEntries.find((x) => x.id === entryId);
    const keys = Object.keys(COMP_VOL_ROLES);
    const typed = (prompt('Job (one of: ' + keys.join(', ') + ')', (e.volunteer_roles || [])[0] || '') || '').trim().toLowerCase();
    if (!typed) return;
    if (!keys.includes(typed)) { alert('Use one of: ' + keys.join(', ')); return; }
    return compRun(async () => { compCheck(await supabaseClient.from('comp_entries').update({ volunteer_roles: [typed] }).eq('id', entryId)); });
}
function compSetActivityPaid(entryId, v) {
    return compRun(async () => { compCheck(await supabaseClient.from('comp_entries').update({ activity_paid: v || null }).eq('id', entryId)); });
}
function compSetCategory(entryId, cat) {
    return compRun(async () => {
        compCheck(await supabaseClient.from('comp_entries').update({ category: cat || null, team_id: null }).eq('id', entryId));
    });
}
function compSetTeam(entryId, teamId) {
    return compRun(async () => {
        compCheck(await supabaseClient.from('comp_entries').update({ team_id: teamId ? Number(teamId) : null }).eq('id', entryId));
    });
}
function compFillCategories() {
    return compRun(async () => {
        for (const e of compActiveEntries().filter((x) => (x.do_solo || x.do_group) && !x.category)) {
            compCheck(await supabaseClient.from('comp_entries').update({ category: compDefaultCategory((compStudent(e.student_id) || {}).batch) }).eq('id', e.id));
        }
    });
}

// Fixed location teams (every non-Cremona location, category B) keep their
// students; everyone else in each category is split into balanced teams.
// Re-running wipes and rebuilds the non-fixed teams.
function compMakeAllTeams() {
    const compete = compGroupers();
    if (compete.some((x) => !x.category)) { alert('Some dancers have no category yet. Set it (or press "Fill empty categories") first.'); return; }
    if (compTeams.length && !confirm('Make the teams again? The current teams (and any moves you made by hand) are replaced.')) return;
    return compRun(async () => {
        const fixedByLocation = {};
        const pools = { A: [], B: [] };
        compete.forEach((e) => {
            const s = compStudent(e.student_id) || {};
            const d = { ...s, entryId: e.id };
            if (e.category === 'B' && !compIsCremona(s.locationId)) (fixedByLocation[s.locationId] = fixedByLocation[s.locationId] || []).push(d);
            else pools[e.category].push(d);
        });
        compCheck(await supabaseClient.from('comp_entries').update({ team_id: null }).eq('event_id', compEvent.id));
        compCheck(await supabaseClient.from('comp_teams').delete().eq('event_id', compEvent.id));
        let order = 0;
        const createTeam = async (category, name, fixed, locationId) => {
            const { data, error } = await supabaseClient.from('comp_teams')
                .insert({ event_id: compEvent.id, category, name, fixed, location_id: locationId || null, sort_order: order++ }).select().single();
            if (error) throw error;
            return data;
        };
        const assign = async (team, members) => {
            const ids = members.map((m) => m.entryId);
            if (ids.length) compCheck(await supabaseClient.from('comp_entries').update({ team_id: team.id }).in('id', ids));
        };
        for (const cat of ['A', 'B']) {
            if (!pools[cat].length) continue;
            const split = compMakeTeams(pools[cat]);
            for (let i = 0; i < split.length; i++) await assign(await createTeam(cat, `${cat}${i + 1}`, false, null), split[i]);
        }
        for (const [locId, members] of Object.entries(fixedByLocation)) {
            await assign(await createTeam('B', `Team ${compLocationName(Number(locId))}`, true, Number(locId)), members);
        }
    });
}

// Charges the fee once per person (fee_tx_id remembers it, so pressing again
// only charges people added after the lock).
function compLockTeams() {
    const noCategory = compActiveEntries().filter((x) => (x.do_solo || x.do_group) && !x.category);
    if (noCategory.length) { alert('These people have no category yet (A or B): ' + noCategory.map((x) => (compStudent(x.student_id) || {}).name).join(', ')); return; }
    const missingTeam = compGroupers().filter((x) => !x.team_id);
    if (missingTeam.length) {
        alert('These dancers have no team yet: ' + missingTeam.map((x) => (compStudent(x.student_id) || {}).name).join(', '));
        return;
    }
    // one fee per person, whatever they ticked; under 9 and extra-activity-only are not charged
    const toCharge = compActiveEntries().filter((x) => compNeedsFee(x, compStudent(x.student_id)) && !x.fee_tx_id);
    const fee = Number(compEvent.fee);
    const first = compEvent.status === 'registration';
    if (!toCharge.length && !first) { alert('Everyone has already been charged.'); return; }
    if (!confirm(`${first ? 'Lock the teams (registration closes) and charge' : 'Charge'} €${fee} to ${toCharge.length} ${toCharge.length === 1 ? 'person' : 'people'}?\n(One fee each, even if they do solo + group + extra. Free: under 9, and extra-activity only.)\n\nIt shows in each student's account as "${compEvent.title}".`)) return;
    return compRun(async () => {
        const failed = [];
        for (const e of toCharge) {
            const { data: tx, error } = await supabaseClient.from('v2_credit_transactions')
                .insert({ student_id: e.student_id, type: 'extra_charge', amount: -fee, note: compEvent.title })
                .select().single();
            if (error) { console.error('fee charge failed', e, error); failed.push(e); continue; }
            v2CreditTransactions.push(tx);
            await recomputeV2Balance(e.student_id);
            const { error: linkErr } = await supabaseClient.from('comp_entries').update({ fee_tx_id: tx.id }).eq('id', e.id);
            if (linkErr) console.error('could not link fee row', e, linkErr);
        }
        if (first) compCheck(await supabaseClient.from('comp_events').update({ status: 'locked' }).eq('id', compEvent.id));
        if (typeof renderStudentsList === 'function') renderStudentsList();
        if (typeof renderPaymentsList === 'function') renderPaymentsList();
        if (failed.length) alert('Could NOT charge: ' + failed.map((x) => (compStudent(x.student_id) || {}).name).join(', ') + '. Press the button again for them.');
    });
}
function compReopen() {
    if (!confirm('Reopen registration? Fees already charged stay charged.')) return;
    return compRun(async () => { compCheck(await supabaseClient.from('comp_events').update({ status: 'registration' }).eq('id', compEvent.id)); });
}
// Removing a dancer who was already charged offers to give the fee back
// (soft-deletes the charge row, same as the ledger's trash button).
function compWithdraw(entryId) {
    const e = compEntries.find((x) => x.id === entryId);
    const name = (compStudent(e.student_id) || {}).name || '';
    if (!confirm(`Remove ${name} from the competition?`)) return;
    const refund = e.fee_tx_id && confirm(`Give the €${Number(compEvent.fee)} fee back to ${name}'s account?`);
    return compRun(async () => {
        if (refund) {
            compCheck(await supabaseClient.from('v2_credit_transactions').update({ deleted_at: new Date().toISOString() }).eq('id', e.fee_tx_id));
            const tx = v2CreditTransactions.find((t) => t.id === e.fee_tx_id);
            if (tx) tx.deleted_at = new Date().toISOString();
            await recomputeV2Balance(e.student_id);
        }
        compCheck(await supabaseClient.from('comp_entries').update({ withdrawn: true, team_id: null, ...(refund ? { fee_tx_id: null } : {}) }).eq('id', entryId));
    });
}
function compRestore(entryId) {
    return compRun(async () => { compCheck(await supabaseClient.from('comp_entries').update({ withdrawn: false }).eq('id', entryId)); });
}

function compPrintTeams() {
    const compete = compGroupers();
    const kids = compActivities();
    const block = (title, names) => `<h3>${escapeHtml(title)} (${names.length})</h3><ol>${names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol>`;
    const nameOf = (x) => (compStudent(x.student_id) || {}).name || '?';
    const html = compTeams.map((tm) => block(`${tm.name} · Category ${tm.category}`, compete.filter((x) => x.team_id === tm.id).map(nameOf).sort()))
        .join('') + (kids.length ? block('Extra activity', kids.map(nameOf).sort()) : '');
    const w = window.open('', '_blank');
    if (!w) { alert('Allow pop-ups to print.'); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>${escapeHtml(compEvent.title)} · Teams</title>
        <style>body{font-family:Arial,sans-serif;padding:24px;columns:2;} h1{column-span:all;} h3{margin:14px 0 4px;break-after:avoid;} ol{margin:0 0 8px;break-inside:avoid;}</style>
        <h1>${escapeHtml(compEvent.title)} · Teams</h1>${html}<script>window.print()<\/script>`);
    w.document.close();
}

// ---------- songs (admin side) ----------
function compSecs(x) { const n = Math.round(Number(x) || 0); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; }
function compSongCell(kind, id, path, secs) {
    const has = !!path;
    const play = has
        ? `<a href="${supabaseClient.storage.from('comp-songs').getPublicUrl(path).data.publicUrl}" target="_blank" rel="noopener" style="font-weight:600; color:var(--success);">${secs ? compSecs(secs) : 'play'}</a>`
        : '<span style="color:var(--danger); font-weight:600;">missing</span>';
    return `${play} <label style="cursor:pointer; color:var(--accent); font-weight:600; margin-left:6px;">${has ? 'change' : 'upload'}<input type="file" accept="audio/*" style="display:none;" onchange="compAdminUploadSong('${kind}', ${id}, this)"></label>`;
}
// Same rule as the member upload (and _comp_song_range in competition_rules2.sql),
// the same for every category: solo 2:30 to 3:30, group 4:00 to 5:00.
function compSongRange(category, kind) {
    return kind === 'solo' ? [150, 210] : [240, 300];
}
function compAudioSecondsAdmin(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const a = new Audio();
        const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
        a.preload = 'metadata';
        a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null);
        a.onerror = () => done(null);
        setTimeout(() => done(null), 15000);
        a.src = url;
    });
}
async function compAdminUploadSong(kind, id, input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const row = kind === 'solo' ? compEntries.find((e) => e.id === id) : compTeams.find((t) => t.id === id);
    const secs = await compAudioSecondsAdmin(file);
    if (!secs) { alert('This file cannot be played. Use an MP3 or M4A.'); return; }
    const [min, max] = compSongRange(row.category, kind);
    if ((secs < min || secs > max) && !confirm(`This song is ${compSecs(secs)}; the rule is ${compSecs(min)} to ${compSecs(max)}. Upload it anyway?`)) return;
    return compRun(async () => {
        const ext = (file.name.match(/\.([a-z0-9]{2,4})$/i) || [, 'mp3'])[1].toLowerCase();
        const path = `songs/${compEvent.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabaseClient.storage.from('comp-songs').upload(path, file, { contentType: file.type || 'audio/mpeg' });
        if (up.error) throw up.error;
        const name = file.name.replace(/\.[^.]+$/, '').slice(0, 120);
        const secs1 = secs ? Math.round(secs * 10) / 10 : null;
        if (kind === 'solo') compCheck(await supabaseClient.from('comp_entries').update({ solo_song_path: path, solo_song_seconds: secs1, solo_song_name: name }).eq('id', id));
        else compCheck(await supabaseClient.from('comp_teams').update({ group_song_path: path, group_song_seconds: secs1, group_song_name: name, group_song_by: null }).eq('id', id));
    });
}

// ---------- competition day: PINs + screens ----------
const COMP_ROLES = [['judge1', 'Judge 1'], ['judge2', 'Judge 2'], ['judge3', 'Judge 3'], ['staff', 'Staff (sound, anchor, projector, door)']];
function compDayHtml() {
    if (compPins === null) return `<div style="background:var(--bg); border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px; font-size:0.85em; color:var(--ink-soft);">Songs and competition day: run <b>competition_live.sql</b> in Supabase.</div>`;
    const pin = (r) => (compPins.find((p) => p.role === r) || {});
    const link = (role, label) => `<a class="btn btn-outline btn-sm" style="text-decoration:none;" href="comp.html?role=${role}" target="_blank" rel="noopener">${label}</a>`;
    return `<details style="border:1px solid var(--border-soft); border-radius:var(--radius-sm); padding:10px 12px; margin-bottom:14px;">
        <summary style="font-weight:700; cursor:pointer;">Competition day: PINs and screens</summary>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:10px; margin:12px 0;">
            ${COMP_ROLES.map(([r, label]) => `<div class="field" style="margin:0;"><label>${label} PIN</label>
                <input id="compPin_${r}" inputmode="numeric" maxlength="8" placeholder="6 to 8 digits" value="${escapeHtml(pin(r).pin || '')}" style="width:100%;">
                ${r.startsWith('judge') ? `<input id="compJudgeName_${r}" placeholder="Judge name (optional)" value="${escapeHtml(pin(r).judge_name || '')}" style="width:100%; margin-top:6px;">` : ''}</div>`).join('')}
        </div>
        <button class="btn btn-outline btn-sm" onclick="compRandomPins()">Random PINs</button>
        <button class="btn btn-outline btn-sm" onclick="compSavePins()" ${compBusy ? 'disabled' : ''}>Save PINs</button>
        <span style="color:var(--ink-faint); font-size:0.82em; margin-left:6px;">8 wrong PINs from one device block it for 15 minutes.</span>
        ${compSecretLinksHtml()}
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
            ${link('control', 'Control (you)')}${link('judge1', 'Judge 1')}${link('judge2', 'Judge 2')}${link('judge3', 'Judge 3')}
            ${link('sound', 'Sound')}${link('anchor', 'Anchor')}${link('projector', 'Projector')}${link('door', 'Door')}
            <a class="btn btn-outline btn-sm" style="text-decoration:none;" href="comp.html?role=control&demo=1" target="_blank" rel="noopener">Practice run (fake data)</a>
        </div>
    </details>`;
}
function compSavePins() {
    const rows = COMP_ROLES.map(([r]) => ({
        event_id: compEvent.id, role: r,
        pin: (document.getElementById('compPin_' + r).value || '').trim(),
        judge_name: r.startsWith('judge') ? (document.getElementById('compJudgeName_' + r).value || '').trim() || null : null
    }));
    if (rows.some((x) => x.pin && !/^\d{6,8}$/.test(x.pin))) { alert('PINs must be 6 to 8 digits.'); return; }
    const pins = rows.filter((x) => x.pin).map((x) => x.pin);
    if (new Set(pins).size !== pins.length) { alert('Every role needs a different PIN.'); return; }
    return compRun(async () => {
        compCheck(await supabaseClient.from('comp_pins').delete().eq('event_id', compEvent.id));
        const keep = rows.filter((x) => x.pin);
        if (keep.length) compCheck(await supabaseClient.from('comp_pins').insert(keep));
    });
}

// Fills every PIN box with a different random 8-digit PIN (press Save after).
function compRandomPins() {
    const used = new Set();
    COMP_ROLES.forEach(([r]) => {
        let p;
        do { const a = new Uint32Array(1); crypto.getRandomValues(a); p = String(10000000 + (a[0] % 90000000)); } while (used.has(p));
        used.add(p);
        document.getElementById('compPin_' + r).value = p;
    });
}

// ---------- secret links: role + PIN hidden in the link ----------
// Must match decodeSecret() in comp-live.js.
const COMP_SECRET_CODES = { judge1: 'j1', judge2: 'j2', judge3: 'j3', sound: 's', anchor: 'a', projector: 'p', door: 'd' };
function compSecretLink(role, pin) {
    const key = 'bhangra-sway';
    const txt = `${COMP_SECRET_CODES[role]}:${pin}`;
    const raw = Array.from(txt, (ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');
    const code = btoa(raw).replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/=+$/, '');
    return `${location.origin}${location.pathname.replace(/[^/]*$/, '')}comp.html#${code}`;
}
function compSecretLinksHtml() {
    const pinOf = (r) => ((compPins || []).find((p) => p.role === r) || {}).pin;
    const labels = { judge1: 'Judge 1', judge2: 'Judge 2', judge3: 'Judge 3', sound: 'Sound', anchor: 'Anchor', projector: 'Projector', door: 'Door' };
    const rows = Object.keys(labels).map((r) => {
        const pin = pinOf(r.startsWith('judge') ? r : 'staff');
        return pin
            ? `<button class="btn btn-outline btn-sm" onclick="compCopySecret('${r}')">Copy ${labels[r]} link</button>`
            : `<span class="btn btn-outline btn-sm" style="opacity:.5; cursor:default;">${labels[r]}: save a PIN first</span>`;
    }).join('');
    return `<div style="margin-top:12px;"><div style="font-weight:700; font-size:0.88em;">Secret links (no PIN to type; a new PIN makes old links stop working)</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">${rows}</div></div>`;
}
async function compCopySecret(role) {
    const pin = ((compPins || []).find((p) => p.role === (role.startsWith('judge') ? role : 'staff')) || {}).pin;
    if (!pin) return;
    const url = compSecretLink(role, pin);
    try { await navigator.clipboard.writeText(url); alert('Link copied. Paste it in WhatsApp to the person:\n' + url); }
    catch (e) { prompt('Copy this link:', url); }
}

// ---------- shopping list: trophies and thank-you gifts ----------
// "Needed" is what to buy (an upper estimate for trophies, until the results are in),
// "Bought" is typed by the coach, "Still to buy" is the difference.
// Saved in comp_events.settings.shopping so every device sees the same.
function compShopping() { return ((compEvent && compEvent.settings) || {}).shopping || {}; }
function compShoppingHtml(tr) {
    const sh = compShopping();
    const num = (k, d) => (Number.isFinite(Number(sh[k])) && sh[k] !== undefined && sh[k] !== null && sh[k] !== '' ? Number(sh[k]) : d);
    const rows = [
        { key: 'big', label: 'Big trophies (winners)', need: tr.maxBig, fixed: true, hint: 'up to, if every podium place is filled' },
        { key: 'small', label: 'Small trophies', need: tr.people, fixed: true, hint: 'up to: everybody who takes part; winners do not need one' },
        { key: 'volunteers', label: 'Volunteer gifts', need: compVolunteers().length, fixed: true, hint: 'registered volunteers' },
        { key: 'judges', label: 'Judge gifts', need: num('judges_need', 3), fixed: false },
        { key: 'sponsors', label: 'Sponsor gifts', need: num('sponsors_need', 0), fixed: false }
    ];
    const cell = 'padding:5px 8px; border-top:1px solid var(--border-soft, #eceef4);';
    const input = (key, val, w) => `<input type="number" min="0" value="${val}" onchange="compShopSet('${key}', this.value)" ${compBusy ? 'disabled' : ''} style="width:${w || 64}px; padding:4px 6px; border-radius:6px; border:1px solid var(--border, #d7dbe6); font-size:0.95em;">`;
    const body = rows.map((r) => {
        const bought = num(r.key + '_bought', 0);
        const left = Math.max(0, r.need - bought);
        return `<tr>
            <td style="${cell} font-weight:600;">${r.label}${r.hint ? ` <span style="color:var(--ink-faint); font-weight:400; font-size:0.8em;">(${r.hint})</span>` : ''}</td>
            <td style="${cell} text-align:center;">${r.fixed ? `<b>${r.need}</b>` : input(r.key === 'judges' ? 'judges_need' : 'sponsors_need', r.need)}</td>
            <td style="${cell} text-align:center;">${input(r.key + '_bought', bought)}</td>
            <td style="${cell} text-align:center; font-weight:800; color:${left === 0 ? 'var(--success, #16a34a)' : 'var(--danger, #dc2626)'};">${left === 0 ? '✓ done' : left}</td></tr>`;
    }).join('');
    const totalLeft = rows.reduce((t, r) => t + Math.max(0, r.need - num(r.key + '_bought', 0)), 0);
    return `<details style="border:1px solid var(--border-soft, #eceef4); border-radius:var(--radius-sm); padding:8px 12px; margin-bottom:12px;">
        <summary style="cursor:pointer; font-weight:700; font-size:0.9em;">🛒 Shopping list: trophies and gifts <span style="font-weight:600; color:${totalLeft ? 'var(--danger, #dc2626)' : 'var(--success, #16a34a)'};">${totalLeft ? totalLeft + ' still to buy' : 'everything bought ✓'}</span></summary>
        <table style="width:100%; border-collapse:collapse; font-size:0.88em; margin-top:8px;">
            <thead><tr style="text-align:left; color:var(--ink-faint); font-size:0.82em;"><th style="padding:4px 8px;">What</th><th style="padding:4px 8px; text-align:center;">Needed</th><th style="padding:4px 8px; text-align:center;">Bought</th><th style="padding:4px 8px; text-align:center;">Still to buy</th></tr></thead>
            <tbody>${body}</tbody></table>
        <div style="color:var(--ink-faint); font-size:0.78em; margin-top:6px;">Type how many you have bought. Judge and sponsor numbers you set yourself. Trophies are shown as the most you could need; the exact count comes after the results (Control → Certificates).</div>
    </details>`;
}
async function compShopSet(key, value) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    const shopping = { ...compShopping(), [key]: n };
    const settings = { ...(compEvent.settings || {}), shopping };
    const { error } = await supabaseClient.from('comp_events').update({ settings }).eq('id', compEvent.id);
    if (error) { alert('Not saved: ' + error.message); return; }
    compEvent.settings = settings;
    renderCompetitionAdmin();
    const d = document.querySelector('#compAdmin details'); if (d) d.open = true;
}

// ---------- free invitation coupons (competition_coupons.sql) ----------
function compCouponsHtml() {
    if (compCoupons === null) return '';
    const used = compCoupons.filter((c) => c.used_at).length;
    const byStudent = {};
    compCoupons.forEach((c) => { (byStudent[c.student_id] = byStudent[c.student_id] || []).push(c); });
    const rows = Object.entries(byStudent).map(([sid, list]) => {
        const name = (compStudent(Number(sid)) || {}).name || '#' + sid;
        return `<tr><td style="padding:5px 8px; font-weight:600; vertical-align:top;">${escapeHtml(name)} <span style="color:var(--ink-faint); font-weight:400;">(${list.length})</span></td>
            <td style="padding:5px 8px;">${list.map((c) => `<span style="display:inline-flex; align-items:center; gap:4px; margin:2px 6px 2px 0; padding:2px 8px; border-radius:999px; background:${c.used_at ? '#eef7ee' : '#eef0f6'}; font-size:0.85em;">${escapeHtml(c.guest_name)} <b style="letter-spacing:1px;">${escapeHtml(c.code)}</b>${c.used_at ? ' ✓' : ` <span style="cursor:pointer; color:var(--danger);" title="Delete this coupon" onclick="compDeleteCoupon(${c.id})">×</span>`}</span>`).join('')}</td></tr>`;
    }).join('');
    return `<details style="border:1px solid var(--border-soft, #eceef4); border-radius:var(--radius-sm); padding:8px 12px; margin-bottom:12px;">
        <summary style="cursor:pointer; font-weight:700; font-size:0.9em;">🎟 Guest coupons (free entry): <b>${compCoupons.length}</b> invited, <b>${used}</b> came in</summary>
        <div style="color:var(--ink-faint); font-size:0.8em; margin:6px 0;">Each student who takes part can invite up to 5 guests from the app. The Door screen checks the code and lets the guest in once.</div>
        <table style="width:100%; border-collapse:collapse; font-size:0.88em;">${rows || '<tr><td style="padding:6px 8px; color:var(--ink-faint);">No coupons yet.</td></tr>'}</table>
    </details>`;
}
async function compDeleteCoupon(id) {
    if (!confirm('Delete this coupon?')) return;
    const { error } = await supabaseClient.from('comp_coupons').delete().eq('id', id);
    if (error) { alert('Not deleted: ' + error.message); return; }
    compCoupons = compCoupons.filter((c) => c.id !== id);
    renderCompetitionAdmin();
}
