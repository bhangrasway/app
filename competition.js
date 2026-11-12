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
// Two students are siblings when they share the parent's codice fiscale or the phone number.
function compAreSiblings(a, b) {
    const cfA = String(a.parentCodiceFiscale || '').trim().toUpperCase();
    const cfB = String(b.parentCodiceFiscale || '').trim().toUpperCase();
    if (cfA && cfA === cfB) return true;
    const pA = compPhoneDigits(a.phone), pB = compPhoneDigits(b.phone);
    return pA.length === 9 && pA === pB;
}
// Splits dancers into balanced teams of about COMP_TEAM_SIZE. Strongest
// first, each dancer goes to the team with the fewest dancers of the same
// level so far (then the smallest, then the weakest), so every team gets
// the same mix of levels. A dancer never goes into a team that already has
// a brother or sister when another team can take them.
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
        const ok = (k) => teams[k].length < cap && !teams[k].some((m) => compAreSiblings(m, d));
        const pick = rank.find(ok) ?? rank.find((k) => teams[k].length < cap) ?? rank[0];
        teams[pick].push(d);
    });
    return teams;
}

if (typeof module !== 'undefined') {
    module.exports = { compDefaultCategory, compStrength, compAreSiblings, compMakeTeams };
}

// ---------- admin panel ----------
let compEvent = null;
let compTeams = [];
let compEntries = [];
let compBusy = false;
let compPins = null;

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
    renderCompetitionAdmin();
}

function compStatusLabel(status) {
    return { registration: 'Registration open', locked: 'Teams locked', live: 'Live', finished: 'Finished' }[status] || status;
}
function compFmtDate(d) { if (!d) return '—'; const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}`; }

function renderCompetitionAdmin() {
    const box = document.getElementById('compAdmin');
    const ev = compEvent;
    const active = compActiveEntries();
    const compete = active.filter((x) => x.kind === 'compete');
    const kids = active.filter((x) => x.kind === 'kids_show');
    const locked = ev.status !== 'registration';
    const count = (cat) => compete.filter((x) => x.category === cat).length;
    const noCat = compete.filter((x) => !x.category).length;
    const charged = compete.filter((x) => x.fee_tx_id).length;

    const teamOptions = (entry) => {
        const opts = compTeams.filter((tm) => tm.category === entry.category)
            .map((tm) => `<option value="${tm.id}" ${entry.team_id === tm.id ? 'selected' : ''}>${escapeHtml(tm.name)}</option>`).join('');
        return `<select onchange="compSetTeam(${entry.id}, this.value)" ${compBusy ? 'disabled' : ''} style="padding:4px 6px; font-size:0.85em;"><option value="">—</option>${opts}</select>`;
    };
    const row = (entry) => {
        const s = compStudent(entry.student_id) || { name: `#${entry.student_id}` };
        const catSel = entry.kind === 'kids_show' ? '<span style="color:var(--ink-faint);">Kids show</span>'
            : `<select onchange="compSetCategory(${entry.id}, this.value)" ${compBusy || entry.fee_tx_id ? 'disabled' : ''} style="padding:4px 6px; font-size:0.85em;">
                <option value="" ${!entry.category ? 'selected' : ''}>—</option>
                <option value="A" ${entry.category === 'A' ? 'selected' : ''}>A</option>
                <option value="B" ${entry.category === 'B' ? 'selected' : ''}>B</option></select>`;
        return `<tr style="${entry.withdrawn ? 'opacity:0.45;' : ''}">
            <td style="padding:6px 8px; font-weight:600;">${escapeHtml(s.name)}${entry.withdrawn ? ' <span style="font-weight:400; color:var(--danger);">(cancelled)</span>' : ''}</td>
            <td style="padding:6px 8px; color:var(--ink-soft);">${s.age ?? '—'}</td>
            <td style="padding:6px 8px; color:var(--ink-soft);">${escapeHtml(compLocationName(s.locationId) || '—')}</td>
            <td style="padding:6px 8px; color:var(--ink-soft);">${escapeHtml(s.batch ? getBatchDisplayLabel(s.batch) : '—')}</td>
            <td style="padding:6px 8px;">${catSel}</td>
            <td style="padding:6px 8px;">${entry.kind === 'compete' && !entry.withdrawn ? teamOptions(entry) : ''}</td>
            <td style="padding:6px 8px; white-space:nowrap;">${entry.fee_tx_id ? `<span style="color:var(--success); font-weight:600;">€${Number(ev.fee)} paid</span>` : ''}</td>
            <td style="padding:6px 8px; white-space:nowrap;">${entry.kind === 'compete' && !entry.withdrawn ? compSongCell('solo', entry.id, entry.solo_song_path, entry.solo_song_seconds) : ''}</td>
            <td style="padding:6px 8px; text-align:right;">${entry.withdrawn
                ? `<button class="btn btn-outline btn-sm" onclick="compRestore(${entry.id})">Restore</button>`
                : `<button class="btn btn-outline btn-sm" onclick="compWithdraw(${entry.id})">Remove</button>`}</td>
        </tr>`;
    };
    const teamsSummary = compTeams.map((tm) => {
        const members = compete.filter((x) => x.team_id === tm.id).map((x) => (compStudent(x.student_id) || {}).name || '?');
        return `<div style="border:1px solid var(--border-soft); border-radius:var(--radius-sm); padding:8px 10px; min-width:170px; flex:1;">
            <div style="font-weight:700;">${escapeHtml(tm.name)} <span style="color:var(--ink-faint); font-weight:500;">· ${tm.category} · ${members.length}</span></div>
            <div style="color:var(--ink-soft); font-size:0.82em; margin-top:4px;">${members.map(escapeHtml).join(', ') || '—'}</div>
            <div style="font-size:0.82em; margin-top:6px;">Group song: ${compSongCell('group', tm.id, tm.group_song_path, tm.group_song_seconds)}</div></div>`;
    }).join('');
    const sorted = [...compEntries].sort((a, b) => (a.withdrawn - b.withdrawn) || (a.kind === b.kind ? 0 : a.kind === 'compete' ? -1 : 1)
        || String(a.category || 'Z').localeCompare(String(b.category || 'Z'))
        || String((compStudent(a.student_id) || {}).name || '').localeCompare(String((compStudent(b.student_id) || {}).name || '')));

    box.innerHTML = `
    <div class="card" style="padding:18px 20px; margin-bottom:20px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
                <h3 style="font-size:1.05em; margin:0;">${escapeHtml(ev.title)}</h3>
                <div style="color:var(--ink-soft); font-size:0.85em; margin-top:3px;">${compStatusLabel(ev.status)} · registration closes ${compFmtDate(ev.reg_close)} · fee €${Number(ev.fee)}</div>
            </div>
            <a class="btn btn-outline btn-sm" style="text-decoration:none;" href="comp/manifesto.pdf" target="_blank" rel="noopener">Rules PDF</a>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:14px; margin:12px 0; font-size:0.88em; font-weight:700;">
            <span>Compete: ${compete.length}</span><span>A: ${count('A')}</span><span>B: ${count('B')}</span>
            ${noCat ? `<span style="color:var(--danger);">No category: ${noCat}</span>` : ''}
            <span>Kids show: ${kids.length}</span>
            ${locked ? `<span style="color:var(--success);">Fee charged: ${charged}/${compete.length}</span>` : ''}
            <span>Solo songs: ${compete.filter((x) => x.solo_song_path).length}/${compete.length}</span>
            ${compTeams.length ? `<span>Group songs: ${compTeams.filter((x) => x.group_song_path).length}/${compTeams.length}</span>` : ''}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px;">
            <input type="text" id="compAddSearch" placeholder="Add a student by name…" oninput="compRenderAddList()" style="padding:7px 9px; border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.88em; min-width:200px;">
            <select id="compAddSelect" style="padding:7px 9px; border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.88em; min-width:220px;"></select>
            <select id="compAddKind" style="padding:7px 9px; border-radius:var(--radius-sm); border:1px solid var(--border); font-size:0.88em;"><option value="compete">Compete</option><option value="kids_show">Kids show</option></select>
            <button class="btn btn-outline btn-sm" onclick="compAddStudent()" ${compBusy ? 'disabled' : ''}>Add</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
            <button class="btn btn-outline btn-sm" onclick="compFillCategories()" ${compBusy || locked ? 'disabled' : ''}>Fill empty categories from batch</button>
            <button class="btn btn-outline btn-sm" onclick="compMakeAllTeams()" ${compBusy || locked ? 'disabled' : ''}>Make teams</button>
            <button class="btn btn-primary btn-sm" onclick="compLockTeams()" ${compBusy ? 'disabled' : ''}>${locked ? 'Charge fee to new dancers' : 'Lock teams + charge fee'}</button>
            ${(ev.status === 'locked' || ev.status === 'live') ? `<button class="btn btn-outline btn-sm" onclick="compReopen()" ${compBusy ? 'disabled' : ''}>Reopen registration</button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="compPrintTeams()">Print teams</button>
        </div>
        ${compTeams.length ? `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">${teamsSummary}</div>` : ''}
        ${compDayHtml()}
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.88em;">
                <thead><tr style="text-align:left; color:var(--ink-faint); font-size:0.85em;">
                    <th style="padding:6px 8px;">Name</th><th style="padding:6px 8px;">Age</th><th style="padding:6px 8px;">Location</th>
                    <th style="padding:6px 8px;">Batch</th><th style="padding:6px 8px;">Category</th><th style="padding:6px 8px;">Team</th><th></th><th style="padding:6px 8px;">Solo song</th><th></th></tr></thead>
                <tbody>${sorted.map(row).join('') || '<tr><td colspan="9" style="padding:10px; color:var(--ink-faint);">Nobody has registered yet.</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
    compRenderAddList();
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
    const kind = document.getElementById('compAddKind').value;
    if (!id) return;
    const s = compStudent(id);
    return compRun(async () => {
        const existing = compEntries.find((e) => e.student_id === id);
        const category = kind === 'compete' ? compDefaultCategory(s && s.batch) : null;
        if (existing) compCheck(await supabaseClient.from('comp_entries').update({ withdrawn: false, kind, category: existing.category || category }).eq('id', existing.id));
        else compCheck(await supabaseClient.from('comp_entries').insert({ event_id: compEvent.id, student_id: id, kind, category }));
    });
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
        for (const e of compActiveEntries().filter((x) => x.kind === 'compete' && !x.category)) {
            compCheck(await supabaseClient.from('comp_entries').update({ category: compDefaultCategory((compStudent(e.student_id) || {}).batch) }).eq('id', e.id));
        }
    });
}

// Fixed location teams (every non-Cremona location, category B) keep their
// students; everyone else in each category is split into balanced teams.
// Re-running wipes and rebuilds the non-fixed teams.
function compMakeAllTeams() {
    const compete = compActiveEntries().filter((x) => x.kind === 'compete');
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

// Charges the fee once per competing dancer (fee_tx_id remembers it, so
// pressing again only charges dancers added after the lock). Kids show is free.
function compLockTeams() {
    const compete = compActiveEntries().filter((x) => x.kind === 'compete');
    const missingTeam = compete.filter((x) => !x.team_id);
    if (missingTeam.length) {
        alert('These dancers have no team yet: ' + missingTeam.map((x) => (compStudent(x.student_id) || {}).name).join(', '));
        return;
    }
    const toCharge = compete.filter((x) => !x.fee_tx_id);
    const fee = Number(compEvent.fee);
    const first = compEvent.status === 'registration';
    if (!toCharge.length && !first) { alert('Everyone has already been charged.'); return; }
    if (!confirm(`${first ? 'Lock the teams (registration closes) and charge' : 'Charge'} €${fee} to ${toCharge.length} dancer${toCharge.length === 1 ? '' : 's'}?\n\nIt shows in each student's account as "${compEvent.title}".`)) return;
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
    const compete = compActiveEntries().filter((x) => x.kind === 'compete');
    const kids = compActiveEntries().filter((x) => x.kind === 'kids_show');
    const block = (title, names) => `<h3>${escapeHtml(title)} (${names.length})</h3><ol>${names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ol>`;
    const nameOf = (x) => (compStudent(x.student_id) || {}).name || '?';
    const html = compTeams.map((tm) => block(`${tm.name} · Category ${tm.category}`, compete.filter((x) => x.team_id === tm.id).map(nameOf).sort()))
        .join('') + (kids.length ? block('Kids show', kids.map(nameOf).sort()) : '');
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
// Same ±margin rule as the member upload (and set_my_comp_song_by_phone).
function compSongRange(category, kind) {
    const st = (compEvent && compEvent.settings) || {};
    const margin = Number(st.margin_seconds ?? 10);
    if (kind === 'solo') { const m = Number((st.solo_minutes || {})[category] ?? (category === 'A' ? 2 : 1.5)) * 60; return [m - margin, m + margin]; }
    return category === 'A' ? [300 - margin, 360 + margin] : [240 - margin, 240 + margin];
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
