// ===== Competition team builder (admin) =====
// A full-screen board: drag a person from "Not in a team" into a team, between
// teams, or back out. On a phone, tap a person, then tap the team (no dragging
// needed). Every move is saved at once. You can also add a student to the
// competition (solo / group / extra) from here.
//
// Uses the globals of competition.js and admin.html: supabaseClient, students,
// compEvent, compTeams, compEntries, compStudent, compLocationName,
// compActiveEntries, compDefaultCategory, compKindFor,
// compSongRange is not needed, escapeHtml, getBatchDisplayLabel, isStudentActive.

let compBoardOpen = false;
let compBoardCat = 'A';
let compBoardSel = null;        // entry id picked by tapping
let compBoardSearch = '';
let compBoardMsg = '';
// Parent name + age are for the coach only. Hidden by default, so a screenshot of the
// board never shows them; the switch in the top bar shows them (remembered on this device).
let compBoardDetails = (() => { try { return localStorage.getItem('comp_board_details') === '1'; } catch (e) { return false; } })();
function compBoardToggleDetails() {
    compBoardDetails = !compBoardDetails;
    try { localStorage.setItem('comp_board_details', compBoardDetails ? '1' : '0'); } catch (e) { /* ignore */ }
    renderTeamBoard();
}

function compBoardEl() {
    let el = document.getElementById('compBoard');
    if (!el) {
        el = document.createElement('div');
        el.id = 'compBoard';
        el.style.cssText = 'position:fixed; inset:0; z-index:300; background:rgba(15,20,40,0.55); display:none;';
        document.body.appendChild(el);
        const st = document.createElement('style');
        st.textContent = `
        #compBoard .cb-panel{ position:absolute; inset:2.5vh 2vw; background:var(--bg, #f6f7fb); border-radius:16px; box-shadow:0 20px 60px rgba(0,0,0,.35); display:flex; flex-direction:column; overflow:hidden; }
        #compBoard .cb-top{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:12px 16px; background:var(--surface, #fff); border-bottom:1px solid var(--border, #e3e6ee); }
        #compBoard .cb-body{ flex:1; display:flex; gap:14px; padding:14px; overflow:hidden; min-height:0; }
        #compBoard .cb-pool{ width:300px; flex-shrink:0; display:flex; flex-direction:column; background:var(--surface, #fff); border:1px solid var(--border, #e3e6ee); border-radius:12px; min-height:0; }
        #compBoard .cb-teams{ flex:1; overflow:auto; display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:12px; align-content:start; }
        #compBoard .cb-team{ background:var(--surface, #fff); border:2px solid var(--border, #e3e6ee); border-radius:12px; display:flex; flex-direction:column; min-height:140px; }
        #compBoard .cb-team.over, #compBoard .cb-pool.over{ border-color:var(--accent, #2563eb); background:var(--accent-soft, #eef2ff); }
        #compBoard .cb-team.pick{ border-style:dashed; border-color:var(--accent, #2563eb); cursor:pointer; }
        #compBoard .cb-head{ display:flex; align-items:center; justify-content:space-between; gap:6px; padding:8px 10px; border-bottom:1px solid var(--border-soft, #eceef4); }
        #compBoard .cb-list{ padding:8px; display:flex; flex-direction:column; gap:6px; flex:1; overflow:auto; }
        #compBoard .cb-chip{ display:flex; align-items:center; gap:8px; padding:7px 9px; border:1px solid var(--border, #e3e6ee); border-radius:9px; background:#fff; cursor:grab; user-select:none; font-size:.88em; }
        #compBoard .cb-chip:active{ cursor:grabbing; }
        #compBoard .cb-chip.sel{ outline:2px solid var(--accent, #2563eb); background:var(--accent-soft, #eef2ff); }
        #compBoard .cb-tag{ font-size:.72em; font-weight:800; padding:1px 6px; border-radius:999px; background:#eef0f6; color:#566; }
        #compBoard .cb-mini{ border:1px solid var(--border, #d7dbe6); background:#fff; border-radius:7px; padding:2px 8px; font-size:.78em; font-weight:700; cursor:pointer; }
        @media (max-width:820px){ #compBoard .cb-body{ flex-direction:column; overflow:auto; } #compBoard .cb-pool{ width:auto; max-height:42vh; } #compBoard .cb-teams{ overflow:visible; } #compBoard .cb-panel{ inset:0; border-radius:0; } }`;
        document.head.appendChild(st);
    }
    return el;
}

function compOpenBoard() {
    if (!compEvent) return;
    compBoardOpen = true; compBoardSel = null; compBoardMsg = '';
    compBoardEl().style.display = 'block';
    renderTeamBoard();
}
function compCloseBoard() {
    compBoardOpen = false;
    const el = document.getElementById('compBoard');
    if (el) el.style.display = 'none';
    if (typeof renderCompetitionAdmin === 'function') renderCompetitionAdmin();
}
// Called by competition.js after it reloads data.
function compBoardRefresh() { if (compBoardOpen) renderTeamBoard(); }

function compBoardPeople() { return compActiveEntries().filter((e) => e.do_group); }
function compBoardName(e) { return (compStudent(e.student_id) || {}).name || `#${e.student_id}`; }

function renderTeamBoard() {
    if (!compBoardOpen) return;
    const el = compBoardEl();
    const people = compBoardPeople();
    const cat = compBoardCat;
    const teams = compTeams.filter((t) => t.category === cat);
    const inCat = people.filter((e) => e.category === cat);
    const noCat = people.filter((e) => !e.category);
    const q = compBoardSearch.trim().toLowerCase();
    const pool = inCat.filter((e) => !e.team_id && (!q || compBoardName(e).toLowerCase().includes(q)))
        .sort((a, b) => compBoardName(a).localeCompare(compBoardName(b)));
    const count = (c) => people.filter((e) => e.category === c).length;

    const chip = (e, teamMembers) => {
        const s = compStudent(e.student_id) || {};
        return `<div class="cb-chip ${compBoardSel === e.id ? 'sel' : ''}" draggable="true"
            ondragstart="compBoardDragStart(event, ${e.id})" onclick="event.stopPropagation(); compBoardPickChip(${e.id})">
            <span style="flex:1; min-width:0;">
                <span style="display:block; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(compBoardName(e))}</span>
                ${compBoardDetails ? `<span style="display:block; color:var(--ink-faint, #889); font-size:.78em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(s.parentName ? 'Parent: ' + s.parentName : 'Parent: —')}${s.age != null ? ' · ' + escapeHtml(String(s.age)) + ' yrs' : ''}</span>` : ''}
            </span>
            ${e.do_solo ? '<span class="cb-tag" title="also does the solo">Solo</span>' : ''}
        </div>`;
    };
    const teamCard = (t) => {
        const members = people.filter((e) => e.team_id === t.id).sort((a, b) => compBoardName(a).localeCompare(compBoardName(b)));
        const n = members.length;
        const good = n >= 5 && n <= 7;
        return `<div class="cb-team ${compBoardSel ? 'pick' : ''}" ondragover="compBoardOver(event)" ondragleave="compBoardLeave(event)" ondrop="compBoardDrop(event, ${t.id})"
            onclick="compBoardPlaceSelected(${t.id})">
            <div class="cb-head">
                <div style="min-width:0;"><span style="font-weight:800; cursor:pointer;" onclick="event.stopPropagation(); compBoardRename(${t.id})" title="Rename">${escapeHtml(t.name)}</span>
                    ${t.fixed ? '<span class="cb-tag" title="a fixed location team">fixed</span>' : ''}</div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-weight:800; color:${good ? 'var(--success, #16a34a)' : 'var(--ink-faint, #889)'};">${n}</span>
                    <button class="cb-mini" onclick="event.stopPropagation(); compBoardDeleteTeam(${t.id})" title="Delete this team">×</button>
                </div>
            </div>
            <div class="cb-list">${members.map((e) => chip(e, members)).join('') || '<div style="color:var(--ink-faint, #99a); font-size:.82em; padding:10px 4px;">Drop people here</div>'}</div>
        </div>`;
    };

    el.innerHTML = `<div class="cb-panel">
        <div class="cb-top">
            <div style="font-weight:900; font-size:1.05em;">Team builder</div>
            <div style="display:flex; gap:6px;">${['A', 'B'].map((c) => `<button class="btn ${cat === c ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="compBoardSetCat('${c}')">Category ${c} (${count(c)})</button>`).join('')}</div>
            <button class="btn btn-outline btn-sm" onclick="compBoardNewTeam()">+ New team</button>
            <span style="flex:1; color:var(--ink-soft, #667); font-size:.82em;">${compBoardSel ? 'Now tap the team to move <b>' + escapeHtml(compBoardName(compEntries.find((e) => e.id === compBoardSel) || {})) + '</b>' : 'Drag a person into a team (or tap a person, then a team).'}${compBoardMsg ? ' · ' + escapeHtml(compBoardMsg) : ''}</span>
            <button class="btn ${compBoardDetails ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="compBoardToggleDetails()" title="Hidden by default so a screenshot does not show them">${compBoardDetails ? 'Parent + age: shown (hide)' : 'Parent + age: hidden (show)'}</button>
            <button class="btn btn-outline btn-sm" onclick="compBoardExportPdf()" title="A PDF with only the team names and the people names">Export teams PDF</button>
            <button class="btn btn-primary btn-sm" onclick="compCloseBoard()">Done</button>
        </div>
        <div class="cb-body">
            <div class="cb-pool" ondragover="compBoardOver(event)" ondragleave="compBoardLeave(event)" ondrop="compBoardDrop(event, null)">
                <div class="cb-head"><div style="font-weight:800;">Not in a team <span style="color:var(--ink-faint, #889); font-weight:600;">· ${pool.length}</span></div></div>
                <div style="padding:8px 8px 0;"><input type="text" placeholder="Search…" value="${escapeHtml(compBoardSearch)}" oninput="compBoardSearch = this.value; renderTeamBoard(); document.querySelector('#compBoard .cb-pool input').focus(); const i = document.querySelector('#compBoard .cb-pool input'); i.setSelectionRange(i.value.length, i.value.length);" style="width:100%; padding:7px 9px; border-radius:8px; border:1px solid var(--border, #d7dbe6); font-size:.88em;"></div>
                ${noCat.length ? `<div style="padding:8px; border-bottom:1px solid var(--border-soft, #eceef4);"><div style="font-size:.78em; font-weight:800; color:var(--danger, #dc2626); margin-bottom:4px;">No category yet: choose</div>
                    ${noCat.map((e) => `<div style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:.86em;"><span style="flex:1; font-weight:700;">${escapeHtml(compBoardName(e))}</span><button class="cb-mini" onclick="compBoardSetEntryCat(${e.id}, 'A')">A</button><button class="cb-mini" onclick="compBoardSetEntryCat(${e.id}, 'B')">B</button></div>`).join('')}</div>` : ''}
                <div class="cb-list" style="padding-top:8px;">${pool.map((e) => chip(e, null)).join('') || '<div style="color:var(--ink-faint, #99a); font-size:.82em; padding:10px 4px;">Everyone in this category is in a team.</div>'}</div>
                <div style="padding:10px; border-top:1px solid var(--border-soft, #eceef4);">
                    <div style="font-size:.78em; font-weight:800; margin-bottom:4px;">Add a student to the competition</div>
                    <input type="text" id="cbAddSearch" placeholder="Name…" oninput="compBoardAddList()" style="width:100%; padding:6px 8px; border-radius:7px; border:1px solid var(--border, #d7dbe6); font-size:.85em; margin-bottom:4px;">
                    <select id="cbAddSelect" style="width:100%; padding:6px 8px; border-radius:7px; border:1px solid var(--border, #d7dbe6); font-size:.85em; margin-bottom:6px;"></select>
                    <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:.84em;">
                        <label><input type="checkbox" id="cbAddSolo" checked> Solo</label>
                        <label><input type="checkbox" id="cbAddGroup" checked> Group</label>
                        <label><input type="checkbox" id="cbAddActivity"> Extra</label>
                        <button class="cb-mini" style="margin-left:auto;" onclick="compBoardAdd()">Add</button>
                    </div>
                </div>
            </div>
            <div class="cb-teams">${teams.map(teamCard).join('') || '<div style="color:var(--ink-soft, #667); padding:20px;">No teams in this category yet. Press <b>+ New team</b>.</div>'}</div>
        </div>
    </div>`;
    compBoardAddList();
}

// ---------- drag & drop / tap ----------
function compBoardDragStart(ev, id) {
    ev.dataTransfer.setData('text/plain', String(id));
    ev.dataTransfer.effectAllowed = 'move';
}
function compBoardOver(ev) { ev.preventDefault(); ev.currentTarget.classList.add('over'); }
function compBoardLeave(ev) { ev.currentTarget.classList.remove('over'); }
function compBoardDrop(ev, teamId) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('over');
    const id = Number(ev.dataTransfer.getData('text/plain'));
    if (id) compBoardMove(id, teamId);
}
function compBoardPickChip(id) {
    compBoardSel = compBoardSel === id ? null : id;
    renderTeamBoard();
}
function compBoardPlaceSelected(teamId) {
    if (!compBoardSel) return;
    const id = compBoardSel; compBoardSel = null;
    compBoardMove(id, teamId);
}

// One move = one saved update. The screen changes first, and goes back with a message if the save fails.
async function compBoardMove(entryId, teamId) {
    const e = compEntries.find((x) => x.id === entryId);
    if (!e || e.team_id === (teamId || null)) { renderTeamBoard(); return; }
    const team = teamId ? compTeams.find((t) => t.id === teamId) : null;
    const prev = { team_id: e.team_id, category: e.category };
    const patch = { team_id: teamId || null };
    if (team && e.category !== team.category) patch.category = team.category;   // a person without a category takes the team's
    Object.assign(e, patch);
    compBoardMsg = 'saving…'; renderTeamBoard();
    const { error } = await supabaseClient.from('comp_entries').update(patch).eq('id', entryId);
    if (error) {
        console.error('team move failed', error);
        Object.assign(e, prev);
        compBoardMsg = 'NOT saved, try again';
    } else compBoardMsg = 'saved ✓';
    renderTeamBoard();
}

// ---------- teams ----------
async function compBoardNewTeam() {
    const mine = compTeams.filter((t) => t.category === compBoardCat);
    const suggested = `${compBoardCat}${mine.filter((t) => !t.fixed).length + 1}`;
    const name = (prompt('Name of the new team:', suggested) || '').trim();
    if (!name) return;
    if (compTeams.some((t) => t.name.toLowerCase() === name.toLowerCase())) { alert('A team with this name already exists.'); return; }
    const order = Math.max(0, ...compTeams.map((t) => t.sort_order || 0)) + 1;
    const { data, error } = await supabaseClient.from('comp_teams')
        .insert({ event_id: compEvent.id, category: compBoardCat, name, fixed: false, sort_order: order }).select().single();
    if (error) { alert('Could not create the team: ' + error.message); return; }
    compTeams.push(data);
    compBoardMsg = `team ${name} created`;
    renderTeamBoard();
}
async function compBoardRename(teamId) {
    const t = compTeams.find((x) => x.id === teamId);
    const name = (prompt('Team name:', t.name) || '').trim();
    if (!name || name === t.name) return;
    if (compTeams.some((x) => x.id !== teamId && x.name.toLowerCase() === name.toLowerCase())) { alert('A team with this name already exists.'); return; }
    const { error } = await supabaseClient.from('comp_teams').update({ name }).eq('id', teamId);
    if (error) { alert('Could not rename: ' + error.message); return; }
    t.name = name; renderTeamBoard();
}
async function compBoardDeleteTeam(teamId) {
    const t = compTeams.find((x) => x.id === teamId);
    const members = compEntries.filter((e) => e.team_id === teamId && !e.withdrawn);
    if (!confirm(`Delete team ${t.name}?${members.length ? `\n\nIts ${members.length} people go back to "Not in a team".` : ''}`)) return;
    if (members.length) {
        const { error: e1 } = await supabaseClient.from('comp_entries').update({ team_id: null }).eq('team_id', teamId);
        if (e1) { alert('Could not empty the team: ' + e1.message); return; }
        compEntries.forEach((e) => { if (e.team_id === teamId) e.team_id = null; });
    }
    const { error } = await supabaseClient.from('comp_teams').delete().eq('id', teamId);
    if (error) { alert('Could not delete: ' + error.message); return; }
    const i = compTeams.findIndex((x) => x.id === teamId); if (i >= 0) compTeams.splice(i, 1);
    renderTeamBoard();
}
function compBoardSetCat(c) { compBoardCat = c; compBoardSel = null; renderTeamBoard(); }
async function compBoardSetEntryCat(entryId, cat) {
    const e = compEntries.find((x) => x.id === entryId);
    const { error } = await supabaseClient.from('comp_entries').update({ category: cat, team_id: null }).eq('id', entryId);
    if (error) { alert('Not saved: ' + error.message); return; }
    e.category = cat; e.team_id = null; compBoardCat = cat; renderTeamBoard();
}

// ---------- add a student to the competition ----------
function compBoardAddList() {
    const sel = document.getElementById('cbAddSelect');
    if (!sel) return;
    const term = (document.getElementById('cbAddSearch').value || '').toLowerCase();
    const taken = new Set(compEntries.filter((e) => !e.withdrawn).map((e) => e.student_id));
    const list = students.filter((s) => !taken.has(s.id) && (term ? s.name.toLowerCase().includes(term) : isStudentActive(s)))
        .sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
    sel.innerHTML = list.map((s) => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('') || '<option value="">No students</option>';
}
async function compBoardAdd() {
    const id = Number(document.getElementById('cbAddSelect').value);
    const solo = document.getElementById('cbAddSolo').checked, group = document.getElementById('cbAddGroup').checked, activity = document.getElementById('cbAddActivity').checked;
    if (!id) return;
    if (!(solo || group || activity)) { alert('Tick at least one: Solo, Group or Extra.'); return; }
    const s = compStudent(id);
    const existing = compEntries.find((e) => e.student_id === id);
    const category = solo || group ? compDefaultCategory(s && s.batch) : null;
    const flags = { do_solo: solo, do_group: group, do_activity: activity, kind: compKindFor(solo, group) };
    let res;
    if (existing) res = await supabaseClient.from('comp_entries').update({ withdrawn: false, ...flags, category: existing.category || category }).eq('id', existing.id).select().single();
    else res = await supabaseClient.from('comp_entries').insert({ event_id: compEvent.id, student_id: id, ...flags, category }).select().single();
    if (res.error) { alert('Not saved: ' + res.error.message); return; }
    if (existing) Object.assign(existing, res.data); else compEntries.push(res.data);
    if (category) compBoardCat = category;
    compBoardMsg = `${s ? s.name : 'student'} added`;
    renderTeamBoard();
}

if (typeof module !== 'undefined') module.exports = {};

// ---------- PDF of the teams: ONLY the team name and the people's names ----------
// No age, no parent, no category, no phone: safe to share as it is.
function compBoardExportPdf() {
    if (!window.jspdf) { alert('The PDF tool did not load. Reload the page and try again.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 16;
    const nameOf = (e) => compBoardName(e);
    const members = (t) => compBoardPeople().filter((e) => e.team_id === t.id).map(nameOf).sort((a, b) => a.localeCompare(b));
    const teams = compTeams.slice().sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name)).map((t) => ({ name: t.name, list: members(t) })).filter((t) => t.list.length);
    if (!teams.length) { alert('There are no teams with people yet.'); return; }
    const title = (compEvent && compEvent.title ? compEvent.title : 'Competition') + ' · Teams';
    let y = M;
    const head = () => { doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20, 26, 58); doc.text(title, M, y); y += 10; };
    head();
    const colW = (W - 2 * M) / 2;
    let col = 0, rowTop = y, rowMax = y;
    teams.forEach((t) => {
        const h = 9 + t.list.length * 5.6 + 4;
        if (col === 0 && rowTop + h > H - M) { doc.addPage(); y = M; rowTop = y; rowMax = y; }
        const x = M + col * colW;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(240, 138, 36);
        doc.text(t.name + ' (' + t.list.length + ')', x, rowTop + 5);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(20, 26, 58);
        t.list.forEach((n, i) => doc.text((i + 1) + '. ' + n, x, rowTop + 11 + i * 5.6));
        rowMax = Math.max(rowMax, rowTop + h);
        if (col === 1) { rowTop = rowMax + 2; rowMax = rowTop; col = 0; } else col = 1;
    });
    doc.save('teams.pdf');
}
