// ===== comp-live.js — logic for comp.html (see the comment at the top of comp.html) =====
(function () {
const params = new URLSearchParams(location.search);
// Secret links (admin → "Copy secret link"): comp.html#<code> hides the role
// and the PIN. The code is read once, kept for this tab, and removed from the
// address bar. A new PIN makes every old link stop working.
const SECRET_ROLES = { j1: 'judge1', j2: 'judge2', j3: 'judge3', s: 'sound', a: 'anchor', p: 'projector', d: 'door' };
function decodeSecret(code) {
    try {
        const raw = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
        const key = 'bhangra-sway';
        const txt = Array.from(raw, (ch, i) => String.fromCharCode(ch.charCodeAt(0) ^ key.charCodeAt(i % key.length))).join('');
        const m = txt.match(/^([a-z0-9]+):([0-9]{6,8})$/);
        return m && SECRET_ROLES[m[1]] ? { role: SECRET_ROLES[m[1]], pin: m[2] } : null;
    } catch (e) { return null; }
}
const SECRET = location.hash.length > 1 ? decodeSecret(location.hash.slice(1)) : null;
if (SECRET) {
    try {
        sessionStorage.setItem('comp_role', SECRET.role);
        localStorage.setItem('comp_pin_' + (SECRET.role.startsWith('judge') ? SECRET.role : 'staff'), SECRET.pin);
    } catch (e) { /* private mode: still works for this page view */ }
    history.replaceState(null, '', location.pathname);
}
const ROLE = (params.get('role') || (SECRET && SECRET.role) || (() => { try { return sessionStorage.getItem('comp_role'); } catch (e) { return null; } })() || 'control').toLowerCase();
// Remember the real role for this tab, so a judge can go to practice and come back.
if (params.get('demo') !== '1') { try { sessionStorage.setItem('comp_role', ROLE); } catch (e) { /* ignore */ } }
const DEMO = params.get('demo') === '1';
const ROLES = { control: 'Control', judge1: 'Judge 1', judge2: 'Judge 2', judge3: 'Judge 3', sound: 'Sound', anchor: 'Anchor', projector: 'Projector', door: 'Door' };
const PIN_ROLE = ROLE.startsWith('judge') ? ROLE : 'staff';
const JUDGE_NO = ROLE.startsWith('judge') ? Number(ROLE.slice(5)) : null;
const S = window.CompScore;
const CRIT_LABEL = { energy: 'Energy', technique: 'Technique', rhythm: 'Rhythm', expression: 'Expression', costume: 'Costume', sync: 'Sync', formations: 'Formations' };
// Judges choose English or Italian (EN | IT at the top). Other screens stay English.
const JUDGE_SCREEN = ROLE.startsWith('judge');
// &lang=it in the link sets it for this page view; otherwise the judge's last choice.
let LANG = params.get('lang') === 'it' || params.get('lang') === 'en' ? params.get('lang')
    : (() => { try { return localStorage.getItem('comp_lang') === 'it' ? 'it' : 'en'; } catch (e) { return 'en'; } })();
const IT = {
    'Energy': 'Energia', 'Technique': 'Tecnica', 'Rhythm': 'Ritmo', 'Expression': 'Espressione', 'Costume': 'Costume',
    'Sync': 'Sincronia', 'Formations': 'Formazioni',
    'Judge 1': 'Giudice 1', 'Judge 2': 'Giudice 2', 'Judge 3': 'Giudice 3',
    '(Best Costume only)': '(solo per Miglior Costume)',
    'Solo': 'Assolo', 'Group round': 'Gruppo', 'Category': 'Categoria', 'minutes': 'minuti',
    'Judges break': 'Pausa giudici', 'Break': 'Pausa', 'Kids special show': 'Spettacolo dei bambini',
    'All done. Thank you!': 'Finito. Grazie!', 'Waiting to start': 'In attesa dell’inizio',
    'This performance is disqualified: no scores needed.': 'Questa esibizione è squalificata: niente voti.',
    'Next:': 'Prossimo:',
    'This performance is closed: the coach already called the next participant.': 'Esibizione chiusa: l’insegnante ha già chiamato il prossimo partecipante.',
    'Not saved. Check the internet and tap again.': 'Non salvato. Controlla internet e tocca di nuovo.',
    'Sent ✓': 'Inviato ✓',
    'Waiting for the coach to call the next participant. If you change a score, press the button again.': 'In attesa che l’insegnante chiami il prossimo partecipante. Se cambi un voto, premi di nuovo il pulsante.',
    'Call next participant': 'Chiama il prossimo partecipante',
    'Saving…': 'Salvataggio…',
    'All filled. Press the button when you are sure.': 'Tutto compilato. Premi il pulsante quando sei sicuro.',
    'Fill all {n} to send ({f} of {n} done)': 'Compila tutti i {n} per inviare ({f} di {n} fatti)',
    'PRACTICE: these scores do not count': 'PROVA: questi voti non contano',
    'Score the fake dancer and press "Call next participant". Try changing a score after sending too.': 'Vota il ballerino finto e premi "Chiama il prossimo partecipante". Prova anche a cambiare un voto dopo l’invio.',
    'Practice: next fake dancer': 'Prova: prossimo ballerino finto',
    'In the real competition the coach does this.': 'Nella gara vera lo fa l’insegnante.',
    'Done practising: go to real scoring': 'Prova finita: vai ai voti veri',
    'First time? Practice with fake dancers': 'Prima volta? Prova con ballerini finti',
    'Enter the PIN the coach gave you.': 'Inserisci il PIN che ti ha dato l’insegnante.',
    'Open': 'Apri', 'Wrong PIN. Try again.': 'PIN sbagliato. Riprova.',
    'Too many wrong PINs from this device. Wait 15 minutes, then try again.': 'Troppi PIN sbagliati da questo dispositivo. Aspetta 15 minuti e riprova.'
};
// tr('text', {n: 5}) → Italian on judge screens when chosen, else the English text.
function tr(en, vars) {
    let out = JUDGE_SCREEN && LANG === 'it' && IT[en] ? IT[en] : en;
    if (vars) Object.keys(vars).forEach((k) => { out = out.split('{' + k + '}').join(String(vars[k])); });
    return out;
}
function renderLangSwitch() {
    const box = document.getElementById('langSwitch');
    if (!box) return;
    if (!JUDGE_SCREEN) { box.innerHTML = ''; return; }
    box.innerHTML = ['en', 'it'].map((l) => `<button onclick="setCompLang('${l}')" style="padding:4px 10px; border-radius:999px; font-weight:800; font-size:.78em; border:1px solid var(--line); background:${LANG === l ? 'var(--saffron)' : 'transparent'}; color:${LANG === l ? '#1b1000' : 'var(--soft)'};">${l.toUpperCase()}</button>`).join('');
    document.getElementById('roleChip').textContent = tr(ROLES[ROLE] || ROLE);
}
window.setCompLang = (l) => {
    LANG = l === 'it' ? 'it' : 'en';
    try { localStorage.setItem('comp_lang', LANG); } catch (e) { /* ignore */ }
    renderLangSwitch();
    lastRenderKey = '';
    if (st && st.status === 'bad_pin') pinGate(); else render();
};
const DOOR_PRICE = 5;
const CHANGEOVER_SECONDS = 60;

const app = document.getElementById('app');
document.getElementById('roleChip').textContent = ROLES[ROLE] || ROLE;
document.getElementById('demoChip').classList.toggle('hidden', !DEMO);
if (ROLE === 'projector') { document.body.classList.add('projector'); document.getElementById('topBar').classList.add('hidden'); }
setTimeout(() => renderLangSwitch(), 0);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mmss = (sec) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ordinal = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[n] || `${n}th`);
let supa = null;
try { supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); } catch (e) { /* offline demo still works */ }
const songUrl = (path) => (!path ? null : path.startsWith('demo:') ? null : supa ? supa.storage.from('comp-songs').getPublicUrl(path).data.publicUrl : null);

// ---------------------------------------------------------------- backends
// Every screen works on the same normalised state:
// { event, live, slots[], teams[], scores{slotId:{1:{},2:{},3:{}}}, kids[], serverOffset }
// ---- Demo: fake event in localStorage, shared between tabs ----
const DEMO_KEY = 'comp_demo_state_v1';
const DEMO_NAMES = ['Arjun', 'Simran', 'Gurleen', 'Harman', 'Jaspreet', 'Kiran', 'Manvir', 'Navdeep', 'Parveen', 'Rajveer', 'Sukhman', 'Tanveer',
    'Amrit', 'Baljit', 'Charan', 'Daman', 'Ekam', 'Fateh', 'Gagan', 'Ishmeet', 'Jasleen', 'Karan', 'Lovepreet', 'Mehar', 'Noor', 'Onkar',
    'Prabh', 'Rehmat', 'Sahib', 'Taran', 'Ujjwal', 'Veer', 'Waris', 'Yuvraj', 'Zorawar', 'Aaliya', 'Bani', 'Diljot', 'Gunveer', 'Harleen', 'Inder'];
function demoFresh() {
    let seed = 11;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const teams = [
        { id: 1, name: 'B1', category: 'B' }, { id: 2, name: 'B2', category: 'B' }, { id: 3, name: 'Team Castelvetro', category: 'B' }, { id: 4, name: 'Team Mantova', category: 'B' },
        { id: 5, name: 'A1', category: 'A' }, { id: 6, name: 'A2', category: 'A' }, { id: 7, name: 'A3', category: 'A' }, { id: 8, name: 'A4', category: 'A' }];
    const entries = [];
    let k = 0;
    const addTeam = (teamId, n, cat) => { for (let i = 0; i < n; i++) entries.push({ id: 100 + k, kind: 'compete', category: cat, team_id: teamId, name: DEMO_NAMES[k++ % DEMO_NAMES.length] }); };
    addTeam(1, 5, 'B'); addTeam(2, 5, 'B'); addTeam(3, 6, 'B'); addTeam(4, 5, 'B');
    addTeam(5, 5, 'A'); addTeam(6, 5, 'A'); addTeam(7, 5, 'A'); addTeam(8, 5, 'A');
    const order = S.buildRunningOrder({ entries, teams, rand: rnd });
    const slots = order.map((o, i) => {
        const e = entries.find((x) => x.id === o.entry_id);
        return { id: i + 1, ...o, status: 'waiting', team_id: o.team_id || (e && e.team_id) || null, name: e ? e.name : null, song_path: o.kind === 'solo' || o.kind === 'group' ? 'demo:song' : null, song_seconds: o.kind === 'solo' ? (o.category === 'A' ? 121 : 92) : o.kind === 'group' ? (o.category === 'A' ? 330 : 238) : null };
    });
    return {
        event: { id: 1, title: 'Bhangra Competition 2027', status: 'live', settings: { gap: 1, extras_on: false } },
        live: { current_slot_id: null, phase: 'idle', phase_started_at: null, revealed: null, door_cash: 0, door_free: 0 },
        slots, teams, scores: {}, kids: ['Amaira', 'Ranbir', 'Siya', 'Kabir'],
        judgeNames: { 1: 'Judge 1', 2: 'Judge 2', 3: 'Judge 3' }
    };
}
// Practice runs can start from a ready-made moment (&preset=live | results),
// handy for rehearsing a screen without clicking through the whole day.
function demoPreset(s, preset) {
    if (!preset) return;
    const fake = (slot) => {
        const base = (slot.category === 'A' ? 8 : 6.6) + ((slot.id * 37) % 13) / 10 - 0.6;
        const crit = slot.kind === 'solo' ? S.SOLO_CRITERIA.concat(S.SOLO_EXTRA) : S.GROUP_CRITERIA;
        s.scores[slot.id] = {};
        [1, 2, 3].forEach((j) => { s.scores[slot.id][j] = Object.fromEntries(crit.map((c, i) => [c, Math.max(1, Math.min(10, Math.round((base + ((j * 7 + i * 3 + slot.id) % 5) / 5 - 0.4) * 2) / 2))])); });
        s.submitted = s.submitted || {};
        s.submitted[slot.id] = { 1: true, 2: true, 3: true };
    };
    if (preset === 'live') {
        const cur = s.slots.filter((x) => x.kind === 'solo')[5];
        s.slots.filter((x) => x.position < cur.position).forEach((x) => { x.status = 'done'; if (x.kind === 'solo') fake(x); });
        fake(cur);
        delete s.scores[cur.id][3];
        s.scores[cur.id][2] = { energy: 7, technique: 6.5 };
        s.submitted[cur.id] = { 1: true };
        // judge practice starts with an empty card
        if (params.get('autonext') === '1') { delete s.scores[cur.id]; delete s.submitted[cur.id]; }
        s.live = { ...s.live, current_slot_id: cur.id, phase: 'performing', phase_started_at: new Date(Date.now() - 47000).toISOString(), door_cash: 63, door_free: 9 };
    }
    if (preset === 'results' || preset === 'reveal') {
        s.slots.forEach((x) => { x.status = 'done'; if (x.kind === 'solo' || x.kind === 'group') fake(x); });
        s.live = { ...s.live, current_slot_id: null, phase: 'results', door_cash: 81, door_free: 12 };
    }
    if (preset === 'reveal') {
        const r = S.computeResults({ slots: s.slots, scores: s.scores, teams: s.teams, gap: 1 });
        const cats = {};
        ['B', 'A'].forEach((c) => { cats[c] = { teams: r[c].teams.map((t) => ({ pos: t.opt1, name: t.name })), awards: r[c].awards.map((a) => ({ award: a.award, name: a.name, team: a.team })) }; });
        s.live.revealed = { option: 1, cats, at: new Date().toISOString() };
    }
}
const demo = {
    read() {
        try { const s = JSON.parse(localStorage.getItem(DEMO_KEY)); if (s && s.slots) return s; } catch (e) { /* fresh */ }
        const f = demoFresh();
        demoPreset(f, params.get('preset'));
        this.write(f);
        return f;
    },
    write(s) { try { localStorage.setItem(DEMO_KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } },
    async state() {
        const s = this.read();
        // Judge practice (&autonext=1) has no coach: always keep a fake dancer
        // on stage, starting over when the list runs out.
        if (JUDGE_SCREEN && params.get('autonext') === '1') {
            const cur = s.slots.find((x) => x.id === s.live.current_slot_id);
            if (!cur || (cur.kind !== 'solo' && cur.kind !== 'group') || cur.status === 'disqualified') {
                let nxt = s.slots.find((x) => x.status === 'waiting' && (x.kind === 'solo' || x.kind === 'group'));
                if (!nxt) { s.slots.forEach((x) => { x.status = 'waiting'; }); nxt = s.slots.find((x) => x.kind === 'solo'); }
                s.scores = s.scores || {}; s.submitted = s.submitted || {};
                delete s.scores[nxt.id]; delete s.submitted[nxt.id];
                s.live = { ...s.live, current_slot_id: nxt.id, phase: 'performing', phase_started_at: new Date().toISOString(), revealed: null };
                this.write(s);
            }
        }
        s.submitted = s.submitted || {};
        return { ...s, serverOffset: 0,
            myScores: JUDGE_NO ? Object.fromEntries(Object.entries(s.scores).map(([k, v]) => [k, v[JUDGE_NO] || {}])) : null,
            mySubmitted: JUDGE_NO ? Object.keys(s.submitted).filter((k) => s.submitted[k][JUDGE_NO]).map(Number) : null,
            judgeName: JUDGE_NO ? s.judgeNames[JUDGE_NO] : null };
    },
    async mutate(fn) { const s = this.read(); fn(s); this.write(s); },
    async judgeSave(slotId, criteria, submitted) {
        let status = 'ok';
        await this.mutate((s) => {
            if (s.live.current_slot_id !== slotId) { status = 'locked'; return; }
            s.scores[slotId] = s.scores[slotId] || {}; s.scores[slotId][JUDGE_NO] = criteria;
            s.submitted = s.submitted || {}; s.submitted[slotId] = s.submitted[slotId] || {}; s.submitted[slotId][JUDGE_NO] = !!submitted;
        });
        return status;
    },
    async door(kind, delta) { await this.mutate((s) => { const k = kind === 'cash' ? 'door_cash' : 'door_free'; s.live[k] = Math.max(0, (s.live[k] || 0) + delta); }); },
    async setLive(patch) { await this.mutate((s) => Object.assign(s.live, patch)); },
    async setSlot(id, patch) { await this.mutate((s) => Object.assign(s.slots.find((x) => x.id === id), patch)); },
    async setSettings(patch) { await this.mutate((s) => Object.assign(s.event.settings, patch)); },
    async reset() { localStorage.removeItem(DEMO_KEY); this.read(); },
    async restart() {
        await this.mutate((s) => {
            s.scores = {};
            s.slots.forEach((x) => { x.status = 'waiting'; });
            s.live = { ...s.live, current_slot_id: null, phase: 'idle', phase_started_at: null, revealed: null, door_cash: 0, door_free: 0 };
        });
    },
    async fakeScores(slotId) {
        await this.mutate((s) => {
            const slot = s.slots.find((x) => x.id === slotId);
            if (!slot || (slot.kind !== 'solo' && slot.kind !== 'group')) return;
            const base = (slot.category === 'A' ? 8 : 6.6) + ((slotId * 37) % 13) / 10 - 0.6;
            const crit = slot.kind === 'solo' ? S.SOLO_CRITERIA.concat(S.SOLO_EXTRA) : S.GROUP_CRITERIA;
            s.scores[slotId] = {};
            [1, 2, 3].forEach((j) => { s.scores[slotId][j] = Object.fromEntries(crit.map((c, i) => [c, Math.max(1, Math.min(10, Math.round((base + ((j * 7 + i * 3 + slotId) % 5) / 5 - 0.4) * 2) / 2))])); });
            s.submitted = s.submitted || {};
            s.submitted[slotId] = { 1: true, 2: true, 3: true };
        });
    }
};

// ---- Real: Supabase. Control = admin tables; others = PIN RPCs ----
function savedPin() { try { return localStorage.getItem('comp_pin_' + PIN_ROLE) || ''; } catch (e) { return ''; } }
function savePin(p) { try { localStorage.setItem('comp_pin_' + PIN_ROLE, p); } catch (e) { /* ignore */ } }
const real = {
    eventId: null,
    async state() {
        if (ROLE === 'control') return this.controlState();
        const { data, error } = await supa.rpc('comp_screen_state', { p_role: PIN_ROLE, p_pin: savedPin() });
        if (error) throw error;
        if (data.status !== 'ok') return { status: data.status };
        this.eventId = data.event.id;
        return {
            event: data.event, live: data.live || { phase: 'idle' }, slots: data.slots || [], teams: data.teams || [],
            myScores: data.my_scores, mySubmitted: data.my_submitted || [], judgeName: data.judge_name, scores: {},
            serverOffset: new Date(data.now).getTime() - Date.now()
        };
    },
    async controlState() {
        const { data: sess } = await supa.auth.getSession();
        if (!sess || !sess.session) return { status: 'login' };
        const ev = await supa.from('comp_events').select('*').neq('status', 'finished').order('created_at', { ascending: false }).limit(1);
        if (ev.error) throw ev.error;
        const event = (ev.data || [])[0];
        if (!event) return { status: 'none' };
        this.eventId = event.id;
        const [live, slots, teams, entries, scores] = await Promise.all([
            supa.from('comp_live').select('*').eq('event_id', event.id).maybeSingle(),
            supa.from('comp_slots').select('*').eq('event_id', event.id).order('position'),
            supa.from('comp_teams').select('*').eq('event_id', event.id).order('sort_order'),
            supa.from('comp_entries').select('id, student_id, kind, category, team_id, withdrawn, solo_song_path, solo_song_seconds, students(name)').eq('event_id', event.id),
            supa.from('comp_scores').select('slot_id, judge, criteria, submitted').eq('event_id', event.id)
        ]);
        for (const r of [live, slots, teams, entries, scores]) if (r.error) throw r.error;
        const entryById = Object.fromEntries((entries.data || []).map((e) => [e.id, e]));
        const teamById = Object.fromEntries((teams.data || []).map((t) => [t.id, t]));
        const sc = {}, sent = {};
        (scores.data || []).forEach((r) => { (sc[r.slot_id] = sc[r.slot_id] || {})[r.judge] = r.criteria; if (r.submitted) (sent[r.slot_id] = sent[r.slot_id] || {})[r.judge] = true; });
        return {
            event, live: live.data || { phase: 'idle', door_cash: 0, door_free: 0 }, scores: sc, submitted: sent, serverOffset: 0,
            teams: teams.data || [],
            entries: entries.data || [],
            kids: (entries.data || []).filter((e) => e.kind === 'kids_show' && !e.withdrawn).map((e) => (e.students || {}).name || '?'),
            slots: (slots.data || []).map((s) => {
                const e = entryById[s.entry_id];
                const t = teamById[s.team_id || (e && e.team_id)];
                return { ...s, team_id: s.team_id || (e && e.team_id) || null, name: e ? (e.students || {}).name : null,
                    song_path: s.kind === 'solo' ? e && e.solo_song_path : s.kind === 'group' ? t && t.group_song_path : null,
                    song_seconds: s.kind === 'solo' ? e && e.solo_song_seconds : s.kind === 'group' ? t && t.group_song_seconds : null };
            })
        };
    },
    async judgeSave(slotId, criteria, submitted) {
        const { data, error } = await supa.rpc('comp_judge_save', { p_role: PIN_ROLE, p_pin: savedPin(), p_slot_id: slotId, p_criteria: criteria, p_submitted: !!submitted });
        if (error) throw error;
        return data.status;
    },
    async door(kind, delta) {
        const { data, error } = await supa.rpc('comp_door_count', { p_pin: savedPin(), p_kind: kind, p_delta: delta });
        if (error) throw error;
        if (data.status !== 'ok') throw new Error(data.status === 'too_many' ? 'too many wrong PINs, wait 15 minutes' : data.status);
    },
    async setLive(patch) {
        const { error } = await supa.from('comp_live').upsert({ event_id: this.eventId, ...patch, updated_at: new Date().toISOString() });
        if (error) throw error;
    },
    async setSlot(id, patch) { const { error } = await supa.from('comp_slots').update(patch).eq('id', id); if (error) throw error; },
    async setSettings(patch) {
        const { data } = await supa.from('comp_events').select('settings').eq('id', this.eventId).single();
        const { error } = await supa.from('comp_events').update({ settings: { ...(data.settings || {}), ...patch } }).eq('id', this.eventId);
        if (error) throw error;
    },
    // Lottery running order from the locked teams (replaces any old order).
    async restart() {
        const del = await supa.from('comp_scores').delete().eq('event_id', this.eventId);
        if (del.error) throw del.error;
        const upd = await supa.from('comp_slots').update({ status: 'waiting' }).eq('event_id', this.eventId);
        if (upd.error) throw upd.error;
        await this.setLive({ current_slot_id: null, phase: 'idle', phase_started_at: null, revealed: null, door_cash: 0, door_free: 0 });
    },
    async buildOrder(st) {
        const entries = st.entries.filter((e) => !e.withdrawn);
        const order = S.buildRunningOrder({ entries, teams: st.teams });
        const del = await supa.from('comp_slots').delete().eq('event_id', this.eventId);
        if (del.error) throw del.error;
        const rows = order.map((o) => ({ event_id: this.eventId, position: o.position, code: o.code || null, category: o.category, kind: o.kind,
            entry_id: o.entry_id || null, team_id: o.team_id || null, label: o.label || null, minutes: o.minutes || null }));
        const ins = await supa.from('comp_slots').insert(rows);
        if (ins.error) throw ins.error;
        await supa.from('comp_events').update({ status: 'live' }).eq('id', this.eventId);
        await this.setLive({ current_slot_id: null, phase: 'idle', phase_started_at: null, revealed: null, door_cash: 0, door_free: 0 });
    }
};
const backend = DEMO ? demo : real;

// ---------------------------------------------------------------- state loop
let st = null;            // last state
let lastErr = '';
async function refresh() {
    try {
        st = await backend.state();
        lastErr = '';
    } catch (err) {
        console.error(err);
        lastErr = err.message || String(err);
    }
    render();
}
const POLL_MS = ROLE === 'control' ? 1500 : 1000;
let pollTimer = null;
function startPolling() { clearInterval(pollTimer); pollTimer = setInterval(refresh, POLL_MS); refresh(); }
if (DEMO) window.addEventListener('storage', (e) => { if (e.key === DEMO_KEY) refresh(); });
// clocks that tick between polls
setInterval(() => {
    document.querySelectorAll('[data-clock]').forEach(updateClock);
    document.querySelectorAll('[data-clock-sub]').forEach((el) => { el.textContent = (clockInfo() || {}).sub || ''; });
}, 250);

function nowServer() { return Date.now() + ((st && st.serverOffset) || 0); }
function current() { return st && st.slots.find((s) => s.id === (st.live || {}).current_slot_id) || null; }
function teamName(id) { return ((st && st.teams.find((t) => t.id === id)) || {}).name || ''; }
function slotTitle(s) {
    if (!s) return '';
    if (s.kind === 'solo') return s.name || 'Solo';
    if (s.kind === 'group') return 'Team ' + teamName(s.team_id).replace(/^Team /, '');
    return tr(s.label || (s.kind === 'kids' ? 'Kids special show' : 'Break'));
}
function slotSub(s) {
    if (!s) return '';
    if (s.kind === 'solo') return `${tr('Solo')} · ${teamName(s.team_id)} · ${tr('Category')} ${s.category}`;
    if (s.kind === 'group') return `${tr('Group round')} · ${tr('Category')} ${s.category}`;
    if (s.kind === 'break') return s.minutes ? `${s.minutes} ${tr('minutes')}` : '';
    return '';
}
function nextWaiting(fromPos, n) {
    const out = [];
    for (const s of st.slots) if (s.position > fromPos && s.status === 'waiting') { out.push(s); if (out.length >= (n || 1)) break; }
    return out;
}
// What the big clock shows: performing → time used vs the allowed length;
// changeover → 1:00 counting down; break → its minutes counting down.
function clockInfo() {
    const live = (st && st.live) || {};
    const cur = current();
    if (!cur) return null;
    // Finished: the clock stops at the time danced. No time limit (coach's choice): never red.
    if (live.phase === 'finished') {
        return { mode: 'stop', text: mmss(Number(live.last_seconds) || 0), over: false, sub: 'finished · time danced' };
    }
    if (!live.phase_started_at) return null;
    const elapsed = (nowServer() - new Date(live.phase_started_at).getTime()) / 1000;
    if (live.phase === 'performing') {
        return { mode: 'up', text: mmss(elapsed), over: false, sub: 'dancing' };
    }
    if (live.phase === 'changeover') { const left = CHANGEOVER_SECONDS - elapsed; return { mode: 'down', text: mmss(left), over: left < 0, sub: 'get ready' }; }
    if (live.phase === 'break') { const left = (Number(cur.minutes) || 5) * 60 - elapsed; return { mode: 'down', text: mmss(left), over: left < 0, sub: 'break' }; }
    return null;
}
function updateClock(el) { const c = clockInfo(); el.textContent = c ? c.text : ''; el.classList.toggle('over', !!(c && c.over)); }
const clock = (cls) => { const c = clockInfo(); return `<span class="big-timer ${cls || ''} ${c && c.over ? 'over' : ''}" data-clock>${c ? c.text : ''}</span>`; };

// ---------------------------------------------------------------- PIN / login gates
function pinGate(message) {
    app.innerHTML = `<div class="wrap" style="max-width:420px; padding-top:10vh;">
        <div class="card">
            <h2 style="margin:0 0 6px;">${esc(tr(ROLES[ROLE] || ROLE))}</h2>
            <p class="muted" style="margin:0 0 16px;">${esc(tr(message || 'Enter the PIN the coach gave you.'))}</p>
            <input class="pin" id="pinInput" inputmode="numeric" maxlength="8" autocomplete="off">
            <button class="btn primary" style="width:100%; margin-top:12px;" id="pinGo">${tr('Open')}</button>
        </div></div>`;
    const go = () => { savePin(document.getElementById('pinInput').value.trim()); startPolling(); };
    document.getElementById('pinGo').onclick = go;
    document.getElementById('pinInput').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    document.getElementById('pinInput').focus();
}
function messageScreen(title, text) {
    app.innerHTML = `<div class="wrap" style="max-width:520px; padding-top:12vh; text-align:center;"><div class="card"><h2 style="margin:0 0 8px;">${esc(title)}</h2><p class="muted" style="margin:0;">${text}</p></div></div>`;
}

// ---------------------------------------------------------------- render
let lastRenderKey = '';
function render() {
    if (!st) { if (lastErr) messageScreen('Cannot connect', esc(lastErr)); return; }
    if (st.status === 'bad_pin') { clearInterval(pollTimer); pinGate(savedPin() ? 'Wrong PIN. Try again.' : null); return; }
    if (st.status === 'too_many') { clearInterval(pollTimer); savePin(''); pinGate('Too many wrong PINs from this device. Wait 15 minutes, then try again.'); return; }
    if (st.status === 'login') { messageScreen('Log in first', 'Open <a href="admin.html" style="color:var(--saffron);">admin.html</a> on this device, log in, then come back here.'); return; }
    if (st.status === 'none') { messageScreen('No competition', 'There is no open competition.'); return; }
    document.getElementById('topTitle').textContent = st.event.title;
    const views = { control: renderControl, judge1: renderJudge, judge2: renderJudge, judge3: renderJudge, sound: renderSound, anchor: renderAnchor, projector: renderProjector, door: renderDoor };
    (views[ROLE] || renderControl)();
}
// Only rebuild the DOM when something visible changed (keeps taps, audio and scroll steady).
function paint(key, html, after) {
    if (key === lastRenderKey) return;
    lastRenderKey = key;
    app.innerHTML = html;
    if (after) after();
}

// ---------------- CONTROL ----------------
let ctrlTab = params.get('tab') || 'live';
let resCat = params.get('cat') || 'B';
let busy = false;
async function act(fn) {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (err) { console.error(err); alert('Something went wrong: ' + (err.message || err)); }
    busy = false;
    lastRenderKey = '';
    await refresh();
}
const C = window.CompControl = {
    tab(t) { ctrlTab = t; lastRenderKey = ''; render(); },
    cat(c) { resCat = c; lastRenderKey = ''; render(); },
    start() { return act(() => backend.setLive({ phase: 'performing', phase_started_at: new Date().toISOString() })); },
    // The dance ended: freeze the clock at the time danced; judges finish scoring.
    stop() {
        const live = st.live || {};
        const sec = live.phase_started_at ? Math.round((nowServer() - new Date(live.phase_started_at).getTime()) / 1000) : 0;
        return act(() => backend.setLive({ phase: 'finished', last_seconds: sec, phase_started_at: new Date().toISOString() }));
    },
    // Next: the current one is done (scores close for it), go to the next waiting slot.
    // Blocked until all 3 judges have scored every point of this performance.
    next() {
        const cur = current();
        const missing = judgesMissing(cur);
        if (missing.length) { alert(`Waiting for ${missing.map((j) => 'Judge ' + j).join(', ')} to finish scoring.`); return; }
        return act(async () => {
            const cur = current();
            if (cur && cur.status === 'waiting') await backend.setSlot(cur.id, { status: 'done' });
            const nxt = nextWaiting(cur ? cur.position : 0)[0];
            if (!nxt) { await backend.setLive({ current_slot_id: null, phase: 'results', phase_started_at: null }); return; }
            await backend.setLive({ current_slot_id: nxt.id, phase: nxt.kind === 'break' ? 'break' : 'changeover', phase_started_at: new Date().toISOString() });
        });
    },
    undo() {
        return act(async () => {
            const cur = current();
            const prev = [...st.slots].reverse().find((s) => s.position < (cur ? cur.position : Infinity) && s.status !== 'waiting');
            if (!prev) return;
            if (!confirm(`Go back to ${prev.code || ''} ${slotTitle(prev)}? Judges can change its scores again.`)) return;
            await backend.setSlot(prev.id, { status: 'waiting' });
            await backend.setLive({ current_slot_id: prev.id, phase: 'changeover', phase_started_at: new Date().toISOString() });
        });
    },
    moveToEnd() {
        const cur = current();
        if (!cur || !confirm(`Move ${slotTitle(cur)} to the end of the order?`)) return;
        return act(async () => {
            const maxPos = Math.max(...st.slots.map((s) => s.position));
            const nxt = nextWaiting(cur.position)[0];
            await backend.setSlot(cur.id, { position: maxPos + 1 });
            await backend.setLive({ current_slot_id: nxt ? nxt.id : null, phase: nxt ? (nxt.kind === 'break' ? 'break' : 'changeover') : 'idle', phase_started_at: new Date().toISOString() });
        });
    },
    disqualify() {
        const cur = current();
        if (!cur || !confirm(`Disqualify ${slotTitle(cur)}? This is your decision; you can undo it with "Back".`)) return;
        return act(async () => { await backend.setSlot(cur.id, { status: 'disqualified' }); });
    },
    jump(id) {
        const s = st.slots.find((x) => x.id === id);
        if (!s || !confirm(`Put ${s.code || ''} ${slotTitle(s)} on stage now?`)) return;
        return act(async () => {
            if (s.status !== 'waiting') await backend.setSlot(s.id, { status: 'waiting' });
            await backend.setLive({ current_slot_id: s.id, phase: s.kind === 'break' ? 'break' : 'changeover', phase_started_at: new Date().toISOString() });
        });
    },
    gap(g) { return act(() => backend.setSettings({ gap: g })); },
    extras(on) { return act(() => backend.setSettings({ extras_on: on })); },
    option(o) { return act(() => backend.setSettings({ option: o })); },
    reveal() {
        const snap = revealSnapshot();
        if (!confirm('Show the results on the projector now?')) return;
        return act(() => backend.setLive({ revealed: snap, phase: 'results' }));
    },
    hide() { return act(() => backend.setLive({ revealed: null })); },
    buildOrder() {
        // Only after the teams are locked: making the order closes registration.
        if (st.event.status === 'registration') { alert('Registration is still open. Lock the teams first (admin → Performances → "Lock teams + charge fee"), then make the running order.'); return; }
        if (!confirm(st.slots.length ? 'Make a NEW running order (new lottery)? The current order and any scores are replaced.' : 'Make the running order now? Songs can no longer be changed by the dancers after this.')) return;
        return act(() => backend.buildOrder(st));
    },
    // Same running order, everything else back to zero (after a rehearsal).
    restart() {
        const typed = prompt('Restart the competition?\n\nAll judge scores, results on the projector and the door counts are deleted. The running order stays the same.\n\nType RESTART to confirm:');
        if ((typed || '').trim().toUpperCase() !== 'RESTART') return;
        return act(() => backend.restart());
    },
    demoScores() { const cur = current(); if (cur) return act(() => demo.fakeScores(cur.id)); },
    demoAll() {
        return act(async () => {
            for (const s of st.slots) if (s.kind === 'solo' || s.kind === 'group') await demo.fakeScores(s.id);
            await demo.mutate((x) => { x.slots.forEach((s) => { s.status = 'done'; }); x.live.current_slot_id = null; x.live.phase = 'results'; });
        });
    },
    demoReset() { if (confirm('Start the practice run again from the beginning?')) return act(() => demo.reset()); },
    certificates(kind) { makeCertificates(kind); }
};

function results() {
    const set = st.event.settings || {};
    return S.computeResults({ slots: st.slots, scores: st.scores || {}, teams: st.teams, gap: Number(set.gap ?? 1), extrasOn: !!set.extras_on });
}
function teamPos(t, option) { return option === 2 ? t.opt2 : t.opt1; }
// What the projector shows: team positions (no scores) + special awards.
function revealSnapshot() {
    const set = st.event.settings || {};
    const option = Number(set.option || 1);
    const r = results();
    const cats = {};
    ['B', 'A'].forEach((c) => {
        cats[c] = {
            teams: r[c].teams.filter((t) => !t.disqualified).map((t) => ({ pos: teamPos(t, option), name: t.name })),
            awards: r[c].awards.map((a) => ({ award: a.award, name: a.name, team: a.team }))
        };
    });
    return { option, cats, at: new Date().toISOString() };
}

function renderControl() {
    const live = st.live || {};
    const cur = current();
    const set = st.event.settings || {};
    const tabs = `<div class="seg" style="margin-bottom:14px;">${[['live', 'Live'], ['order', 'Running order'], ['results', 'Results'], ['certs', 'Certificates']].map(([k, l]) =>
        `<button class="${ctrlTab === k ? 'on' : ''}" onclick="CompControl.tab('${k}')">${l}</button>`).join('')}</div>`;
    const key = JSON.stringify([ctrlTab, resCat, live, st.slots.map((s) => [s.id, s.status, s.position]), set, Object.keys(st.scores || {}).length, cur && st.scores && st.scores[cur.id], busy]);
    let body = '';
    if (!st.slots.length) {
        body = `<div class="card"><h3 style="margin-top:0;">Running order</h3>
            <p class="muted">No running order yet. When the teams are locked and the songs are in, make it here: a lottery inside each category, B first, never two dancers of the same team one after the other, a judges break every 11 solos.</p>
            ${st.event.status === 'registration'
                ? `<p style="color:#ffb3b1; font-weight:700;">Registration is still open. Lock the teams in admin first; then the running order can be made here.</p>`
                : `<button class="btn primary" onclick="CompControl.buildOrder()" ${DEMO ? 'disabled' : ''}>Make running order (lottery)</button>`}</div>`;
    } else if (ctrlTab === 'live') body = controlLive(cur, live);
    else if (ctrlTab === 'order') body = controlOrder(cur);
    else if (ctrlTab === 'results') body = controlResults(set);
    else body = controlCerts();
    paint(key, `<div class="wrap">${tabs}${body}</div>`);
}
// Judges (1–3) who have not scored every point of this performance yet.
// Breaks, the kids show and disqualified performances need no scores.
function judgesMissing(cur) {
    if (!cur || (cur.kind !== 'solo' && cur.kind !== 'group') || cur.status === 'disqualified') return [];
    const sent = (st.submitted || {})[cur.id] || {};
    return [1, 2, 3].filter((j) => !sent[j]);
}
function judgeDots(cur) {
    if (!cur || (cur.kind !== 'solo' && cur.kind !== 'group')) return '';
    const sc = (st.scores || {})[cur.id] || {};
    const need = cur.kind === 'solo' ? S.SOLO_CRITERIA.concat(S.SOLO_EXTRA) : S.GROUP_CRITERIA;
    return [1, 2, 3].map((j) => {
        const n = need.filter((c) => typeof (sc[j] || {})[c] === 'number').length;
        const sent = !!(((st.submitted || {})[cur.id] || {})[j]);
        const cls = sent ? 'ok' : n ? '' : 'bad';
        return `<span class="badge ${cls}">Judge ${j}: ${sent ? 'sent' : n === need.length ? 'filled, not sent yet' : n ? `still filling (${n} of ${need.length})` : 'not started'}</span>`;
    }).join(' ');
}
function controlLive(cur, live) {
    const up = nextWaiting(cur ? cur.position : 0, 3);
    const doneCount = st.slots.filter((s) => s.status !== 'waiting').length;
    const phaseLabel = { idle: 'Not started', changeover: 'Get ready', performing: 'Dancing', finished: 'Finished', break: 'Break', results: 'All done' }[live.phase] || live.phase;
    const nowCard = cur ? `
        <div class="card" style="border-color:var(--saffron);">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div><span class="code">${esc(cur.code || '')}</span> <span class="badge now">${esc(phaseLabel)}</span> ${cur.status === 'disqualified' ? '<span class="badge bad">Disqualified</span>' : ''}</div>
                <div style="text-align:right;"><div style="font-size:2.2em;">${clock()}</div><div class="faint" style="font-size:.78em; font-weight:700;" data-clock-sub>${(clockInfo() || {}).sub || ''}</div></div>
            </div>
            <div class="huge" style="margin:8px 0 4px;">${esc(slotTitle(cur))}</div>
            <div class="muted">${esc(slotSub(cur))}${cur.song_seconds ? ` · song ${mmss(cur.song_seconds)}` : ''}</div>
            <div style="margin-top:10px; display:flex; gap:6px; flex-wrap:wrap;">${judgeDots(cur)}</div>
            <div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); margin-top:14px;">
                ${live.phase === 'performing'
                    ? `<button class="btn danger" style="background:var(--red); color:#fff;" onclick="CompControl.stop()">Finished</button>`
                    : live.phase === 'finished'
                        ? `<button class="btn" onclick="if (confirm('Start this performance again from 0:00? (e.g. the music stopped)')) CompControl.start()">Start again</button>`
                        : (cur.kind === 'solo' || cur.kind === 'group' || cur.kind === 'kids') ? `<button class="btn go" onclick="CompControl.start()">Start</button>` : ''}
                ${judgesMissing(cur).length
                    ? `<button class="btn primary" disabled title="All 3 judges must finish first">Waiting for judges (${3 - judgesMissing(cur).length}/3)</button>`
                    : `<button class="btn primary" onclick="CompControl.next()">Next</button>`}
                <button class="btn" onclick="CompControl.undo()">Back</button>
                ${cur.kind === 'solo' || cur.kind === 'group' ? `<button class="btn" onclick="CompControl.moveToEnd()">Move to end</button>
                <button class="btn danger" onclick="CompControl.disqualify()">Disqualify</button>` : ''}
            </div>
            ${judgesMissing(cur).length ? `<div style="margin-top:10px; font-size:.85em;" class="faint">Next opens when all 3 judges have pressed "Call next participant". A judge's phone stopped? Open the same judge link on another phone: the scores already saved come back.</div>` : ''}
            ${DEMO && (cur.kind === 'solo' || cur.kind === 'group') ? `<button class="btn small" style="margin-top:10px;" onclick="CompControl.demoScores()">Practice: fill fake judge scores</button>` : ''}
        </div>` : `
        <div class="card" style="border-color:var(--saffron);">
            <div class="huge">${live.phase === 'results' ? 'All performances done' : 'Ready to start'}</div>
            <p class="muted">${live.phase === 'results' ? 'Open Results, check them and reveal on the projector.' : 'Press Next to call the first performer.'}</p>
            <button class="btn primary" onclick="${live.phase === 'results' ? "CompControl.tab('results')" : 'CompControl.next()'}">${live.phase === 'results' ? 'Results' : 'Call the first performer'}</button>
            ${DEMO ? `<button class="btn small" style="margin-left:8px;" onclick="CompControl.demoAll()">Practice: score everything</button>` : ''}
        </div>`;
    return `<div class="grid two" style="grid-template-columns:1.4fr 1fr;">
        <div class="grid">${nowCard}
            <div class="card"><div class="faint" style="font-size:.8em; font-weight:700; margin-bottom:6px;">UP NEXT</div>
                ${up.map((s, i) => `<div class="list-row"><span class="code" style="min-width:54px;">${esc(s.code || '')}</span><div style="flex:1;"><div style="font-weight:700;">${esc(slotTitle(s))}</div><div class="faint" style="font-size:.82em;">${esc(slotSub(s))}</div></div>${i === 0 ? '<span class="badge">next</span>' : i === 1 ? '<span class="badge">get ready</span>' : ''}</div>`).join('') || '<div class="faint">Nothing left.</div>'}
            </div></div>
        <div class="grid">
            <div class="card"><div class="faint" style="font-size:.8em; font-weight:700;">PROGRESS</div>
                <div style="font-size:2em; font-weight:900; margin:4px 0;">${doneCount} / ${st.slots.length}</div>
                <div style="height:8px; background:var(--bg2); border-radius:9px; overflow:hidden;"><div style="height:100%; width:${Math.round(doneCount / Math.max(1, st.slots.length) * 100)}%; background:var(--saffron);"></div></div></div>
            <div class="card"><div class="faint" style="font-size:.8em; font-weight:700;">DOOR</div>
                <div style="display:flex; gap:18px; margin-top:6px;"><div><div style="font-size:1.8em; font-weight:900;">€${(live.door_cash || 0) * DOOR_PRICE}</div><div class="faint" style="font-size:.82em;">${live.door_cash || 0} paid</div></div>
                <div><div style="font-size:1.8em; font-weight:900;">${live.door_free || 0}</div><div class="faint" style="font-size:.82em;">under 6, free</div></div></div></div>
            <div class="card"><div class="faint" style="font-size:.8em; font-weight:700; margin-bottom:8px;">SCREENS</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">${['judge1', 'judge2', 'judge3', 'sound', 'anchor', 'projector', 'door'].map((r) => `<a class="btn small" href="comp.html?role=${r}${DEMO ? '&demo=1' : ''}" target="_blank" rel="noopener">${ROLES[r]}</a>`).join('')}</div>
                <button class="btn small danger" style="margin-top:10px;" onclick="CompControl.restart()">Restart (clear scores)</button></div>
        </div></div>`;
}
function controlOrder(cur) {
    return `<div class="card"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
        <h3 style="margin:0;">Running order</h3><div style="display:flex; gap:8px;"><button class="btn small danger" onclick="CompControl.restart()">Restart (clear scores)</button>${DEMO ? '' : `<button class="btn small" onclick="CompControl.buildOrder()">New lottery</button>`}</div></div>
        ${st.slots.map((s) => `<div class="list-row ${cur && cur.id === s.id ? 'now' : ''} ${s.status !== 'waiting' ? 'done' : ''}" style="cursor:pointer;" onclick="CompControl.jump(${s.id})">
            <span class="code" style="min-width:54px;">${esc(s.code || '')}</span>
            <div style="flex:1;"><div style="font-weight:700;">${esc(slotTitle(s))}</div><div class="faint" style="font-size:.8em;">${esc(slotSub(s))}</div></div>
            ${(s.kind === 'solo' || s.kind === 'group') ? (s.song_path ? `<span class="badge ok">song ${s.song_seconds ? mmss(s.song_seconds) : ''}</span>` : '<span class="badge bad">no song</span>') : ''}
            ${s.status === 'disqualified' ? '<span class="badge bad">DQ</span>' : s.status === 'done' ? '<span class="badge">done</span>' : ''}
        </div>`).join('')}</div>`;
}
function controlResults(set) {
    const r = results()[resCat];
    const option = Number(set.option || 1);
    const gap = Number(set.gap ?? 1);
    const incomplete = r.solos.filter((s) => !s.complete && !s.disqualified).length + r.teams.filter((t) => !t.complete).length;
    return `<div class="card" style="margin-bottom:14px; display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
            <div class="seg">${['B', 'A'].map((c) => `<button class="${resCat === c ? 'on' : ''}" onclick="CompControl.cat('${c}')">Category ${c}</button>`).join('')}</div>
            <div class="seg">${[1, 2].map((o) => `<button class="${option === o ? 'on' : ''}" onclick="CompControl.option(${o})">Option ${o}</button>`).join('')}</div>
            <div style="display:flex; align-items:center; gap:6px;"><span class="faint" style="font-size:.82em; font-weight:700;">Option 2 gap</span><div class="seg">${[0, 0.5, 1, 2].map((g) => `<button class="${gap === g ? 'on' : ''}" onclick="CompControl.gap(${g})">${g}</button>`).join('')}</div></div>
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:.88em;"><input type="checkbox" ${set.extras_on ? 'checked' : ''} onchange="CompControl.extras(this.checked)"> 2 extra prizes</label>
            <div style="margin-left:auto; display:flex; gap:8px;">
                ${(st.live || {}).revealed ? `<button class="btn small" onclick="CompControl.hide()">Hide from projector</button>` : ''}
                <button class="btn primary" onclick="CompControl.reveal()">Reveal on projector</button></div>
        </div>
        ${incomplete ? `<div class="card" style="border-color:var(--red); margin-bottom:14px; color:#ffb3b1;">${incomplete} performance(s) do not have all 3 judges' scores yet.</div>` : ''}
        <div class="grid two" style="grid-template-columns:1fr 1fr;">
            <div class="card"><h3 style="margin-top:0;">Teams · Category ${resCat}</h3>
                <table><tr><th>Pos</th><th>Team</th><th>Solo avg</th><th>Group</th><th>Score</th></tr>
                ${r.teams.map((t) => `<tr><td style="font-weight:900; color:var(--gold); font-size:1.15em;">${t.disqualified ? 'DQ' : ordinal(teamPos(t, option))}</td><td style="font-weight:800;">${esc(t.name)}</td><td>${t.soloAvg}%</td><td>${t.group}/50</td><td style="font-weight:800;">${t.score}</td></tr>`).join('')}</table>
                <p class="faint" style="font-size:.8em; margin-bottom:0;">Score = 40% solo average + 60% group. Option 1: exact order, equal scores share. Option 2: teams within ${gap} point(s) of the top of their group share the position.</p></div>
            <div class="card"><h3 style="margin-top:0;">Special awards</h3>
                ${r.awards.map((a) => `<div class="list-row"><span class="badge now">${esc(a.award)}</span><div style="flex:1; font-weight:800;">${esc(a.name)}</div><span class="faint">${esc(a.team)}</span></div>`).join('') || '<div class="faint">No scores yet.</div>'}</div>
        </div>
        <div class="card" style="margin-top:14px;"><h3 style="margin-top:0;">Solos · Category ${resCat}</h3>
            <table><tr><th>#</th><th>Dancer</th><th>Team</th><th>Solo /40</th><th>Expression</th><th>Costume</th><th></th></tr>
            ${r.solos.map((s, i) => `<tr style="${s.disqualified ? 'opacity:.45;' : ''}"><td class="faint">${i + 1}</td><td style="font-weight:700;">${esc(s.name)}</td><td class="muted">${esc(s.teamName)}</td><td style="font-weight:800;">${s.soloTotal}</td><td>${s.expression}</td><td>${s.costume}</td><td>${s.disqualified ? '<span class="badge bad">DQ</span>' : s.complete ? '' : `<span class="badge bad">${s.judges}/3 judges</span>`}</td></tr>`).join('')}</table></div>`;
}
function controlCerts() {
    return `<div class="card"><h3 style="margin-top:0;">Certificates (PDF, A4, ready to print)</h3>
        <p class="muted">They use the results you revealed (option and positions). Reveal first.</p>
        <div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
            <button class="btn primary" onclick="CompControl.certificates('dancers')">Every dancer (position or participation)</button>
            <button class="btn" onclick="CompControl.certificates('awards')">Special awards</button>
            <button class="btn" onclick="CompControl.certificates('kids')">Kids show</button>
            <button class="btn" onclick="CompControl.certificates('volunteers')">Volunteers</button>
        </div>
        <div style="margin-top:14px;"><label class="faint" style="font-size:.82em; font-weight:700;">VOLUNTEERS (one name per line)</label>
            <textarea id="volNames" rows="5" oninput="try { localStorage.setItem('comp_volunteers', this.value); } catch (e) {}" style="width:100%; margin-top:6px; border-radius:10px; background:var(--bg2); color:var(--ink); border:1px solid var(--line); padding:10px; font:inherit;">${esc((() => { try { return localStorage.getItem('comp_volunteers') || ''; } catch (e) { return ''; } })())}</textarea></div>
    </div>`;
}

// ---------------- certificates (jsPDF) ----------------
function makeCertificates(kind) {
    const snap = (st.live || {}).revealed;
    if ((kind === 'dancers' || kind === 'awards') && !snap) { alert('Reveal the results first, so the certificates match what everyone saw.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    let first = true;
    const page = (title, name, line1, line2) => {
        if (!first) doc.addPage(); first = false;
        // white page (cheap to print), saffron frame, navy text
        doc.setDrawColor(240, 138, 36); doc.setLineWidth(2.2); doc.rect(10, 10, W - 20, H - 20);
        doc.setLineWidth(0.6); doc.rect(14, 14, W - 28, H - 28);
        doc.setTextColor(240, 138, 36); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
        doc.text('BHANGRA COMPETITION 2027', W / 2, 40, { align: 'center' });
        doc.setTextColor(20, 26, 58); doc.setFontSize(34); doc.text(title, W / 2, 66, { align: 'center' });
        doc.setTextColor(110, 116, 150); doc.setFont('helvetica', 'normal'); doc.setFontSize(13); doc.text('This certificate is presented to', W / 2, 88, { align: 'center' });
        doc.setTextColor(20, 26, 58); doc.setFont('helvetica', 'bold'); doc.setFontSize(40); doc.text(name, W / 2, 112, { align: 'center' });
        doc.setDrawColor(240, 138, 36); doc.setLineWidth(0.8); doc.line(W / 2 - 70, 120, W / 2 + 70, 120);
        doc.setTextColor(40, 46, 80); doc.setFont('helvetica', 'normal'); doc.setFontSize(15);
        if (line1) doc.text(line1, W / 2, 136, { align: 'center' });
        if (line2) { doc.setTextColor(110, 116, 150); doc.setFontSize(12); doc.text(line2, W / 2, 147, { align: 'center' }); }
        doc.setTextColor(110, 116, 150); doc.setFontSize(11);
        doc.text(date, 40, 180); doc.text('Bhangra Sway', W - 40, 180, { align: 'right' });
    };
    if (kind === 'dancers') {
        ['B', 'A'].forEach((cat) => {
            const teamsInCat = snap.cats[cat].teams;
            st.slots.filter((s) => s.kind === 'solo' && s.category === cat).sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((s) => {
                const tn = teamName(s.team_id);
                const t = teamsInCat.find((x) => x.name === tn);
                const podium = t && t.pos <= 3;
                page(podium ? `${ordinal(t.pos)} Place` : 'Certificate of Participation', s.name || '', `${podium ? 'Winning team' : 'Team'}: ${tn} · Category ${cat}`, 'Thank you for your energy, dedication and bhangra spirit.');
            });
        });
    } else if (kind === 'awards') {
        ['B', 'A'].forEach((cat) => snap.cats[cat].awards.forEach((a) => page(a.award, a.name, `Category ${cat} · ${a.team}`, 'Special award')));
    } else if (kind === 'kids') {
        (st.kids || []).forEach((n) => page('Special Performance', n, 'Kids special show', 'Our youngest stars. Well done!'));
    } else {
        const names = (document.getElementById('volNames').value || '').split('\n').map((x) => x.trim()).filter(Boolean);
        try { localStorage.setItem('comp_volunteers', names.join('\n')); } catch (e) { /* ignore */ }
        if (!names.length) { alert('Type the volunteers\' names first (one per line).'); return; }
        names.forEach((n) => page('Thank You', n, 'for making the Bhangra Competition 2027 happen', 'Volunteer'));
    }
    if (first) { alert('Nothing to print yet.'); return; }
    doc.save(`certificates-${kind}.pdf`);
}

// ---------------- JUDGE ----------------
const draft = {};     // slotId -> criteria being edited (survives polls)
let saveState = '';   // '', 'saving', 'saved', 'locked', 'error'
function renderJudge() {
    const cur = current();
    const live = st.live || {};
    const scorable = cur && (cur.kind === 'solo' || cur.kind === 'group') && cur.status !== 'disqualified';
    const crit = !cur ? [] : cur.kind === 'solo' ? S.SOLO_CRITERIA.concat(S.SOLO_EXTRA) : S.GROUP_CRITERIA;
    if (scorable && !draft[cur.id]) {
        draft[cur.id] = { ...((st.myScores || {})[cur.id] || {}) };
        sentLocal[cur.id] = (st.mySubmitted || []).map(Number).includes(cur.id);
    }
    const d = scorable ? draft[cur.id] : {};
    const sent = scorable && !!sentLocal[cur.id];
    const key = JSON.stringify([cur && cur.id, live.phase, scorable && d, saveState, st.judgeName, sent, LANG]);
    if (!scorable) {
        const up = nextWaiting(cur ? cur.position : 0)[0];
        paint(key, `<div class="wrap" style="max-width:620px; text-align:center; padding-top:4vh;">${judgeModeBar()}
            <div class="faint" style="font-weight:700;">${esc(st.judgeName || tr(ROLES[ROLE]))}</div>
            <div class="huge" style="margin:14px 0;">${cur ? esc(slotTitle(cur)) : live.phase === 'results' ? tr('All done. Thank you!') : tr('Waiting to start')}</div>
            ${cur && cur.kind === 'break' ? `<div style="font-size:3em;">${clock()}</div>` : ''}
            ${cur && cur.status === 'disqualified' ? `<p class="muted">${tr('This performance is disqualified: no scores needed.')}</p>` : ''}
            ${up ? `<p class="muted">${tr('Next:')} <b>${esc(up.code || '')} ${esc(slotTitle(up))}</b></p>` : ''}</div>`);
        return;
    }
    const filled = crit.filter((c) => typeof d[c] === 'number').length;
    paint(key, `<div class="wrap" style="max-width:680px;">${judgeModeBar()}
        <div class="card" style="margin-bottom:14px; border-color:var(--saffron);">
            <div style="display:flex; justify-content:space-between; align-items:center;"><span class="code">${esc(cur.code || '')}</span><span style="font-size:1.4em;">${clock()}</span></div>
            <div class="huge" style="font-size:clamp(26px,7vw,40px); margin:6px 0 2px;">${esc(slotTitle(cur))}</div>
            <div class="muted">${esc(slotSub(cur))}</div>
        </div>
        ${crit.map((c) => {
            const v = d[c];
            const whole = typeof v === 'number' ? Math.floor(v) : null;
            const isHalf = typeof v === 'number' && v % 1 !== 0;
            return `<div class="card crit"><div class="crit-head"><span class="crit-name">${tr(CRIT_LABEL[c])}${c === 'costume' && cur.kind === 'solo' ? ` <span class="faint" style="font-size:.7em; font-weight:600;">${tr('(Best Costume only)')}</span>` : ''}</span><span class="crit-val">${typeof v === 'number' ? v : '–'}</span></div>
                <div class="nums">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="${whole === n ? 'on' : ''}" onclick="CompJudge.set('${c}', ${n})">${n}</button>`).join('')}</div>
                <button class="half ${isHalf ? 'on' : ''}" onclick="CompJudge.half('${c}')" ${whole === null || whole === 10 ? 'disabled' : ''}>+ ½</button></div>`;
        }).join('')}
        <div style="padding:4px 0 30px;">
            ${saveState === 'locked' ? `<div class="card" style="border-color:var(--red); text-align:center; color:#ffb3b1; font-weight:700;">${tr('This performance is closed: the coach already called the next participant.')}</div>`
            : saveState === 'error' ? `<div class="card" style="border-color:var(--red); text-align:center; color:#ffb3b1; font-weight:700;">${tr('Not saved. Check the internet and tap again.')}</div>`
            : sent ? `<div class="card" style="border-color:var(--green); text-align:center;"><div style="color:var(--green); font-weight:900; font-size:1.2em;">${tr('Sent ✓')}</div><div class="muted" style="margin-top:4px;">${tr('Waiting for the coach to call the next participant. If you change a score, press the button again.')}</div>${DEMO && params.get('autonext') === '1' ? `<button class="btn" style="width:100%; margin-top:12px; background:#ffc94d; color:#3a2600; border-color:#ffc94d;" onclick="CompJudge.practiceNext()">${tr('Practice: next fake dancer')}</button><div class="faint" style="font-size:.8em; margin-top:6px;">${tr('In the real competition the coach does this.')}</div>` : ''}</div>`
            : `<button class="btn primary" style="width:100%; min-height:62px; font-size:1.15em;" onclick="CompJudge.send()" ${filled === crit.length && saveState !== 'saving' ? '' : 'disabled'}>${tr('Call next participant')}</button>
               <div class="faint" style="text-align:center; margin-top:8px; font-size:.88em;">${filled === crit.length ? (saveState === 'saving' ? tr('Saving…') : tr('All filled. Press the button when you are sure.')) : tr('Fill all {n} to send ({f} of {n} done)', { n: crit.length, f: filled })}</div>`}
        </div></div>`);
}
let saveTimer = null;
const sentLocal = {};   // slotId -> this judge pressed "Call next participant"
// Real judge screen: a button to practise first. Practice screen: a clear
// warning that nothing counts, and the way back to the real scoring.
function judgeModeBar() {
    if (DEMO) return `<div class="card" style="margin-bottom:14px; background:#ffc94d; border-color:#ffc94d; color:#3a2600; text-align:left;">
        <div style="font-weight:900;">${tr('PRACTICE: these scores do not count')}</div>
        <div style="font-size:.9em; margin:4px 0 10px;">${tr('Score the fake dancer and press "Call next participant". Try changing a score after sending too.')}</div>
        <button class="btn" style="width:100%; background:#3a2600; color:#ffc94d; border-color:#3a2600;" onclick="CompJudge.real()">${tr('Done practising: go to real scoring')}</button></div>`;
    return `<div style="display:flex; justify-content:flex-end; margin-bottom:10px;"><button class="btn small" onclick="CompJudge.practice()">${tr('First time? Practice with fake dancers')}</button></div>`;
}
window.CompJudge = {
    practice() {
        try { localStorage.removeItem(DEMO_KEY); } catch (e) { /* fresh practice anyway */ }
        location.href = `comp.html?role=${ROLE}&demo=1&preset=live&autonext=1`;
    },
    real() { location.href = 'comp.html'; },
    // Any change un-sends: the judge presses the button again when sure.
    set(c, n) { const cur = current(); if (!cur) return; draft[cur.id][c] = n; sentLocal[cur.id] = false; this.queue(cur.id, false); },
    half(c) { const cur = current(); if (!cur) return; const v = draft[cur.id][c]; if (typeof v !== 'number') return; draft[cur.id][c] = v % 1 ? Math.floor(v) : Math.min(10, Math.floor(v) + 0.5); sentLocal[cur.id] = false; this.queue(cur.id, false); },
    send() { const cur = current(); if (!cur) return; clearTimeout(saveTimer); this.save(cur.id, true); },
    queue(slotId, submitted) {
        saveState = 'saving'; lastRenderKey = ''; render();
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => this.save(slotId, submitted), 350);
    },
    async save(slotId, submitted) {
        saveState = 'saving'; lastRenderKey = ''; render();
        try {
            const res = await backend.judgeSave(slotId, draft[slotId], submitted);
            saveState = res === 'ok' ? 'saved' : res === 'locked' ? 'locked' : 'error';
            if (res === 'ok' && submitted) sentLocal[slotId] = true;
        } catch (e) { console.error(e); saveState = 'error'; }
        lastRenderKey = ''; render();
    },
    // Judge practice (&demo=1&autonext=1) has no coach on the phone: the judge
    // brings the next fake dancer with a button, so they can also practise
    // changing a score after sending (like in the real competition, where the
    // coach presses Next).
    practiceNext() {
        const cur = current();
        if (!cur) return;
        saveState = '';
        demo.mutate((x) => {
            const c = x.slots.find((y) => y.id === cur.id);
            if (c) c.status = 'done';
            const nxt = x.slots.find((y) => y.position > (c ? c.position : 0) && y.status === 'waiting' && (y.kind === 'solo' || y.kind === 'group'));
            x.live = { ...x.live, current_slot_id: nxt ? nxt.id : null, phase: 'performing', phase_started_at: new Date().toISOString() };
        }).then(() => { lastRenderKey = ''; refresh(); });
    }
};

// ---------------- SOUND ----------------
let soundOn = false;
let audioEl = null;
let playingSlot = null;
let lastSoundPhase = null;
// Songs saved on this laptop (browser Cache Storage), so playing never waits
// for the internet. "Download all songs to this laptop" fills it before the
// day; a song not saved yet still plays from the internet and is saved then.
const SONG_CACHE = 'comp-songs-v1';
let songsOnLaptop = new Set();   // song paths already saved here
let songDownload = '';           // progress text
let lastAutoSave = 0;            // songs are saved automatically; retried every 30 s if something failed
// Auto-play OFF = the sound person plays songs by hand (e.g. from VLC), so the
// browser never plays at the same time. Remembered on this laptop.
let autoPlay = (() => { try { return localStorage.getItem('comp_autoplay') !== 'off'; } catch (e) { return true; } })();
const blobUrls = {};             // path -> object URL of the saved file
async function refreshSongsOnLaptop() {
    if (!window.caches || !st) return;
    try {
        const c = await caches.open(SONG_CACHE);
        const next = new Set();
        for (const s of st.slots) if (s.song_path && songUrl(s.song_path) && await c.match(songUrl(s.song_path))) next.add(s.song_path);
        const changed = next.size !== songsOnLaptop.size;
        songsOnLaptop = next;
        if (changed) { lastRenderKey = ''; render(); }
    } catch (e) { console.warn('song cache unavailable', e); }
}
// Local copy first; otherwise the internet (and save it for next time).
async function playableUrl(path) {
    const url = songUrl(path);
    if (!url) return null;
    if (blobUrls[path]) return blobUrls[path];
    try {
        if (window.caches) {
            const c = await caches.open(SONG_CACHE);
            let res = await c.match(url);
            if (!res) { c.add(url).then(() => { songsOnLaptop.add(path); lastRenderKey = ''; render(); }).catch(() => {}); return url; }
            blobUrls[path] = URL.createObjectURL(await res.blob());
            return blobUrls[path];
        }
    } catch (e) { console.warn('cache read failed, using the internet', e); }
    return url;
}
// The file name a song has in the ZIP folder: "B-07 Solo - Tanveer (B1).mp3".
function songFileName(s) {
    const ext = ((s.song_path || '').match(/\.([a-z0-9]+)$/i) || [, 'mp3'])[1];
    const label = s.kind === 'solo' ? `Solo - ${s.name} (${teamName(s.team_id)})` : `Group - ${teamName(s.team_id)}`;
    return `${s.code} ${label}.${ext}`.replace(/[\\/:*?"<>|]/g, '');
}
function renderSound() {
    const cur = current();
    const live = st.live || {};
    const up = nextWaiting(cur ? cur.position : 0, 2);
    const url = cur && songUrl(cur.song_path);
    const withSong = st.slots.filter((s) => s.song_path);
    const saved = withSong.filter((s) => songsOnLaptop.has(s.song_path)).length;
    const key = JSON.stringify([cur && cur.id, live.phase, soundOn, !!url, saved, withSong.length, songDownload, autoPlay]);
    const allSaved = withSong.length > 0 && saved === withSong.length;
    paint(key, `<div class="wrap" style="max-width:760px;">
        ${!soundOn ? `<div class="card" style="text-align:center; margin-bottom:14px; border-color:var(--saffron);"><p class="muted" style="margin-top:0;">Tap once so this device is allowed to play music.</p><button class="btn primary" onclick="CompSound.enable()">Turn on sound</button></div>` : ''}
        <div class="card" style="margin-bottom:14px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; border-color:${autoPlay ? 'var(--line)' : 'var(--saffron)'};">
            <div><div style="font-weight:900;">Auto-play: ${autoPlay ? '<span style="color:var(--green);">ON</span>' : '<span style="color:var(--saffron);">OFF</span>'}</div>
            <div class="muted" style="font-size:.85em; margin-top:2px;">${autoPlay ? 'The song starts by itself when the coach presses Start.' : 'This page plays nothing by itself. Play the songs by hand (VLC / folder).'}</div></div>
            <button class="btn ${autoPlay ? '' : 'primary'}" onclick="CompSound.toggleAuto()">${autoPlay ? 'Turn OFF (I play from VLC)' : 'Turn ON again'}</button></div>
        <div class="card" style="margin-bottom:14px; border-color:${allSaved ? 'var(--green)' : 'var(--red)'};">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                <div><div style="font-weight:900; color:${allSaved ? 'var(--green)' : '#ffb3b1'};">${allSaved ? 'All songs are on this laptop ✓' : `Songs on this laptop: ${saved} of ${withSong.length}`}</div>
                <div class="muted" style="font-size:.85em; margin-top:2px;">${allSaved ? 'They play from the laptop, even if the internet is slow or stops.' : 'Saving them automatically. Keep this page open with internet until it turns green.'}</div></div>
                <button class="btn ${allSaved ? '' : 'primary'}" onclick="CompSound.saveAll()" ${DEMO || songDownload ? 'disabled' : ''}>${songDownload || (allSaved ? 'Check again' : 'Save now')}</button>
            </div></div>
        <div class="card" style="border-color:var(--saffron);">
            <div style="display:flex; justify-content:space-between;"><span class="code">${esc(cur ? cur.code || '' : '')}</span><span style="font-size:1.6em;">${clock()}</span></div>
            <div class="huge" style="margin:6px 0;">${cur ? esc(slotTitle(cur)) : 'Waiting'}</div>
            <div class="muted">${esc(slotSub(cur))}${cur && cur.song_seconds ? ` · ${mmss(cur.song_seconds)}` : ''}${cur && cur.song_path ? (songsOnLaptop.has(cur.song_path) ? ' · <span style="color:var(--green); font-weight:700;">on laptop</span>' : ' · <span style="color:#ffb3b1; font-weight:700;">from internet</span>') : ''}</div>
            <div style="display:flex; gap:10px; margin-top:14px; flex-wrap:wrap;">
                <button class="btn go" onclick="CompSound.play()" ${url || DEMO ? '' : 'disabled'}>▶ Play</button>
                <button class="btn" onclick="CompSound.pause()">❚❚ Pause</button>
                <button class="btn" onclick="CompSound.restart()">↺ From start</button>
            </div>
            ${cur && (cur.kind === 'solo' || cur.kind === 'group') && !cur.song_path ? '<p style="color:var(--red); font-weight:700;">No song uploaded for this performance.</p>' : ''}
            ${!autoPlay && cur && cur.song_path ? `<div style="margin-top:14px; padding:12px; border-radius:10px; background:var(--saffron-soft); border:1px solid var(--saffron);">
                <div class="faint" style="font-size:.78em; font-weight:800;">PLAY BY HAND · FILE IN THE FOLDER</div>
                <div style="font-weight:900; font-size:1.15em; margin:4px 0 8px; word-break:break-word;">${esc(songFileName(cur))}</div>
                <button class="btn small" onclick="CompSound.downloadOne()">Download this song</button></div>` : ''}
            <p class="faint" style="font-size:.82em; margin-bottom:0;">The song starts by itself when the coach presses Start, and stops when the coach presses Finished.</p>
        </div>
        <div class="card" style="margin-top:14px;"><div class="faint" style="font-size:.8em; font-weight:700;">NEXT</div>
            ${up.map((s) => `<div class="list-row"><span class="code" style="min-width:54px;">${esc(s.code || '')}</span><div style="flex:1; font-weight:700;">${esc(slotTitle(s))}</div>${s.song_path ? (songsOnLaptop.has(s.song_path) ? '<span class="badge ok">on laptop</span>' : '<span class="badge">internet</span>') : (s.kind === 'solo' || s.kind === 'group') ? '<span class="badge bad">no song</span>' : ''}</div>`).join('')}</div>
        <div class="card" style="margin-top:14px;"><div style="font-weight:800;">Extra backup: all songs in a ZIP</div>
            <p class="muted" style="font-size:.88em;">Renamed in running order ("A-07 Solo - Name (Team).mp3"), to play by hand from a folder if this page ever fails.</p>
            <button class="btn" onclick="CompSound.zip()" ${DEMO ? 'disabled' : ''}>Download ZIP</button> <span id="zipMsg" class="faint" style="font-size:.85em;"></span></div>
    </div>`);
    if (!refreshSongsOnLaptop.done) { refreshSongsOnLaptop.done = true; refreshSongsOnLaptop(); }
    // Nothing to press: as soon as this screen is open, every song is saved on the laptop.
    if (!DEMO && !songDownload && withSong.length && saved < withSong.length && Date.now() - lastAutoSave > 30000) {
        lastAutoSave = Date.now();
        CompSound.saveAll(true);
    }
    // auto play when the coach presses Start on a new slot
    // Every Start (also "Start again" on the same dancer) plays the song from 0:00.
    const startKey = cur && live.phase === 'performing' ? `${cur.id}@${live.phase_started_at}` : null;
    if (soundOn && autoPlay && startKey && playingSlot !== startKey && url) {
        playingSlot = startKey;
        playableUrl(cur.song_path).then((u) => { CompSound.load(u); audioEl.currentTime = 0; audioEl.play().catch(() => {}); });
    }
    // coach pressed Finished / Next: the music stops too
    if (soundOn && audioEl && lastSoundPhase === 'performing' && live.phase !== 'performing' && !audioEl.paused) audioEl.pause();
    lastSoundPhase = live.phase;
}
window.CompSound = {
    enable() { soundOn = true; audioEl = audioEl || new Audio(); audioEl.play().catch(() => {}); lastRenderKey = ''; render(); },
    load(url) { audioEl = audioEl || new Audio(); if (audioEl.src !== url) audioEl.src = url; },
    async play() {
        const cur = current();
        if (!cur || !cur.song_path) return;
        const u = await playableUrl(cur.song_path);
        if (!u) return;
        this.load(u); playingSlot = (st.live || {}).phase === 'performing' ? `${cur.id}@${st.live.phase_started_at}` : cur.id;
        audioEl.play().catch((e) => alert('Cannot play: ' + e.message));
    },
    pause() { if (audioEl) audioEl.pause(); },
    // Save the current song as a file (from the laptop copy when there is one).
    async downloadOne() {
        const cur = current();
        if (!cur || !cur.song_path) return;
        const u = await playableUrl(cur.song_path);
        const blob = await (await fetch(u)).blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = songFileName(cur); a.click();
    },
    toggleAuto() {
        autoPlay = !autoPlay;
        try { localStorage.setItem('comp_autoplay', autoPlay ? 'on' : 'off'); } catch (e) { /* ignore */ }
        if (!autoPlay && audioEl) audioEl.pause();   // switching to VLC: stop the browser now
        lastRenderKey = ''; render();
    },
    restart() { if (audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); } },
    async saveAll(auto) {
        if (!window.caches) { if (!auto) alert('This browser cannot save songs. Use Chrome, or the ZIP backup.'); return; }
        const list = [...new Map(st.slots.filter((s) => s.song_path).map((s) => [s.song_path, s])).values()];
        const c = await caches.open(SONG_CACHE);
        let n = 0, failed = 0;
        for (const s of list) {
            songDownload = `Saving ${++n} of ${list.length}…`; lastRenderKey = ''; render();
            try { if (!(await c.match(songUrl(s.song_path)))) await c.add(songUrl(s.song_path)); songsOnLaptop.add(s.song_path); }
            catch (e) { console.error('song download failed', s, e); failed++; }
        }
        songDownload = '';
        await refreshSongsOnLaptop();
        lastRenderKey = ''; render();
        if (failed && !auto) alert(`${failed} song(s) could not be saved. Check the internet and press the button again.`);
    },
    async zip() {
        const msg = document.getElementById('zipMsg');
        const list = st.slots.filter((s) => s.song_path);
        if (!list.length) { msg.textContent = 'No songs yet.'; return; }
        const zip = new JSZip();
        let n = 0;
        for (const s of list) {
            msg.textContent = `Adding ${++n} of ${list.length}…`;
            const u = await playableUrl(s.song_path);
            const res = await fetch(u);
            if (!res.ok) continue;
            zip.file(songFileName(s), await res.blob());
        }
        msg.textContent = 'Making the ZIP…';
        const blob = await zip.generateAsync({ type: 'blob' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'competition-songs.zip'; a.click();
        msg.textContent = 'Done.';
    }
};

// ---------------- ANCHOR ----------------
function renderAnchor() {
    const cur = current();
    const live = st.live || {};
    const up = nextWaiting(cur ? cur.position : 0, 2);
    const key = JSON.stringify([cur && cur.id, live.phase, up.map((s) => s.id)]);
    paint(key, `<div class="wrap" style="max-width:820px;">
        <div class="card" style="border-color:var(--saffron);"><div class="faint" style="font-weight:800; font-size:.85em;">NOW ON STAGE</div>
            <div style="display:flex; justify-content:space-between; align-items:center;"><span class="code" style="font-size:1.4em;">${esc(cur ? cur.code || '' : '')}</span><span style="font-size:2em;">${clock()}</span></div>
            <div class="huge" style="font-size:clamp(34px,8vw,64px);">${cur ? esc(slotTitle(cur)) : live.phase === 'results' ? 'Results time!' : 'Welcome'}</div>
            <div class="muted" style="font-size:1.2em;">${esc(slotSub(cur))}</div></div>
        ${up[0] ? `<div class="card" style="margin-top:14px;"><div class="faint" style="font-weight:800; font-size:.85em;">NEXT · CALL THEM NOW</div><div style="font-size:2em; font-weight:900;">${esc(up[0].code || '')} ${esc(slotTitle(up[0]))}</div><div class="muted">${esc(slotSub(up[0]))}</div></div>` : ''}
        ${up[1] ? `<div class="card" style="margin-top:14px;"><div class="faint" style="font-weight:800; font-size:.85em;">GET READY</div><div style="font-size:1.4em; font-weight:800;">${esc(up[1].code || '')} ${esc(slotTitle(up[1]))}</div></div>` : ''}
    </div>`);
}

// ---------------- PROJECTOR ----------------
let projCat = params.get('cat') || 'B';
setInterval(() => { if (ROLE === 'projector' && st && st.live && st.live.revealed) { projCat = projCat === 'B' ? 'A' : 'B'; lastRenderKey = ''; render(); } }, 20000);
function renderProjector() {
    const live = st.live || {};
    const cur = current();
    const title = `<div class="proj-title">${esc(st.event.title)}</div>`;
    if (live.revealed) {
        const c = live.revealed.cats[projCat];
        const key = JSON.stringify(['rev', projCat, live.revealed.at]);
        const teams = [...c.teams].sort((a, b) => a.pos - b.pos).filter((t) => t.pos <= 3);
        paint(key, `${title}<div class="proj">
            <div class="proj-code" style="margin-bottom:3vh;">CATEGORY ${projCat} · RESULTS</div>
            <div class="podium">${teams.map((t, i) => `<div class="pod" style="animation-delay:${(teams.length - i) * 0.6}s;"><span class="p">${ordinal(t.pos)}</span><span>${esc(t.name)}</span></div>`).join('')}</div>
            <div class="podium" style="margin-top:4vh;">${c.awards.map((a, i) => `<div class="pod" style="font-size:3vh; padding:1.4vh 3vw; animation-delay:${(teams.length + 1 + i) * 0.6}s;"><span style="color:var(--saffron); min-width:24vw; text-align:left;">${esc(a.award)}</span><span>${esc(a.name)}</span><span class="faint" style="margin-left:auto; font-size:.8em;">${esc(a.team)}</span></div>`).join('')}</div>
        </div>`);
        return;
    }
    const up = nextWaiting(cur ? cur.position : 0)[0];
    const key = JSON.stringify(['live', cur && cur.id, live.phase, up && up.id]);
    if (!cur) {
        paint(key, `${title}<div class="proj"><img src="logo.png" alt="" style="height:22vh; border-radius:3vh; margin-bottom:4vh;"><div class="proj-name" style="font-size:9vh;">${live.phase === 'results' ? 'Results coming soon' : 'Welcome!'}</div><div class="proj-team">${live.phase === 'results' ? 'The judges are counting the scores' : 'The competition starts soon'}</div></div>`);
        return;
    }
    const label = live.phase === 'changeover' ? 'GET READY' : live.phase === 'finished' ? 'FINISHED' : live.phase === 'break' ? '' : 'ON STAGE';
    paint(key, `${title}<div class="proj">
        ${label ? `<div class="proj-code">${esc(cur.code || '')} · ${label}</div>` : ''}
        <div class="proj-name">${esc(slotTitle(cur))}</div>
        <div class="proj-team">${esc(slotSub(cur))}</div>
        <div class="proj-timer">${clock()}</div>
        ${up ? `<div class="proj-next">Next: ${esc(up.code || '')} ${esc(slotTitle(up))}</div>` : ''}
    </div>`);
}

// ---------------- DOOR ----------------
function renderDoor() {
    const live = st.live || {};
    const key = JSON.stringify([live.door_cash, live.door_free]);
    paint(key, `<div class="wrap" style="max-width:560px;">
        <div class="card" style="text-align:center; margin-bottom:14px;"><div class="faint" style="font-weight:800; font-size:.85em;">CASH IN THE BOX</div>
            <div style="font-size:3.4em; font-weight:900; color:var(--gold);">€${(live.door_cash || 0) * DOOR_PRICE}</div>
            <div class="muted">${(live.door_cash || 0) + (live.door_free || 0)} people in · give everyone a wristband</div></div>
        <div class="card" style="margin-bottom:14px;"><div style="font-weight:800; margin-bottom:10px;">Paid €${DOOR_PRICE}</div>
            <div class="counter"><button class="btn" onclick="CompDoor.add('cash', -1)">−1</button><div class="n">${live.door_cash || 0}</div><button class="btn primary" onclick="CompDoor.add('cash', 1)">+1</button></div></div>
        <div class="card"><div style="font-weight:800; margin-bottom:10px;">Under 6 (free)</div>
            <div class="counter"><button class="btn" onclick="CompDoor.add('free', -1)">−1</button><div class="n">${live.door_free || 0}</div><button class="btn go" onclick="CompDoor.add('free', 1)">+1</button></div></div>
        <p class="faint" style="text-align:center; font-size:.85em;">Dancers enter free. Everyone else pays €${DOOR_PRICE}.</p>
    </div>`);
}
window.CompDoor = {
    async add(kind, delta) {
        if (delta < 0 && !confirm('Remove one?')) return;
        try { await backend.door(kind, delta); } catch (e) { alert('Not saved: ' + (e.message || e)); }
        lastRenderKey = ''; await refresh();
    }
};

// ---------------------------------------------------------------- start
if (!DEMO && !supa) messageScreen('Cannot connect', 'Check the internet and reload.');
else if (!DEMO && ROLE !== 'control' && !savedPin()) pinGate();
else startPolling();
})();
