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
    'Ranking': 'Classifica', 'Solo ranking': 'Classifica assolo', 'Group ranking': 'Classifica gruppi', 'Category': 'Categoria',
    "Ranked by YOUR scores only. Other judges' scores are not shown.": 'Classifica in base ai TUOI voti. I voti degli altri giudici non si vedono.', 'Nothing scored yet.': 'Ancora nessun voto completo.',
    'Live scoring': 'Voti in diretta', 'My scores': 'I miei voti', 'No scores given yet.': 'Nessun voto dato finora.',
    'Total': 'Totale', 'in progress': 'in corso', 'not sent': 'non inviato', 'sent': 'inviato',
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

// Name shown on every screen and printed paper: brand + competition (the title saved in the database is not used)
const COMP_BRAND = 'Bhangra Sway', COMP_NAME = 'Inter Academy Competition 2027';
// Age from an Italian codice fiscale (null when it cannot be read)
function ageFromCf(cf) {
    const m = /^[A-Z]{6}(\d\d)([ABCDEHLMPRST])(\d\d)/i.exec(String(cf || '').trim());
    if (!m) return null;
    const month = 'ABCDEHLMPRST'.indexOf(m[2].toUpperCase());
    let day = Number(m[3]); if (day > 40) day -= 40;
    const now = new Date();
    let year = 2000 + Number(m[1]); if (year > now.getFullYear()) year -= 100;
    let age = now.getFullYear() - year;
    if (now.getMonth() < month || (now.getMonth() === month && now.getDate() < day)) age--;
    return age >= 0 && age < 120 ? age : null;
}
// The parent's name is only shown for children (under 18, or age unknown): a grown-up dancer has no parent line.
const parentOf = (x) => (x && x.parent && (x.age == null || x.age < 18) ? String(x.parent) : '');
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
    const addTeam = (teamId, n, cat) => { for (let i = 0; i < n; i++) entries.push({ id: 100 + k, do_solo: true, do_group: true, do_activity: false, category: cat, team_id: teamId, name: DEMO_NAMES[k++ % DEMO_NAMES.length] }); };
    addTeam(1, 5, 'B'); addTeam(2, 5, 'B'); addTeam(3, 6, 'B'); addTeam(4, 5, 'B');
    addTeam(5, 5, 'A'); addTeam(6, 5, 'A'); addTeam(7, 5, 'A'); addTeam(8, 5, 'A');
    // two solo-only dancers (no team) and four people who only do the extra activity
    ['Zaara', 'Dev'].forEach((nm, i) => entries.push({ id: 300 + i, do_solo: true, do_group: false, do_activity: false, category: 'B', team_id: null, name: nm }));
    [['Gagandeep', ['backstage']], ['Mehak', ['music', 'stage']], ['Taran', ['mic']]].forEach(([nm, roles], i) => entries.push({ id: 500 + i, do_solo: false, do_group: false, do_activity: false, do_volunteer: true, volunteer_roles: roles, category: null, team_id: null, name: nm }));
    ['Amaira', 'Ranbir', 'Siya', 'Kabir'].forEach((nm, i) => entries.push({ id: 400 + i, do_solo: false, do_group: false, do_activity: true, category: null, team_id: null, name: nm }));
    entries.forEach((e, i) => { e.parent = e.name ? ['Harjit Kaur', 'Paramjit Singh', 'Gurpreet Kaur', 'Baljinder Singh', 'Manjit Kaur', 'Sukhdev Singh', 'Rajwinder Kaur', 'Jaswant Singh'][i % 8] : ''; e.age = i % 3 === 0 ? 24 : 9 + (i % 8); });   // practice: some grown-ups, some children
    const order = S.buildRunningOrder({ entries, teams, rand: rnd, guests: ['Demo Guest Crew | 6'] });
    const slots = order.map((o, i) => {
        const e = entries.find((x) => x.id === o.entry_id);
        return { id: i + 1, ...o, status: 'waiting', team_id: o.team_id || (e && e.team_id) || null, name: e ? e.name : null, parent: e ? e.parent : '', age: e ? e.age : null, song_path: o.kind === 'solo' || o.kind === 'group' ? 'demo:song' : null, song_seconds: o.kind === 'solo' ? (o.category === 'A' ? 121 : 92) : o.kind === 'group' ? (o.category === 'A' ? 330 : 238) : null };
    });
    return {
        event: { id: 1, title: 'Inter Academy Competition 2027', status: 'live', settings: { gap: 0 } },
        live: { current_slot_id: null, phase: 'idle', phase_started_at: null, revealed: null, door_cash: 0, door_free: 0 },
        slots, teams, entries, scores: {},
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
        const r = S.computeResults({ slots: s.slots, scores: s.scores, teams: s.teams, gap: 0 });
        const cats = {};
        ['B', 'A'].forEach((c) => { cats[c] = { teams: r[c].teams.map((t) => ({ pos: t.opt1, name: t.name })), solos: r[c].solos.filter((x) => x.opt1).map((x) => ({ pos: x.opt1, name: x.name, team: x.teamName })) }; });
        s.live.revealed = { option: 1, cats, at: new Date().toISOString(), step: Number(params.get('step')) || 0, shown: params.has('shown') ? Number(params.get('shown')) : 0 };   // practice: starts empty, &step=&shown= jump ahead
    }
}
const demo = {
    read() {
        try { const s = JSON.parse(localStorage.getItem(DEMO_KEY)); const want = params.get('preset') || ''; if (s && s.slots && Array.isArray(s.entries) && s.entries.length && (!want || s.preset === want)) return s; } catch (e) { /* fresh */ }   // a link with &preset= always starts from that moment   // an old practice state without the people list is replaced
        const f = demoFresh();
        demoPreset(f, params.get('preset'));
        f.preset = params.get('preset') || '';
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
    async door(kind, delta) { await this.mutate((s) => { const k = kind === 'cash' ? 'door_cash' : kind === 'student' ? 'door_students' : 'door_free'; s.live[k] = Math.max(0, (s.live[k] || 0) + delta); }); },
    // practice coupons: DEMO22 and USED99 (already used)
    async coupon(code, use) {
        const c = String(code || '').trim().toUpperCase();
        let out = { status: 'not_found' };
        await this.mutate((s) => {
            s.coupons = s.coupons || { DEMO22: { guest: 'Parent of Simran', student: 'Simran Kaur', parent: 'Harjit Kaur', used: false }, USED99: { guest: 'Aunt Kiran', student: 'Kiran Kaur', parent: 'Paramjit Singh', used: true } };
            const x = s.coupons[c];
            if (!x) return;
            if (x.used) { out = { status: 'used', guest: x.guest, student: x.student, parent: x.parent }; return; }
            if (use) { x.used = true; s.live.door_coupons = (s.live.door_coupons || 0) + 1; out = { status: 'ok', let_in: true, guest: x.guest, student: x.student, parent: x.parent }; }
            else out = { status: 'ok', let_in: false, guest: x.guest, student: x.student, parent: x.parent };
        });
        return out;
    },
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
            supa.from('comp_entries').select('id, student_id, kind, do_solo, do_group, do_activity, do_volunteer, volunteer_roles, category, team_id, withdrawn, solo_song_path, solo_song_seconds, students(*)').eq('event_id', event.id),
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
            entries: (entries.data || []).map((e) => { const stu = e.students || {}; const cf = stu.codicefiscale ?? stu.codice_fiscale ?? stu.codiceFiscale; return { ...e, name: stu.name || '?', parent: stu.parentname ?? stu.parent_name ?? stu.parentName ?? '', age: ageFromCf(cf) ?? (stu.age != null ? Number(stu.age) : null) }; }),
            slots: (slots.data || []).map((s) => {
                const e = entryById[s.entry_id];
                const t = teamById[s.team_id || (e && e.team_id)];
                const stu = (e && e.students) || {}, cf = stu.codicefiscale ?? stu.codice_fiscale ?? stu.codiceFiscale;
                return { ...s, team_id: s.team_id || (e && e.team_id) || null, name: e ? stu.name : null,
                    parent: stu.parentname ?? stu.parent_name ?? stu.parentName ?? '', age: ageFromCf(cf) ?? (stu.age != null ? Number(stu.age) : null),
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
    async coupon(code, use) {
        const { data, error } = await supa.rpc('comp_door_coupon', { p_pin: savedPin(), p_code: code, p_use: !!use });
        if (error) throw error;
        if (data.status === 'too_many' || data.status === 'bad_pin') throw new Error(data.status === 'too_many' ? 'too many wrong PINs, wait 15 minutes' : 'wrong PIN');
        return data;
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
        const order = S.buildRunningOrder({ entries, teams: st.teams, guests: giftList('comp_guests') });
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
    if (s.kind === 'solo') return `${tr('Solo')} · ${s.team_id ? teamName(s.team_id) + ' · ' : ''}${tr('Category')} ${s.category}`;
    if (s.kind === 'group') return `${tr('Group round')} · ${tr('Category')} ${s.category}`;
    if (s.kind === 'break') return s.minutes ? `${s.minutes} ${tr('minutes')}` : '';
    if (s.kind === 'kids' && /^Guest performance/.test(s.label || '')) return s.minutes ? `${s.minutes} ${tr('minutes')}` : '';
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
    document.getElementById('topTitle').innerHTML = '<b>' + COMP_BRAND + '</b> · <span class="cn-long">' + COMP_NAME + '</span><span class="cn-short">Inter Academy</span>';   // short on a phone
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
    gap(g) { return act(() => backend.setSettings({ gap: g, gap_chosen: true })); },
    option(o) { return act(() => backend.setSettings({ option: o })); },
    reveal() {
        const snap = revealSnapshot();
        if (!confirm('Show the results on the projector now?')) return;
        const keep = (st.live || {}).revealed;
        snap.step = keep && keep.step ? keep.step : 0;      // the coach moves the projector one winner at a time
        snap.shown = keep && keep.shown != null ? keep.shown : 0;
        return act(() => backend.setLive({ revealed: snap, phase: 'results' }));
    },
    // Which results screen the projector shows: 0 B solo, 1 B group, 2 A solo, 3 A group
    revealStep(n) {
        const cur = (st.live || {}).revealed;
        if (!cur) return;
        return act(() => backend.setLive({ revealed: { ...cur, step: Math.max(0, Math.min(3, n)), shown: 0 } }));
    },
    // One click = one more winner on the projector (3rd, then 2nd, then 1st); then the next screen starts empty.
    nextWinner() {
        const cur = (st.live || {}).revealed;
        if (!cur) return;
        const sc = revealScreen(cur, cur.step);
        if (sc.shown < sc.positions.length) return act(() => backend.setLive({ revealed: { ...cur, step: sc.step, shown: sc.shown + 1 } }));
        if (sc.step < 3) return act(() => backend.setLive({ revealed: { ...cur, step: sc.step + 1, shown: 0 } }));
    },
    backWinner() {
        const cur = (st.live || {}).revealed;
        if (!cur) return;
        const sc = revealScreen(cur, cur.step);
        if (sc.shown > 0) return act(() => backend.setLive({ revealed: { ...cur, step: sc.step, shown: sc.shown - 1 } }));
        if (sc.step > 0) { const prev = revealScreen(cur, sc.step - 1); return act(() => backend.setLive({ revealed: { ...cur, step: sc.step - 1, shown: Math.max(0, prev.positions.length - 1) } })); }
    },
    hide() { return act(() => backend.setLive({ revealed: null })); },
    buildOrder() {
        // Only after the teams are locked: making the order closes registration.
        if (st.event.status === 'registration') { alert('Registration is still open. Lock the teams first (admin → Performances → "Lock teams + charge fee"), then make the running order.'); return; }
        const noCat = (st.entries || []).filter((e) => !e.withdrawn && (e.do_solo || e.do_group) && !e.category);
        if (noCat.length) { alert('These people have no category (A or B) yet, set it in admin first: ' + noCat.map((e) => e.name).join(', ')); return; }
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
    certificates(kind) { makeCertificates(kind).catch((e) => { console.error(e); alert('Certificates failed: ' + (e.message || e)); }); },
    trophyList() { makeTrophyListPdf(); }
};

// The gap of Option 2 is 0 (= exactly like Option 1) until the coach picks another one here.
// (Events made before this rule have a saved gap of 1: it only counts once it was chosen.)
function effGap(set) { return set && set.gap_chosen ? Number(set.gap) || 0 : 0; }
function results() {
    const set = st.event.settings || {};
    return S.computeResults({ slots: st.slots, scores: st.scores || {}, teams: st.teams, gap: effGap(set) });
}
function teamPos(t, option) { return option === 2 ? t.opt2 : t.opt1; }
// What the projector shows: group and solo positions (no scores).
function revealSnapshot() {
    const set = st.event.settings || {};
    const option = Number(set.option || 1);
    const r = results();
    const cats = {};
    ['B', 'A'].forEach((c) => {
        cats[c] = {
            teams: r[c].teams.filter((t) => !t.disqualified && t.opt1).map((t) => ({ pos: teamPos(t, option), name: t.name })),
            solos: r[c].solos.filter((x) => x.opt1).map((x) => ({ pos: teamPos(x, option), name: x.name, team: x.teamName }))
        };
    });
    return { option, cats, at: new Date().toISOString() };
}

// The results screen the projector shows: step 0 B solo, 1 B group, 2 A solo, 3 A group.
// positions = the podium places of that screen, lowest first (3rd, 2nd, 1st); `shown` of them are revealed.
// (shown missing = old style: everything at once.)
const REVEAL_STEPS = ['B solo', 'B group', 'A solo', 'A group'];
function revealScreen(rev, step) {
    const stp = Math.max(0, Math.min(3, step || 0));
    const cat = stp < 2 ? 'B' : 'A', solo = stp % 2 === 0;
    const c = (rev.cats || {})[cat] || {};
    const rows = (solo ? (c.solos || []) : (c.teams || [])).filter((t) => t.pos <= 3);
    const positions = [...new Set(rows.map((t) => t.pos))].sort((a, b) => b - a);
    const shown = rev.shown == null ? positions.length : Math.max(0, Math.min(positions.length, rev.shown));
    return { step: stp, cat, solo, rows, positions, shown };
}
function renderControl() {
    const live = st.live || {};
    const cur = current();
    const set = st.event.settings || {};
    const tabs = `<div class="seg" style="margin-bottom:14px;">${[['live', 'Live'], ['order', 'Running order'], ['results', 'Results'], ['certs', 'Certificates']].map(([k, l]) =>
        `<button class="${ctrlTab === k ? 'on' : ''}" onclick="CompControl.tab('${k}')">${l}</button>`).join('')}</div>`;
    const key = JSON.stringify([ctrlTab, resCat, live, st.slots.map((s) => [s.id, s.status, s.position]), { ...set, lists: 0 }, Object.keys(st.scores || {}).length, cur && st.scores && st.scores[cur.id], busy, ctrlTab === 'live' ? leadersNow() : 0]);
    let body = '';
    // The lists (volunteers, judges, sponsors, guests) can be filled in before the running order exists
    if (!st.slots.length && ctrlTab !== 'certs') {
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
// Who is ahead right now (all 3 judges' scores in): top 3 solos and top 3 teams per category.
function leadersNow() {
    const r = results();
    const out = [];
    ['B', 'A'].forEach((cat) => {
        const solos = r[cat].solos.filter((x) => x.complete && !x.disqualified && x.opt1 && x.opt1 <= 3).map((x) => ({ pos: x.opt1, name: x.name, sub: x.teamName, pts: `${x.soloTotal}/40` }));
        const teams = r[cat].teams.filter((t) => t.complete && !t.disqualified && t.opt1 <= 3).map((t) => ({ pos: t.opt1, name: t.name, sub: '', pts: `${t.group}/50` }));
        if (solos.length) out.push({ title: `Category ${cat} · Solo`, rows: solos });
        if (teams.length) out.push({ title: `Category ${cat} · Group`, rows: teams });
    });
    return out;
}
function leadersHtml(l) {
    const medal = (p) => ({ 1: '#ffc94d', 2: '#cfd5e8', 3: '#d99a63' }[p] || 'var(--faint)');
    const row = (x) => `<div style="display:flex; align-items:center; gap:8px; padding:2px 0;">
        <span style="font-weight:900; min-width:22px; color:${medal(x.pos)};">${x.pos}</span>
        <span style="flex:1; font-weight:700; font-size:.9em;">${esc(x.name)}${x.sub ? ' <span class="faint" style="font-weight:500; font-size:.85em;">' + esc(x.sub) + '</span>' : ''}</span>
        <span class="faint" style="font-size:.85em;">${x.pts}</span></div>`;
    const block = (b) => `<div style="margin-bottom:8px;"><div style="font-weight:800; font-size:.86em; margin-bottom:2px;">${esc(b.title)}</div>${b.rows.map(row).join('')}</div>`;
    const empty = '<div class="muted" style="font-size:.88em;">Nobody has all 3 judges scores yet.</div>';
    return `<div class="card"><div class="faint" style="font-size:.8em; font-weight:700; margin-bottom:6px;">WHO IS LEADING (all 3 judges)</div>${l.length ? l.map(block).join('') : empty}</div>`;
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
            ${cur.kind === 'solo' && parentOf(cur) ? `<div class="muted">Parent: <b>${esc(parentOf(cur))}</b></div>` : ''}
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
            ${leadersHtml(leadersNow())}
            <div class="card"><div class="faint" style="font-size:.8em; font-weight:700;">DOOR</div>
                <div style="display:flex; gap:18px; margin-top:6px;"><div><div style="font-size:1.8em; font-weight:900;">€${(live.door_cash || 0) * DOOR_PRICE}</div><div class="faint" style="font-size:.82em;">${live.door_cash || 0} paid</div></div>
                <div><div style="font-size:1.8em; font-weight:900;">${live.door_free || 0}</div><div class="faint" style="font-size:.82em;">under 6, free</div></div>
                <div><div style="font-size:1.8em; font-weight:900;">${live.door_students || 0}</div><div class="faint" style="font-size:.82em;">students, free</div></div>
                <div><div style="font-size:1.8em; font-weight:900;">${live.door_coupons || 0}</div><div class="faint" style="font-size:.82em;">coupon guests</div></div></div></div>
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
    const gap = effGap(set);
    const incomplete = r.solos.filter((s) => !s.complete && !s.disqualified).length + r.teams.filter((t) => !t.complete).length;
    return `<div class="card" style="margin-bottom:14px; display:flex; flex-wrap:wrap; gap:14px; align-items:center;">
            <div class="seg">${['B', 'A'].map((c) => `<button class="${resCat === c ? 'on' : ''}" onclick="CompControl.cat('${c}')">Category ${c}</button>`).join('')}</div>
            <div class="seg">${[1, 2].map((o) => `<button class="${option === o ? 'on' : ''}" onclick="CompControl.option(${o})">Option ${o}</button>`).join('')}</div>
            <div style="display:flex; align-items:center; gap:6px;"><span class="faint" style="font-size:.82em; font-weight:700;">Option 2 gap</span><div class="seg">${[0, 0.5, 1, 2].map((g) => `<button class="${gap === g ? 'on' : ''}" onclick="CompControl.gap(${g})">${g}</button>`).join('')}</div></div>
            <div style="margin-left:auto; display:flex; gap:8px;">
                ${(st.live || {}).revealed ? `<button class="btn small" onclick="CompControl.hide()">Hide from projector</button>` : ''}
                <button class="btn primary" onclick="CompControl.reveal()">Reveal on projector</button></div>
        </div>
        ${(st.live || {}).revealed ? (() => {
            const rev = st.live.revealed, sc = revealScreen(rev, rev.step);
            const place = (p) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[p]);
            const more = sc.shown < sc.positions.length;
            const label = more ? 'Show ' + place(sc.positions[sc.shown]) + ' place' : sc.step < 3 ? 'Next: ' + REVEAL_STEPS[sc.step + 1] + ' ▶' : 'All shown ✓';
            const names = sc.rows.filter((t) => t.pos === sc.positions[sc.shown]).map((t) => t.name).join(', ');
            return `<div class="card" style="margin-bottom:14px;"><div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;"><b>Projector shows</b>
                <div class="seg">${REVEAL_STEPS.map((l, i) => `<button class="${sc.step === i ? 'on' : ''}" onclick="CompControl.revealStep(${i})">${l}</button>`).join('')}</div>
                <button class="btn" onclick="CompControl.backWinner()">◀ Back</button>
                <button class="btn primary" style="font-size:1.05em;" ${!more && sc.step >= 3 ? 'disabled' : ''} onclick="CompControl.nextWinner()">${label}</button></div>
                <div class="faint" style="font-size:.85em; margin-top:8px;">${REVEAL_STEPS[sc.step]}: ${sc.shown} of ${sc.positions.length} places shown. ${more && names ? 'Next on the screen: <b>' + esc(names) + '</b>.' : ''} No timer: the projector only changes when you click.</div></div>`;
        })() : ''}
        ${incomplete ? `<div class="card" style="border-color:var(--red); margin-bottom:14px; color:#ffb3b1;">${incomplete} performance(s) do not have all 3 judges' scores yet.</div>` : ''}
        <div class="grid two" style="grid-template-columns:1fr 1fr;">
            <div class="card"><h3 style="margin-top:0;">Teams · Category ${resCat}</h3>
                <table><tr><th>Pos</th><th>Team</th><th>Group /50</th><th>Score %</th></tr>
                ${r.teams.map((t) => `<tr><td style="font-weight:900; color:var(--gold); font-size:1.15em;">${t.disqualified ? 'DQ' : (t.opt1 ? ordinal(teamPos(t, option)) : '-')}</td><td style="font-weight:800;">${esc(t.name)}</td><td>${t.group}</td><td style="font-weight:800;">${t.score}</td></tr>`).join('')}</table>
                <p class="faint" style="font-size:.8em; margin-bottom:0;">Team = group round only (solo is separate). Option 1: exact order, equal scores share. Option 2: within ${gap} point(s) of the top share the position.</p></div>
        </div>
        <div class="card" style="margin-top:14px;"><h3 style="margin-top:0;">Solos · Category ${resCat}</h3>
            <table><tr><th>Pos</th><th>Dancer</th><th>Team</th><th>Solo /40</th><th>Expression</th><th></th></tr>
            ${r.solos.map((s, i) => `<tr style="${s.disqualified ? 'opacity:.45;' : ''}"><td style="font-weight:900; color:var(--gold);">${s.opt1 ? ordinal(teamPos(s, option)) : ''}</td><td style="font-weight:700;">${esc(s.name)}</td><td class="muted">${esc(s.teamName)}</td><td style="font-weight:800;">${s.soloTotal}</td><td>${s.expression}</td><td>${s.disqualified ? '<span class="badge bad">DQ</span>' : s.complete ? '' : `<span class="badge bad">${s.judges}/3 judges</span>`}</td></tr>`).join('')}</table></div>`;
}
// One trophy per person. A win (solo podium place, or a place of a podium team,
// each member of it) = a big trophy; everybody else one small; a winner gets no small.
function entryName(e) { return e.name || (e.students || {}).name || '?'; }
function trophyData() {
    const set = st.event.settings || {};
    const option = Number(set.option || 1);
    const entries = (st.entries || []).filter((e) => !e.withdrawn);
    const people = entries.filter((e) => e.do_solo || e.do_group || e.do_activity).map((e) => ({ id: e.id, name: entryName(e), activity: !!e.do_activity, compete: !!(e.do_solo || e.do_group) }));   // volunteers alone are not participants
    const groupMembers = {};
    entries.filter((e) => e.do_group && e.team_id).forEach((e) => (groupMembers[e.team_id] = groupMembers[e.team_id] || []).push(e.id));
    const soloPerson = {};
    st.slots.filter((x) => x.kind === 'solo').forEach((x) => { soloPerson[x.id] = x.entry_id; });
    return { ...S.computeTrophies({ results: results(), option, people, groupMembers, soloPerson }), entries, extraOnly: entries.filter((e) => e.do_activity && !e.do_solo && !e.do_group).length };
}
// End of the show: what was used against what the coach bought (numbers typed in admin → Shopping list).
// bought = null when nothing was typed. left = bought − used (negative = short).
function trophyCheck(td) {
    const sh = (st.event.settings || {}).shopping || {};
    const bought = (k) => (sh[k + '_bought'] !== undefined && sh[k + '_bought'] !== null && sh[k + '_bought'] !== '' ? Number(sh[k + '_bought']) : null);
    const g = giftCounts();
    const rows = [
        { label: 'Largest trophies (1st)', used: td.tiers.largest, bought: bought('tier1') },
        { label: 'Medium trophies (2nd)', used: td.tiers.medium, bought: bought('tier2') },
        { label: 'Small trophies (3rd)', used: td.tiers.small, bought: bought('tier3') },
        { label: 'Participant trophies', used: td.participant.length, bought: bought('participant') },
        { label: 'Extra activity trophies', used: td.extra.length, bought: bought('extra') },
        { label: 'Volunteer gifts', used: g.v, bought: bought('volunteers') },
        { label: 'Judge gifts', used: g.j, bought: bought('judges') },
        { label: 'Sponsor gifts', used: g.s, bought: bought('sponsors') },
        { label: 'Guest performer gifts', used: g.g, bought: bought('guests') }
    ].filter((r) => r.used > 0 || r.bought);
    rows.forEach((r) => { r.left = r.bought === null ? null : r.bought - r.used; });
    // everybody who takes part has exactly one kind of trophy: a podium trophy (one per win) or a participant one
    const got = new Set(td.big.map((b) => b.person).concat(td.participant.map((p) => p.id), td.extra.map((p) => p.id)));
    const missing = td.entries.filter((e) => (e.do_solo || e.do_group || e.do_activity) && !got.has(e.id)).map(entryName);
    const unscored = st.slots.filter((x) => (x.kind === 'solo' || x.kind === 'group') && x.status !== 'disqualified' && (() => { const sc = (st.scores || {})[x.id] || {}; return Object.keys(sc).length < 3; })()).length;
    return { rows, missing, unscored, people: td.people };
}
function trophyCheckHtml(td) {
    const c = trophyCheck(td);
    const cell = 'padding:4px 10px; border-top:1px solid var(--line);';
    const body = c.rows.map((r) => {
        const st2 = r.left === null ? '<span class="faint">bought: not typed in admin</span>'
            : r.left === 0 ? '<b style="color:var(--green, #4ade80);">exactly enough ✓</b>'
                : r.left > 0 ? `<b style="color:var(--green, #4ade80);">${r.left} left over</b>`
                    : `<b style="color:#ff8a87;">SHORT by ${-r.left}</b>`;
        return `<tr><td style="${cell} font-weight:700;">${r.label}</td><td style="${cell} text-align:center;">${r.used}</td><td style="${cell} text-align:center;">${r.bought === null ? '-' : r.bought}</td><td style="${cell}">${st2}</td></tr>`;
    }).join('');
    return `<div style="margin:10px 0; padding:10px 12px; border-radius:12px; border:1px solid var(--line);">
        <div style="font-weight:800; margin-bottom:6px;">Trophy check: used and bought</div>
        <table style="width:100%; border-collapse:collapse; font-size:.9em;"><thead><tr class="faint" style="text-align:left; font-size:.8em;"><th style="padding:3px 10px;">What</th><th style="padding:3px 10px; text-align:center;">Used</th><th style="padding:3px 10px; text-align:center;">Bought</th><th style="padding:3px 10px;"></th></tr></thead><tbody>${body}</tbody></table>
        <div style="margin-top:8px; font-size:.9em;">${c.missing.length ? `<b style="color:#ff8a87;">Without a trophy: ${c.missing.map(esc).join(', ')}</b>` : `<b style="color:var(--green, #4ade80);">Nobody is left without a trophy ✓</b> (all ${c.people} people have one)`}${c.unscored ? ` <span class="faint">· ${c.unscored} performance${c.unscored === 1 ? '' : 's'} not fully scored yet, so the numbers can still change.</span>` : ''}</div>
    </div>`;
}
function trophyPanelHtml() {
    const td = trophyData();
    const nameOf = (id) => (td.entries.find((e) => e.id === id) || {}).name || '?';
    return `<div class="card" style="margin-bottom:14px;"><h3 style="margin-top:0;">Trophies to hand out</h3>
        <div style="display:flex; gap:22px; flex-wrap:wrap; margin-bottom:8px;">
            <div><div style="font-size:2.2em; font-weight:900; color:var(--gold);">${td.tiers.largest}</div><div class="faint" style="font-size:.82em; font-weight:700;">LARGEST (1st)</div></div>
            <div><div style="font-size:2.2em; font-weight:900;">${td.tiers.medium}</div><div class="faint" style="font-size:.82em; font-weight:700;">MEDIUM (2nd)</div></div>
            <div><div style="font-size:2.2em; font-weight:900;">${td.tiers.small}</div><div class="faint" style="font-size:.82em; font-weight:700;">SMALL (3rd)</div></div>
            <div><div style="font-size:2.2em; font-weight:900;">${td.participant.length}</div><div class="faint" style="font-size:.82em; font-weight:700;">PARTICIPANT (everybody else)</div></div>
            <div><div style="font-size:2.2em; font-weight:900; color:#b69cff;">${td.extra.length}</div><div class="faint" style="font-size:.82em; font-weight:700;">EXTRA ACTIVITY (their own trophy)</div></div>
            <div><div style="font-size:2.2em; font-weight:900;">${td.people}</div><div class="faint" style="font-size:.82em; font-weight:700;">PEOPLE TAKING PART</div></div></div>
        ${trophyCheckHtml(td)}
        <p class="muted" style="font-size:.85em; margin:0 0 8px;">Podium: 1st place = largest, 2nd = medium, 3rd = small. Every solo winner and every member of a podium team gets his own trophy, so someone who wins both solo and group gets two. Everybody who won nothing gets one participant trophy.</p>
        ${td.big.length ? `<div class="faint" style="font-size:.8em; font-weight:700;">WINNERS</div><div style="font-size:.88em; margin-bottom:8px; display:flex; flex-wrap:wrap;">${td.big.map((b) => `<span class="badge" style="margin:2px;">${esc(nameOf(b.person))} · ${esc(b.why)}</span>`).join('')}</div>` : '<div class="muted" style="font-size:.88em;">No results yet: the winner trophies appear once the judges have scored.</div>'}
        <div style="margin:8px 0; padding:8px 10px; border-radius:10px; background:var(--saffron-soft); font-size:.88em;">🎁 <span id="giftSummary">${giftSummaryHtml()}</span><div class="faint" style="font-size:.8em; margin-top:2px;">Volunteers, judges and sponsors each get a thank-you gift (like a trophy). Lists are in the Certificates card below, saved in the database.</div></div>
        ${td.participant.length ? `<div class="faint" style="font-size:.8em; font-weight:700;">PARTICIPANT</div><div style="font-size:.88em; display:flex; flex-wrap:wrap;">${td.participant.map((p) => `<span class="badge" style="margin:2px;">${esc(p.name)}</span>`).join('')}</div>` : ''}
    </div>`;
}
// Thank-you gifts (like a trophy) for the volunteers, the judges, the sponsors and the guest performers.
// The four lists (one name per line) are saved in the DATABASE (comp_events.settings.lists), so every
// device sees the same names. The volunteers who registered are filled in. Judges start with Judge 1-3.
const LIST_KEYS = { comp_volunteers: 'volunteers', comp_judges: 'judges', comp_sponsors: 'sponsors', comp_guests: 'guests' };
let pendingLists = {};       // typed but not saved yet (survives the 1 s refresh)
let listsSaveTimer = null;
function giftText(key) {
    const lk = LIST_KEYS[key];
    if (pendingLists[lk] !== undefined) return pendingLists[lk];
    const saved = (((st && st.event && st.event.settings) || {}).lists || {})[lk];
    if (saved !== undefined) return saved;
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }   // lists typed before they moved to the database
}
function giftList(key) { return giftText(key).split('\n').map((x) => x.trim()).filter(Boolean); }
function giftCounts() {
    const vol = giftList('comp_volunteers'), jud = giftList('comp_judges'), spo = giftList('comp_sponsors'), gue = giftList('comp_guests');
    const v = vol.length || (st.entries || []).filter((e) => !e.withdrawn && e.do_volunteer).length;
    return { v, j: jud.length || 3, s: spo.length, g: gue.length };
}
function giftSummaryHtml() {
    const g = giftCounts();
    return `<b>${g.v + g.j + g.s + g.g}</b> thank-you gifts: volunteers <b>${g.v}</b> · judges <b>${g.j}</b> · sponsors <b>${g.s}</b> · guest performers <b>${g.g}</b>`;
}
window.giftChanged = (key, el) => {
    pendingLists[LIST_KEYS[key]] = el.value;
    const sum = document.getElementById('giftSummary'); if (sum) sum.innerHTML = giftSummaryHtml();
    const tag = document.getElementById('listSaved'); if (tag) tag.textContent = 'saving…';
    clearTimeout(listsSaveTimer);
    listsSaveTimer = setTimeout(async () => {
        const lists = { ...(((st && st.event && st.event.settings) || {}).lists || {}), ...pendingLists };
        try {
            await backend.setSettings({ lists });
            if (st && st.event) st.event.settings = { ...(st.event.settings || {}), lists };
            pendingLists = {};
            const t2 = document.getElementById('listSaved'); if (t2) t2.textContent = 'saved ✓';
        } catch (e) {
            console.error('lists not saved', e);
            const t2 = document.getElementById('listSaved'); if (t2) t2.textContent = 'NOT saved, check the internet';
        }
    }, 700);
};
const JOB_LABEL = { backstage: 'Backstage', music: 'Music', stage: 'On stage', mic: 'On the mic' };
function registeredVolunteerLines() {
    return (st.entries || []).filter((e) => !e.withdrawn && e.do_volunteer)
        .map((e) => `${entryName(e)} | ${(e.volunteer_roles || []).map((r) => JOB_LABEL[r] || r).join(', ')}`).sort().join('\n');
}
function controlCerts() {
    return `${trophyPanelHtml()}<div class="card"><h3 style="margin-top:0;">Certificates (PDF, A4, ready to print) <span id="listSaved" class="faint" style="font-size:.6em; font-weight:700;"></span></h3>
        <p class="muted">One certificate per trophy: a winner gets one per win, everybody else one participation certificate (only once). Reveal the results first.</p>
        ${sponsorLogosHtml()}
        <div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));">
            <button class="btn" onclick="CompControl.trophyList()" title="How the trophies work, plus every student with the score and the trophy">Trophy list (scores + who gets what)</button>
            <button class="btn primary" onclick="CompControl.certificates('dancers')">Solo / group (winners + participation)</button>
            <button class="btn" onclick="CompControl.certificates('kids')">Extra activities only</button>
            <button class="btn" onclick="CompControl.certificates('volunteers')">Volunteers</button>
            <button class="btn" onclick="CompControl.certificates('judges')">Judges</button>
            <button class="btn" onclick="CompControl.certificates('sponsors')">Sponsors</button>
            <button class="btn" onclick="CompControl.certificates('guests')">Guest performers</button>
        </div>
        <div style="margin-top:14px;"><label class="faint" style="font-size:.82em; font-weight:700;">VOLUNTEERS (one per line: name | jobs)</label>
            <textarea id="volNames" rows="5" oninput="giftChanged('comp_volunteers', this)" style="width:100%; margin-top:6px; border-radius:10px; background:var(--bg2); color:var(--ink); border:1px solid var(--line); padding:10px; font:inherit;">${esc(giftText('comp_volunteers') !== '' ? giftText('comp_volunteers') : registeredVolunteerLines())}</textarea>
            <div class="faint" style="font-size:.78em; margin-top:4px;">The volunteers who registered are filled in (name | jobs). Add or remove lines as you like.</div></div>
        <div style="margin-top:14px; display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
            <div><label class="faint" style="font-size:.82em; font-weight:700;">JUDGES (one name per line)</label>
                <textarea rows="4" oninput="giftChanged('comp_judges', this)" placeholder="Judge 1&#10;Judge 2&#10;Judge 3" style="width:100%; margin-top:6px; border-radius:10px; background:var(--bg2); color:var(--ink); border:1px solid var(--line); padding:10px; font:inherit;">${esc(giftText('comp_judges'))}</textarea></div>
            <div><label class="faint" style="font-size:.82em; font-weight:700;">GUEST PERFORMERS (one per line: name | minutes)</label>
                <textarea rows="4" oninput="giftChanged('comp_guests', this)" placeholder="Group name | 8" style="width:100%; margin-top:6px; border-radius:10px; background:var(--bg2); color:var(--ink); border:1px solid var(--line); padding:10px; font:inherit;">${esc(giftText('comp_guests'))}</textarea></div>
            <div><label class="faint" style="font-size:.82em; font-weight:700;">SPONSORS (one name per line)</label>
                <textarea rows="4" oninput="giftChanged('comp_sponsors', this)" style="width:100%; margin-top:6px; border-radius:10px; background:var(--bg2); color:var(--ink); border:1px solid var(--line); padding:10px; font:inherit;">${esc(giftText('comp_sponsors'))}</textarea></div>
        </div>
    </div>`;
}

// ---------------- trophy list PDF: how the trophies work + every student, score and trophy ----------------
// For the coach (Roman Punjabi with English words). Needs the judges' scores, so it is made in Control.
function makeTrophyListPdf() {
    if (!window.jspdf) { alert('The PDF tool did not load. Reload the page and try again.'); return; }
    const { jsPDF } = window.jspdf;
    const set = st.event.settings || {};
    const option = Number(set.option || 1);
    const r = results();
    const td = trophyData();
    const posOf = (x) => (x ? (option === 2 ? x.opt2 : x.opt1) : null);
    const SIZE = { 1: 'LARGEST', 2: 'MEDIUM', 3: 'SMALL' };
    const SIZE_COLOR = { 1: [212, 160, 23], 2: [120, 134, 160], 3: [205, 127, 50], 0: [0, 150, 136], 4: [124, 77, 255] };
    const NAVY = [20, 26, 58], SAFFRON = [240, 138, 36];
    const tint = (c, k) => c.map((v) => Math.round(v + (255 - v) * k));
    const fmt = (n) => (Math.round(n * 10) / 10).toString();

    // one row per person
    const rows = td.entries.filter((e) => e.do_solo || e.do_group || e.do_activity).map((e) => {
        const slot = st.slots.find((x) => x.kind === 'solo' && x.entry_id === e.id);
        const sRes = slot ? ((r[e.category] || {}).solos || []).find((x) => x.slotId === slot.id) : null;
        const tRes = e.do_group && e.team_id ? ((r[e.category] || {}).teams || []).find((x) => x.teamId === e.team_id) : null;
        const soloTxt = !e.do_solo ? '' : (sRes && sRes.judges ? `${fmt(sRes.soloTotal)}/40` + (posOf(sRes) ? ` · ${ordinal(posOf(sRes))}` : '') : 'no score');
        const groupTxt = !e.do_group ? (!e.do_solo && e.do_activity ? 'Extra activity' : '') : (tRes ? `${teamName(e.team_id)} · ${tRes.complete || tRes.group ? fmt(tRes.group) + '/50' : 'no score'}` + (posOf(tRes) && tRes.group ? ` · ${ordinal(posOf(tRes))}` : '') : 'no team');
        const wins = td.big.filter((b) => b.person === e.id).map((b) => ({ place: b.place, text: `${SIZE[b.place]} (${b.why.replace(/ \(.*\)$/, '')})` }));
        const trophies = wins.length ? wins.slice() : ((e.do_solo || e.do_group) ? [{ place: 0, text: 'PARTICIPANT' }] : []);
        if (e.do_activity) trophies.push({ place: 4, text: 'EXTRA ACTIVITY' });
        return { name: entryName(e), cat: e.category || '', soloTxt, groupTxt, trophies };
    }).sort((a, b) => a.name.localeCompare(b.name));
    if (!rows.length) { alert('Nobody is registered yet.'); return; }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 14;
    let y = 0;
    const title = COMP_BRAND + ' · ' + COMP_NAME;
    const fit = (txt, w, size, bold) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); let s = size; while (s > 6.5 && doc.getTextWidth(txt) > w) { s -= 0.5; doc.setFontSize(s); } };
    const bar = (text, color) => {
        if (y + 14 > H - M) { doc.addPage(); y = M; }
        doc.setFillColor(...color); doc.roundedRect(M, y, W - 2 * M, 9, 2.5, 2.5, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text(text, M + 4, y + 6.2);
        y += 13;
    };
    const para = (text, size, color, gap) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
        const lines = doc.splitTextToSize(text, W - 2 * M - 4);
        if (y + lines.length * (size * 0.43) > H - M) { doc.addPage(); y = M; }
        doc.text(lines, M + 2, y + 3.5);
        y += lines.length * (size * 0.43) + (gap == null ? 2.5 : gap);
    };

    // ---- header ----
    doc.setFillColor(...NAVY); doc.rect(0, 0, W, 34, 'F');
    doc.setFillColor(...SAFFRON); doc.rect(0, 34, W, 2.5, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('Trophies: who gets what', M, 17);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(255, 210, 150); doc.text(title, M, 27);
    y = 46;

    // ---- the rules ----
    bar('KIVE KAMM KARDA HAI', NAVY);
    para('1.  Trophy de 3 size ne podium layi: 1st place = LARGEST, 2nd place = MEDIUM, 3rd place = SMALL.', 10.5, NAVY);
    para('2.  SOLO: har category (A te B) ch top 3 dancers nu ik-ik trophy.', 10.5, NAVY);
    para('3.  GROUP: har category ch top 3 teams. Jitan wali team da HAR member apni alag trophy lainda hai (team ch 8 hon taan 8 trophies).', 10.5, NAVY);
    para('4.  Je koi solo vi jitte te group vi jitte, ohnu 2 trophies milde ne.', 10.5, NAVY);
    para('5.  Jo kuj nahi jitda, ohnu ik PARTICIPANT trophy. Solo + group karan wale nu vi sirf ik. Jitan wale nu participant vakhri nahi.', 10.5, NAVY);
    para('6.  Har jitan wale nu place da certificate vi milda hai. Tie hove taan dovein nu same place te same size di trophy.', 10.5, NAVY);
    para('7.  EXTRA ACTIVITY: jo vi extra activity ch hissa lainda hai, ohnu apni vakhri EXTRA trophy milde, bhaven oh solo ya group vi karda hove (oh upar wali trophy ton alag, extra). Sirf extra activity wale nu participant trophy nahi, bas ehi ik.', 10.5, NAVY, 4);

    // ---- the numbers ----
    bar('KINNIYAN TROPHIES', NAVY);
    const items = [['LARGEST', '1st place', td.tiers.largest, 1], ['MEDIUM', '2nd place', td.tiers.medium, 2], ['SMALL', '3rd place', td.tiers.small, 3], ['PARTICIPANT', 'kuj nahi jitya', td.participant.length, 0], ['EXTRA', 'extra activity', td.extra.length, 4]];
    const cw = (W - 2 * M - 4 * 4) / 5;
    if (y + 34 > H - M) { doc.addPage(); y = M; }
    items.forEach((it, i) => {
        const px = M + i * (cw + 4), c = SIZE_COLOR[it[3]];
        doc.setFillColor(...tint(c, 0.86)); doc.roundedRect(px, y, cw, 30, 3, 3, 'F');
        doc.setFillColor(...c); doc.roundedRect(px, y, cw, 8, 3, 3, 'F'); doc.rect(px, y + 4, cw, 4, 'F');
        doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(it[0], px + cw / 2, y + 5.6, { align: 'center' });
        doc.setTextColor(...NAVY); doc.setFontSize(24); doc.text(String(it[2]), px + cw / 2, y + 21, { align: 'center' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110, 116, 150); doc.text(it[1], px + cw / 2, y + 27, { align: 'center' });
    });
    y += 36;
    para(`Total ${td.tiers.largest + td.tiers.medium + td.tiers.small + td.participant.length + td.extra.length} trophies (extra activity vi gine), ${td.people} bande. Neeche order wahi hai jo stage te chalega: har screen ch 3rd, 2nd, 1st, fer participant.`, 9.5, [110, 116, 150], 5);

    // ---- used against bought ----
    const chk = trophyCheck(td);
    bar('KITNIYAN VARTIYAN, KITNIYAN BACHIYAN', NAVY);
    const colsX = [M + 2, M + 80, M + 105, M + 130];
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(110, 116, 150);
    if (y + 8 + chk.rows.length * 6.5 + 14 > H - M) { doc.addPage(); y = M; }
    ['WHAT', 'USED', 'BOUGHT', ''].forEach((h, i) => doc.text(h, colsX[i], y + 3));
    y += 6;
    chk.rows.forEach((rw, i) => {
        if (i % 2 === 0) { doc.setFillColor(244, 246, 252); doc.rect(M, y - 1.2, W - 2 * M, 6.4, 'F'); }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
        doc.text(rw.label, colsX[0], y + 3); doc.text(String(rw.used), colsX[1], y + 3); doc.text(rw.bought === null ? '-' : String(rw.bought), colsX[2], y + 3);
        const t = rw.left === null ? 'bought not typed' : rw.left === 0 ? 'exactly enough' : rw.left > 0 ? rw.left + ' left over' : 'SHORT by ' + (-rw.left);
        doc.setTextColor(...(rw.left !== null && rw.left < 0 ? [200, 40, 40] : [30, 130, 70])); doc.text(t, colsX[3], y + 3);
        y += 6.4;
    });
    y += 3;
    para(chk.missing.length ? 'Bina trophy: ' + chk.missing.join(', ') : 'Koi vi bina trophy nahi reha: sab ' + chk.people + ' bande nu trophy hai.', 10, chk.missing.length ? [200, 40, 40] : [30, 130, 70], 2);
    if (chk.unscored) para(chk.unscored + ' performance nu abhi poore score nahi mile, isliye sankhya badal sakdi hai.', 9, [110, 116, 150], 5);
    y += 2;

    // ---- handing-out order, as decided: for each screen (B solo, B group, A solo, A group) 3rd, 2nd, 1st; then the participants ----
    const ROW_H = 6.6, RIGHT = W - M;
    const placeWord = (p) => ({ 1: '1st', 2: '2nd', 3: '3rd' }[p]);
    const need = (h) => { if (y + h > H - M - 4) { doc.addPage(); y = M; } };
    const chip = (place, x, yy) => { doc.setFillColor(...SIZE_COLOR[place]); doc.circle(x, yy - 1.2, 1.7, 'F'); };
    const memberNames = (teamId) => td.entries.filter((e) => e.do_group && e.team_id === teamId).map(entryName).sort((p, q) => p.localeCompare(q));
    [['B', true], ['B', false], ['A', true], ['A', false]].forEach(([cat, solo]) => {
        const list = solo
            ? ((r[cat] || {}).solos || []).filter((x) => x.opt1 && posOf(x) <= 3)
            : ((r[cat] || {}).teams || []).filter((x) => !x.disqualified && x.opt1 && posOf(x) <= 3);
        bar('CATEGORY ' + cat + ' · ' + (solo ? 'SOLO' : 'GROUP') + (list.length ? '' : ' · nobody ranked yet'), cat === 'B' ? [0, 150, 136] : [229, 57, 112]);
        [3, 2, 1].forEach((place) => {
            list.filter((x) => posOf(x) === place).forEach((x) => {
                const size = SIZE[place];
                if (solo) {
                    need(ROW_H + 1);
                    doc.setFillColor(...tint(SIZE_COLOR[place], 0.9)); doc.roundedRect(M, y - 4.2, W - 2 * M, ROW_H, 1.5, 1.5, 'F');
                    chip(place, M + 4, y);
                    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(placeWord(place), M + 8, y);
                    fit(x.name, 62, 10.5, true); doc.text(x.name, M + 22, y);
                    doc.setTextColor(60, 66, 100); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(x.teamName || '', M + 88, y);
                    doc.text(fmt(x.soloTotal) + '/40', M + 130, y);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(size + ' trophy', RIGHT - 2, y, { align: 'right' });
                    y += ROW_H + 1;
                } else {
                    const names = memberNames(x.teamId);
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
                    const lines = doc.splitTextToSize(names.join(', '), W - 2 * M - 30);
                    const h = ROW_H + 1 + lines.length * 4.4 + 1.5;
                    need(h);
                    doc.setFillColor(...tint(SIZE_COLOR[place], 0.9)); doc.roundedRect(M, y - 4.2, W - 2 * M, h - 1, 1.5, 1.5, 'F');
                    chip(place, M + 4, y);
                    doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(placeWord(place), M + 8, y);
                    fit(x.name, 70, 10.5, true); doc.text(x.name, M + 22, y);
                    doc.setTextColor(60, 66, 100); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(fmt(x.group) + '/50', M + 130, y);
                    doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY); doc.text(names.length + ' x ' + size + ' trophy', RIGHT - 2, y, { align: 'right' });
                    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(60, 66, 100); doc.text(lines, M + 22, y + 5);
                    y += h;
                }
            });
        });
        y += 3;
    });

    // ---- participants: nobody who won a place; one participant trophy each ----
    const X = { name: M + 2, solo: M + 50, group: M + 100 };
    const peopleTable = (list, headText, color, emptyText) => {
        bar(headText + ' · ' + list.length + ' people', color);
        if (!list.length) { para(emptyText, 10, [110, 116, 150]); return; }
        const head = () => {
            doc.setFillColor(...NAVY); doc.roundedRect(M, y, W - 2 * M, 7, 1.5, 1.5, 'F');
            doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
            doc.text('NAME', X.name, y + 4.8); doc.text('SOLO (score · place)', X.solo, y + 4.8); doc.text('GROUP (team · score · place)', X.group, y + 4.8);
            y += 9;
        };
        head();
        list.forEach((p, i) => {
            if (y + 7 > H - M - 4) { doc.addPage(); y = M; head(); }
            if (i % 2 === 0) { doc.setFillColor(244, 246, 252); doc.rect(M, y - 1, W - 2 * M, 7, 'F'); }
            doc.setTextColor(...NAVY); fit(p.name, X.solo - X.name - 4, 10, true); doc.text(p.name, X.name, y + 3.6);
            doc.setTextColor(60, 66, 100); fit(p.soloTxt || '-', X.group - X.solo - 3, 9); doc.text(p.soloTxt || '-', X.solo, y + 3.6);
            fit(p.groupTxt || '-', RIGHT - X.group, 9); doc.text(p.groupTxt || '-', X.group, y + 3.6);
            y += 7;
        });
        y += 4;
    };
    // participants: nobody who won a place, one participant trophy each (solo/group people)
    peopleTable(rows.filter((p) => p.trophies.some((t) => t.place === 0)), 'PARTICIPANT TROPHY', SIZE_COLOR[0], 'Nobody yet.');
    // extra activity: everybody who did it has their own trophy, also if they dance solo/group too
    peopleTable(rows.filter((p) => p.trophies.some((t) => t.place === 4)), 'EXTRA ACTIVITY TROPHY (their own, on top of the others)', SIZE_COLOR[4], 'Nobody did the extra activity.');

    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
        doc.setPage(p);
        doc.setFillColor(...SAFFRON); doc.rect(0, H - 8, W, 1, 'F');
        doc.setTextColor(120, 126, 150); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(title + ' · trophies', M, H - 3.5); doc.text('Page ' + p + ' of ' + pages, W - M, H - 3.5, { align: 'right' });
    }
    doc.save('trophies-who-gets-what.pdf');
}

// ---------------- certificates (jsPDF) ----------------
// Look: ivory page, navy + gold (the colours of the Bhangra Sway logo), a big logo in front at the top and as a
// faint watermark, a seal (rosette with the place, or a star), and the sponsors' logos small at the bottom right.
const CERT_NAVY = [20, 26, 58], CERT_GOLD = [201, 151, 28], CERT_GOLD_DARK = [140, 100, 10], CERT_GRAY = [110, 116, 150];
const CERT_PLACE_COLOR = { 1: [212, 160, 23], 2: [150, 158, 175], 3: [176, 112, 64] };
const imgFormat = (data) => (/^data:image\/jpe?g/i.test(data) ? 'JPEG' : 'PNG');

// Pictures needed for the PDF: our logo (from the site) and the sponsor logos (from the database).
async function certAssets() {
    const toData = async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw new Error('image ' + r.status);
        const b = await r.blob();
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
    };
    const dims = (d) => new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth || 1, h: im.naturalHeight || 1 }); im.onerror = () => res({ w: 1, h: 1 }); im.src = d; });
    // the logo is cut to its circle and put on the ivory page colour (the icon has black corners, and a transparent PNG can show a black box in the PDF)
    const flatten = (d, w, h) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fdfbf5'; x.fillRect(0, 0, w, h); x.save(); x.beginPath(); x.arc(w / 2, h / 2, w * 0.482, 0, Math.PI * 2); x.clip(); x.drawImage(im, 0, 0, w, h); x.restore(); res(c.toDataURL('image/jpeg', 0.95)); }; im.onerror = () => res(d); im.src = d; });
    let logo = null;
    try { logo = await flatten(await toData('icons/icon-512.png'), 512, 512); } catch (e) { console.warn('logo not loaded', e); }
    const sponsors = [];
    for (const l of sponsorLogoList()) {
        try {
            const data = l.data || await toData(songUrl(l.path));
            sponsors.push({ data, ...(await dims(data)) });
        } catch (e) { console.warn('sponsor logo not loaded', l, e); }
    }
    return { logo, sponsors };
}

// Letter-spaced text, centred (or right-aligned) by hand: jsPDF centres it wrongly when charSpace is used
function certSpaced(doc, text, x, y, cs, align) {
    const w = doc.getTextWidth(text) + cs * (text.length - 1);
    doc.text(text, align === 'right' ? x - w : x - w / 2, y, { charSpace: cs });
}
function certStar(doc, cx, cy, R, r, color) {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R; pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]); }
    const rel = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
    doc.setFillColor(...color); doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'F', true);
}
function certDiamond(doc, x, y, r, color) {
    doc.setFillColor(...color); doc.lines([[r, r], [-r, r], [-r, -r], [r, -r]], x, y - r, [1, 1], 'F', true);
}

// One certificate page. title: '1st Place' kinds / 'Certificate of Participation' / 'Thank You'.
function certPage(doc, A, W, H, title, name, line1, line2, date, first, parent) {
    if (!first) doc.addPage();
    const place = Number((title.match(/(\d)(?:st|nd|rd)/) || [])[1]) || 0;
    const kind = place ? 'ACHIEVEMENT' : /Participation/i.test(title) ? 'PARTICIPATION' : 'APPRECIATION';
    const accent = place ? CERT_PLACE_COLOR[place] || CERT_GOLD : CERT_GOLD;
    const cx = W / 2;
    // page + frame
    doc.setFillColor(253, 251, 245); doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(...CERT_NAVY); doc.setLineWidth(0.5); doc.rect(7, 7, W - 14, H - 14);
    doc.setDrawColor(...CERT_GOLD); doc.setLineWidth(1.8); doc.rect(10, 10, W - 20, H - 20);
    doc.setDrawColor(...CERT_NAVY); doc.setLineWidth(0.3); doc.rect(13, 13, W - 26, H - 26);
    doc.setDrawColor(...CERT_GOLD); doc.setLineWidth(0.25); doc.rect(15.5, 15.5, W - 31, H - 31);
    // corner roundels
    [[13, 13], [W - 13, 13], [13, H - 13], [W - 13, H - 13]].forEach(([x, y]) => {
        doc.setFillColor(...CERT_GOLD); doc.circle(x, y, 5.2, 'F');
        doc.setFillColor(253, 251, 245); doc.circle(x, y, 3.3, 'F');
        doc.setFillColor(...CERT_NAVY); doc.circle(x, y, 1.3, 'F');
    });
    // faint watermark logo
    if (A.logo) {
        try {
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.055 }));
            doc.addImage(A.logo, imgFormat(A.logo), cx - 72, 44, 144, 144);
            doc.restoreGraphicsState();
        } catch (e) { doc.setGState(new doc.GState({ opacity: 1 })); }
    }
    // big logo in front, over the top of the frame
    doc.setFillColor(253, 251, 245); doc.circle(cx, 33, 24.5, 'F');
    doc.setDrawColor(...CERT_GOLD); doc.setLineWidth(1.1); doc.circle(cx, 33, 24.5, 'S');
    if (A.logo) {   // clipped to its circle, so the square corners do not cover the frame
        doc.saveGraphicsState(); doc.circle(cx, 33, 20.6, null); doc.clip(); doc.discardPath();
        doc.addImage(A.logo, imgFormat(A.logo), cx - 21, 12, 42, 42);
        doc.restoreGraphicsState();
    }
    // headings
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...CERT_GOLD_DARK);
    doc.setFontSize(13); certSpaced(doc, COMP_BRAND.toUpperCase(), cx, 61.5, 4);
    doc.setFontSize(8.5); doc.setTextColor(...CERT_GRAY); certSpaced(doc, COMP_NAME.toUpperCase(), cx, 67.5, 2.2);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(31); doc.setTextColor(...CERT_NAVY);
    certSpaced(doc, 'CERTIFICATE', cx, 81, 3.5);
    doc.setFontSize(11.5); doc.setTextColor(...CERT_GOLD_DARK);
    certSpaced(doc, 'OF ' + kind, cx, 89.5, 3.2);
    doc.setDrawColor(...CERT_GOLD); doc.setLineWidth(0.5);
    doc.line(cx - 80, 88, cx - 54, 88); doc.line(cx + 54, 88, cx + 80, 88);
    certDiamond(doc, cx - 52, 88, 1.3, CERT_GOLD); certDiamond(doc, cx + 52, 88, 1.3, CERT_GOLD);
    // presented to + name
    doc.setFont('times', 'italic'); doc.setFontSize(14); doc.setTextColor(...CERT_GRAY);
    doc.text('This certificate is proudly presented to', cx, 100, { align: 'center' });
    doc.setFont('times', 'bolditalic'); doc.setTextColor(...CERT_NAVY);
    let fs = 42; doc.setFontSize(fs);
    while (fs > 22 && doc.getTextWidth(name) > W - 80) { fs -= 2; doc.setFontSize(fs); }
    doc.text(name, cx, 115.5, { align: 'center' });
    doc.setDrawColor(...CERT_GOLD); doc.setLineWidth(0.6); doc.line(cx - 75, 121, cx + 75, 121);
    certDiamond(doc, cx, 121, 1.8, CERT_GOLD);
    // what for
    let y = 132;
    if (parent) {
        doc.setFont('times', 'italic'); doc.setFontSize(12); doc.setTextColor(...CERT_GRAY);
        doc.text('child of ' + parent, cx, 128, { align: 'center' }); y = 139;
    }
    if (place) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...CERT_GOLD_DARK);
        certSpaced(doc, title.replace(/ Place$/, ' PLACE').toUpperCase(), cx, y, 1.2); y += 8.5;
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(13.5); doc.setTextColor(40, 46, 80);
    if (line1) { doc.text(line1, cx, y, { align: 'center' }); y += 8; }
    if (line2) { doc.setFontSize(11.5); doc.setTextColor(...CERT_GRAY); doc.text(line2, cx, y, { align: 'center' }); }
    // signature lines
    doc.setDrawColor(...CERT_NAVY); doc.setLineWidth(0.35);
    doc.line(34, 172, 94, 172); doc.line(W - 94, 172, W - 34, 172);
    doc.setFont('times', 'italic'); doc.setFontSize(12); doc.setTextColor(...CERT_NAVY);
    doc.text(date, 64, 169.5, { align: 'center' });
    doc.text(COMP_BRAND, W - 64, 169.5, { align: 'center' });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...CERT_GRAY);
    certSpaced(doc, 'DATE', 64, 176.5, 1.5); certSpaced(doc, 'ORGANISER', W - 64, 176.5, 1.5);
    // seal: rosette with the place, or a star
    doc.setFillColor(...accent); doc.triangle(cx - 6, 178, cx - 12, 192, cx - 3, 188, 'F'); doc.triangle(cx + 6, 178, cx + 12, 192, cx + 3, 188, 'F');
    doc.circle(cx, 170, 12.5, 'F');
    doc.setDrawColor(253, 251, 245); doc.setLineWidth(0.7); doc.circle(cx, 170, 10.2, 'S');
    doc.setDrawColor(...CERT_NAVY); doc.setLineWidth(0.3); doc.circle(cx, 170, 12.5, 'S');
    if (place) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...CERT_NAVY);
        doc.text(String(place), cx - 1.2, 172.4, { align: 'center' });
        doc.setFontSize(8); doc.text(['st', 'nd', 'rd'][place - 1], cx + 3.6, 169.4, { align: 'left' });
    } else certStar(doc, cx, 170.6, 7.5, 3.1, CERT_NAVY);
    // sponsors: small, bottom right
    if (A.sponsors.length) {
        const h = 8.5, maxW = 26, gap = 5;
        const items = A.sponsors.map((s) => { let w = h * s.w / s.h, hh = h; if (w > maxW) { w = maxW; hh = w * s.h / s.w; } return { s, w, hh }; });
        let x = W - 22 - items.reduce((t, it) => t + it.w, 0) - gap * (items.length - 1);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(...CERT_GRAY);
        certSpaced(doc, 'SUPPORTED BY', W - 22, 183, 1, 'right');
        items.forEach((it) => { try { doc.addImage(it.s.data, imgFormat(it.s.data), x, 185 + (h - it.hh) / 2, it.w, it.hh); } catch (e) { /* skip a broken logo */ } x += it.w + gap; });
    }
}

async function makeCertificates(kind) {
    const snap = (st.live || {}).revealed;
    if (kind === 'dancers' && !snap) { alert('Reveal the results first, so the certificates match what everyone saw.'); return; }
    if (!window.jspdf) { alert('The PDF tool did not load. Reload the page and try again.'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const A = await certAssets();
    let first = true;
    const page = (title, name, line1, line2, parent) => { certPage(doc, A, W, H, title, name, line1, line2, date, first, parent); first = false; };
    if (kind === 'dancers') {
        const td = trophyData();
        const wins = {};
        td.certs.forEach((b) => (wins[b.person] = wins[b.person] || []).push(b.why));
        td.entries.filter((e) => e.do_solo || e.do_group).sort((a, b) => entryName(a).localeCompare(entryName(b))).forEach((e) => {
            const did = [e.do_solo && 'Solo', e.do_group && `Group · ${teamName(e.team_id)}`].filter(Boolean).join(' + ');
            const w = wins[e.id] || [];
            if (w.length) w.forEach((why) => {
                const m = why.match(/^(.*?) \((.*)\)$/) || [why, why, ''];
                page(`${m[1]} Place`, entryName(e), m[1].startsWith('Solo') ? `Solo · Category ${m[2]}` : `Group · Team ${m[2]}`, 'Congratulations, a big win!', parentOf(e));
            });
            else page('Certificate of Participation', entryName(e), did + (e.category ? ` · Category ${e.category}` : ''), 'Thank you for your energy, dedication and bhangra spirit.', parentOf(e));
        });
    } else if (kind === 'kids') {
        // only people who do the extra activity and nothing else (the rest already get a certificate above)
        (st.entries || []).filter((e) => !e.withdrawn && e.do_activity && !e.do_solo && !e.do_group).sort((a, b) => entryName(a).localeCompare(entryName(b)))
            .forEach((e) => page('Certificate of Participation', entryName(e), 'Extra activities', 'Thank you for taking part. Well done!', parentOf(e)));
    } else if (kind === 'guests') {
        const lines = giftList('comp_guests');
        if (!lines.length) { alert('Type the guest performers first (one per line), in the box below the buttons.'); return; }
        lines.forEach((line) => { const n = line.split('|')[0].trim(); page('Thank You', n, 'for performing at the ' + COMP_NAME, 'Guest performer'); });
    } else if (kind === 'judges' || kind === 'sponsors') {
        const key = kind === 'judges' ? 'comp_judges' : 'comp_sponsors';
        const names = giftList(key);
        if (!names.length) { alert('Type the ' + kind + ' names first (one per line), in the box below the buttons.'); return; }
        names.forEach((n) => page('Thank You', n, kind === 'judges' ? 'for judging the ' + COMP_NAME : 'for supporting the ' + COMP_NAME, kind === 'judges' ? 'Judge' : 'Sponsor'));
    } else {
        const names = (document.getElementById('volNames').value || '').split('\n').map((x) => x.trim()).filter(Boolean);
        if (!names.length) { alert('Type the volunteers\' names first (one per line).'); return; }
        names.forEach((line) => { const [n, jobs] = line.split('|').map((x) => x.trim()); page('Thank You', n, 'for making the ' + COMP_NAME + ' happen', jobs ? 'Volunteer · ' + jobs : 'Volunteer'); });
    }
    if (first) { alert('Nothing to print yet.'); return; }
    doc.save(`certificates-${kind}.pdf`);
}

// ---- sponsor logos: stored in the comp-songs storage bucket (logos/…), listed in comp_events.settings.sponsor_logos ----
function sponsorLogoList() { return ((((st && st.event && st.event.settings) || {}).sponsor_logos) || []); }
function sponsorLogoSrc(l) { return l.data || songUrl(l.path); }
function sponsorLogosHtml() {
    const list = sponsorLogoList();
    return `<div style="margin:10px 0 14px; padding:10px 12px; border-radius:12px; border:1px solid var(--line);">
        <div style="font-weight:800; margin-bottom:4px;">Sponsor logos <span class="faint" style="font-weight:600; font-size:.85em;">(small, bottom right of every certificate · up to 6)</span></div>
        <div style="display:flex; flex-wrap:wrap; gap:10px; align-items:center;">
            ${list.map((l, i) => `<div style="position:relative; background:#fff; border-radius:8px; padding:6px; height:54px; display:flex; align-items:center;"><img src="${esc(sponsorLogoSrc(l))}" alt="" style="max-height:42px; max-width:110px;"><span title="Remove" onclick="sponsorLogoRemove(${i})" style="position:absolute; top:-7px; right:-7px; background:#ff6b68; color:#fff; border-radius:50%; width:20px; height:20px; text-align:center; line-height:20px; cursor:pointer; font-weight:900;">×</span></div>`).join('')}
            ${list.length < 6 ? `<label class="btn small" style="cursor:pointer;">+ Add logos<input type="file" accept="image/*" multiple style="display:none;" onchange="sponsorLogoAdd(this)"></label>` : ''}
            <span id="logoMsg" class="faint" style="font-size:.85em;"></span></div></div>`;
}
// Shrinks a picture to at most 420 px (keeps transparency) so it stays small.
function shrinkImage(file, max) {
    return new Promise((res, rej) => {
        const url = URL.createObjectURL(file);
        const im = new Image();
        im.onload = () => {
            const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
            const c = document.createElement('canvas');
            c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            URL.revokeObjectURL(url);
            c.toBlob((b) => (b ? res({ blob: b, data: c.toDataURL('image/png') }) : rej(new Error('image'))), 'image/png');
        };
        im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('This file is not a picture')); };
        im.src = url;
    });
}
async function saveSponsorLogos(list) {
    await backend.setSettings({ sponsor_logos: list });
    if (st && st.event) st.event.settings = { ...(st.event.settings || {}), sponsor_logos: list };
}
window.sponsorLogoAdd = async (input) => {
    const msg = document.getElementById('logoMsg');
    try {
        const files = [...input.files].slice(0, Math.max(0, 6 - sponsorLogoList().length));
        const list = sponsorLogoList().slice();
        for (const f of files) {
            if (msg) msg.textContent = 'Saving ' + f.name + '…';
            const img = await shrinkImage(f, 420);
            if (DEMO || !supa) { list.push({ name: f.name, data: img.data }); continue; }
            const path = `logos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
            const up = await supa.storage.from('comp-songs').upload(path, img.blob, { contentType: 'image/png' });
            if (up.error) throw up.error;
            list.push({ name: f.name, path });
        }
        await saveSponsorLogos(list);
        if (msg) msg.textContent = 'saved ✓';
        render();
    } catch (e) { console.error(e); if (msg) msg.textContent = 'Not saved: ' + (e.message || e); }
    input.value = '';
};
window.sponsorLogoRemove = async (i) => {
    const list = sponsorLogoList().slice();
    const gone = list.splice(i, 1)[0];
    try {
        await saveSponsorLogos(list);
        if (gone && gone.path && supa) supa.storage.from('comp-songs').remove([gone.path]).catch(() => {});
        render();
    } catch (e) { alert('Not removed: ' + (e.message || e)); }
};

// ---------------- JUDGE ----------------
const draft = {};     // slotId -> criteria being edited (survives polls)
let saveState = '';   // '', 'saving', 'saved', 'locked', 'error'
// Two tabs: live scoring, and the scores this judge has already given (read-only).
let judgeTab = ['mine', 'rank'].includes(params.get('tab')) ? params.get('tab') : 'live';
function judgeTabsHtml() {
    const b = (k, label) => `<button onclick="CompJudge.tab('${k}')" style="flex:1; padding:10px 6px; border-radius:10px; font-weight:800; font-size:.92em; background:${judgeTab === k ? 'var(--saffron)' : 'var(--card2)'}; color:${judgeTab === k ? '#1b1000' : 'var(--soft)'}; border:1px solid var(--line);">${tr(label)}</button>`;
    return `<div style="display:flex; gap:8px; margin-bottom:12px;">${b('live', 'Live scoring')}${b('mine', 'My scores')}${b('rank', 'Ranking')}</div>`;
}
// Who is ahead according to THIS judge's own scores (never other judges').
function renderJudgeRank() {
    const mine = st.myScores || {};
    const board = (kind, cat) => {
        const keys = kind === 'solo' ? S.SOLO_CRITERIA : S.GROUP_CRITERIA;
        const rows = st.slots.filter((x) => x.kind === kind && x.category === cat && x.status !== 'disqualified').map((x) => {
            const sc = mine[x.id] || {};
            if (!keys.every((c) => typeof sc[c] === 'number')) return null;
            return { x, total: S.r1(keys.reduce((t, c) => t + sc[c], 0)) };
        }).filter(Boolean).sort((a, b) => b.total - a.total);
        let pos = 0, prev = null;
        rows.forEach((r, i) => { if (prev === null || r.total !== prev) pos = i + 1; r.pos = pos; prev = r.total; });
        return { rows, max: keys.length * 10 };
    };
    const sections = [];
    ['B', 'A'].forEach((cat) => ['solo', 'group'].forEach((kind) => { const b = board(kind, cat); if (b.rows.length) sections.push({ cat, kind, ...b }); }));
    const key = JSON.stringify(['rank', LANG, sections.map((x) => [x.cat, x.kind, x.rows.map((r) => [r.x.id, r.total])])]);
    const medal = (p) => ({ 1: '#ffc94d', 2: '#cfd5e8', 3: '#d99a63' }[p] || null);
    paint(key, `<div class="wrap" style="max-width:680px;">${judgeModeBar()}${judgeTabsHtml()}
        <div class="faint" style="font-size:.82em; margin:0 0 10px;">${tr("Ranked by YOUR scores only. Other judges' scores are not shown.")}</div>
        ${sections.length ? sections.map((sec) => `<div class="card" style="margin-bottom:12px;">
            <div style="font-weight:900; margin-bottom:6px;">${tr(sec.kind === 'solo' ? 'Solo ranking' : 'Group ranking')} · ${tr('Category')} ${sec.cat}</div>
            ${sec.rows.map((r) => `<div class="list-row" style="${r.pos <= 3 ? 'background:var(--saffron-soft); border-radius:10px; padding-left:8px; padding-right:8px;' : ''}">
                <span style="font-weight:900; font-size:1.15em; min-width:34px; color:${medal(r.pos) || 'var(--faint)'};">${r.pos}</span>
                <div style="flex:1; min-width:0;"><div style="font-weight:800;">${esc(slotTitle(r.x))}</div>${r.x.kind === 'solo' && r.x.team_id ? `<div class="faint" style="font-size:.78em;">${esc(teamName(r.x.team_id))}</div>` : ''}</div>
                <span style="font-weight:900;">${r.total}<span class="faint" style="font-weight:600; font-size:.8em;">/${sec.max}</span></span></div>`).join('')}
        </div>`).join('') : `<div class="card muted" style="text-align:center;">${tr('Nothing scored yet.')}</div>`}
    </div>`);
}
function renderJudgeMine() {
    const cur = current();
    const mine = st.myScores || {};
    const sentIds = (st.mySubmitted || []).map(Number);
    const rows = st.slots.filter((x) => (x.kind === 'solo' || x.kind === 'group') && (mine[x.id] || (draft[x.id] && x.id === (cur && cur.id))))
        .map((x) => ({ x, sc: (x.id === (cur && cur.id) && draft[x.id]) ? draft[x.id] : mine[x.id] }))
        .filter((r) => r.sc && Object.keys(r.sc).length)
        .sort((a, b) => b.x.position - a.x.position);   // latest first
    const key = JSON.stringify(['mine', LANG, rows.map((r) => [r.x.id, r.sc]), sentIds, cur && cur.id]);
    paint(key, `<div class="wrap" style="max-width:680px;">${judgeModeBar()}${judgeTabsHtml()}
        ${rows.length ? rows.map(({ x, sc }) => {
            const crit = x.kind === 'solo' ? S.SOLO_CRITERIA.concat(S.SOLO_EXTRA) : S.GROUP_CRITERIA;
            const totalKeys = x.kind === 'solo' ? S.SOLO_CRITERIA : S.GROUP_CRITERIA;
            const total = S.r1(totalKeys.reduce((t, c) => t + (typeof sc[c] === 'number' ? sc[c] : 0), 0));
            const state = x.id === (cur && cur.id) && !sentIds.includes(x.id) ? tr('in progress') : sentIds.includes(x.id) ? tr('sent') : tr('not sent');
            return `<div class="card" style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
                    <div><span class="code">${esc(x.code || '')}</span> <b>${esc(slotTitle(x))}</b></div>
                    <span class="badge ${sentIds.includes(x.id) ? 'ok' : ''}">${state}</span></div>
                <div class="muted" style="font-size:.82em; margin:2px 0 8px;">${esc(slotSub(x))}</div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(92px, 1fr)); gap:6px;">
                    ${crit.map((c) => `<div style="background:var(--bg2); border-radius:8px; padding:6px 8px;"><div class="faint" style="font-size:.7em; font-weight:700;">${esc(tr(CRIT_LABEL[c]))}</div><div style="font-weight:900; font-size:1.1em; color:var(--gold);">${typeof sc[c] === 'number' ? sc[c] : '–'}</div></div>`).join('')}
                    <div style="background:var(--saffron-soft); border-radius:8px; padding:6px 8px;"><div class="faint" style="font-size:.7em; font-weight:700;">${tr('Total')}</div><div style="font-weight:900; font-size:1.1em;">${total}/${totalKeys.length * 10}</div></div>
                </div></div>`;
        }).join('') : `<div class="card muted" style="text-align:center;">${tr('No scores given yet.')}</div>`}
    </div>`);
}
function renderJudge() {
    if (judgeTab === 'mine') { renderJudgeMine(); return; }
    if (judgeTab === 'rank') { renderJudgeRank(); return; }
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
    const key = JSON.stringify(['live', cur && cur.id, live.phase, scorable && d, saveState, st.judgeName, sent, LANG]);
    if (!scorable) {
        const up = nextWaiting(cur ? cur.position : 0)[0];
        paint(key, `<div class="wrap" style="max-width:620px; text-align:center; padding-top:4vh;">${judgeModeBar()}${judgeTabsHtml()}
            <div class="faint" style="font-weight:700;">${esc(st.judgeName || tr(ROLES[ROLE]))}</div>
            <div class="huge" style="margin:14px 0;">${cur ? esc(slotTitle(cur)) : live.phase === 'results' ? tr('All done. Thank you!') : tr('Waiting to start')}</div>
            ${cur && cur.kind === 'break' ? `<div style="font-size:3em;">${clock()}</div>` : ''}
            ${cur && cur.status === 'disqualified' ? `<p class="muted">${tr('This performance is disqualified: no scores needed.')}</p>` : ''}
            ${up ? `<p class="muted">${tr('Next:')} <b>${esc(up.code || '')} ${esc(slotTitle(up))}</b></p>` : ''}</div>`);
        return;
    }
    const filled = crit.filter((c) => typeof d[c] === 'number').length;
    paint(key, `<div class="wrap" style="max-width:680px;">${judgeModeBar()}${judgeTabsHtml()}
        <div class="card" style="margin-bottom:14px; border-color:var(--saffron);">
            <div style="display:flex; justify-content:space-between; align-items:center;"><span class="code">${esc(cur.code || '')}</span><span style="font-size:1.4em;">${clock()}</span></div>
            <div class="huge" style="font-size:clamp(26px,7vw,40px); margin:6px 0 2px;">${esc(slotTitle(cur))}</div>
            <div class="muted">${esc(slotSub(cur))}</div>
        </div>
        ${crit.map((c) => {
            const v = d[c];
            const whole = typeof v === 'number' ? Math.floor(v) : null;
            const isHalf = typeof v === 'number' && v % 1 !== 0;
            return `<div class="card crit"><div class="crit-head"><span class="crit-name">${tr(CRIT_LABEL[c])}</span><span class="crit-val">${typeof v === 'number' ? v : '–'}</span></div>
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
    tab(k) { judgeTab = k; lastRenderKey = ''; render(); },
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
            <div class="muted" style="font-size:1.2em;">${esc(slotSub(cur))}</div>
            ${cur && cur.kind === 'solo' && parentOf(cur) ? `<div style="font-size:1.15em; margin-top:4px;">Parent: <b>${esc(parentOf(cur))}</b></div>` : ''}</div>
        ${up[0] ? `<div class="card" style="margin-top:14px;"><div class="faint" style="font-weight:800; font-size:.85em;">NEXT · CALL THEM NOW</div><div style="font-size:2em; font-weight:900;">${esc(up[0].code || '')} ${esc(slotTitle(up[0]))}</div><div class="muted">${esc(slotSub(up[0]))}</div>${up[0].kind === 'solo' && parentOf(up[0]) ? `<div class="muted">Parent: <b>${esc(parentOf(up[0]))}</b></div>` : ''}</div>` : ''}
        ${up[1] ? `<div class="card" style="margin-top:14px;"><div class="faint" style="font-weight:800; font-size:.85em;">GET READY</div><div style="font-size:1.4em; font-weight:800;">${esc(up[1].code || '')} ${esc(slotTitle(up[1]))}</div></div>` : ''}
    </div>`);
}

// ---------------- PROJECTOR ----------------
// Results are shown one screen at a time, the coach moves on from Control (live.revealed.step):
// 0 = B solo, 1 = B group, 2 = A solo, 3 = A group. Inside a screen 3rd, 2nd, 1st appear by themselves.
function renderProjector() {
    const live = st.live || {};
    const cur = current();
    const title = `<div class="proj-title">${esc(COMP_BRAND)} · ${esc(COMP_NAME)}</div>`;
    if (live.revealed) {
        const sc = revealScreen(live.revealed, live.revealed.step != null ? live.revealed.step : (params.get('cat') === 'A' ? 2 : 0));
        const visible = new Set(sc.positions.slice(0, sc.shown));
        const newest = sc.shown ? sc.positions[sc.shown - 1] : null;
        const rows = sc.rows.filter((t) => visible.has(t.pos)).sort((x, y) => y.pos - x.pos);   // 3rd first, 1st last
        const key = JSON.stringify(['rev', sc.step, sc.shown, live.revealed.at]);
        paint(key, `${title}<div class="proj">
            <div class="proj-code" style="margin-bottom:3vh;">CATEGORY ${sc.cat} · ${sc.solo ? 'SOLO' : 'GROUP'} RESULTS</div>
            <div class="podium">${rows.map((t) => `<div class="pod" style="${t.pos === newest ? '' : 'animation:none; opacity:1; transform:none;'}"><span class="p">${ordinal(t.pos)}</span><span>${esc(t.name)}</span>${sc.solo && t.team ? `<span class="faint" style="margin-left:auto; font-size:.7em;">${esc(t.team)}</span>` : ''}</div>`).join('')}</div>
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
    const key = JSON.stringify([live.door_cash, live.door_free, live.door_students, live.door_coupons, doorCoupon]);
    const total = (live.door_cash || 0) + (live.door_free || 0) + (live.door_students || 0) + (live.door_coupons || 0);
    const cp = doorCoupon;
    const verdict = !cp ? '' : cp.status === 'ok'
        ? `<div style="border:2px solid var(--green); background:var(--green-soft); border-radius:12px; padding:12px; margin-top:10px; text-align:center;">
            <div style="font-size:1.6em; font-weight:900; color:var(--green);">${cp.let_in ? '✓ Let in' : '✓ Valid coupon'}</div>
            <div style="font-weight:800; font-size:1.15em;">${esc(cp.guest)}</div><div class="muted">invited by ${esc(cp.student)}${cp.parent ? ` · parent: <b>${esc(cp.parent)}</b>` : ''}</div>
            ${cp.let_in ? '<div class="muted" style="margin-top:4px;">Give a wristband.</div>' : `<button class="btn go" style="width:100%; margin-top:10px;" onclick="CompDoor.letIn()">Let in + wristband</button>`}</div>`
        : cp.status === 'used'
            ? `<div style="border:2px solid var(--red); background:var(--red-soft); border-radius:12px; padding:12px; margin-top:10px; text-align:center;"><div style="font-size:1.4em; font-weight:900; color:var(--red);">✗ Already used</div><div class="muted">${esc(cp.guest)}${cp.parent ? ' · parent: ' + esc(cp.parent) : ''} · invited by ${esc(cp.student)}</div></div>`
            : `<div style="border:2px solid var(--red); background:var(--red-soft); border-radius:12px; padding:12px; margin-top:10px; text-align:center;"><div style="font-size:1.4em; font-weight:900; color:var(--red);">✗ Code not found</div><div class="muted">Check the letters. Or take €${DOOR_PRICE}.</div></div>`;
    paint(key, `<div class="wrap" style="max-width:560px;">
        <div class="card" style="text-align:center; margin-bottom:14px;"><div class="faint" style="font-weight:800; font-size:.85em;">CASH IN THE BOX</div>
            <div style="font-size:3.4em; font-weight:900; color:var(--gold);">€${(live.door_cash || 0) * DOOR_PRICE}</div>
            <div class="muted">${total} people in · give everyone a wristband</div></div>
        <div class="card" style="margin-bottom:14px;"><div style="font-weight:800; margin-bottom:6px;">Guest with a coupon (free)</div>
            <div style="display:flex; gap:8px;"><input id="couponCode" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="CODE" style="flex:1; min-width:0; text-transform:uppercase; letter-spacing:4px; font-weight:800; font-size:1.3em; text-align:center; padding:12px; border-radius:12px; border:1px solid var(--line); background:var(--bg2); color:var(--ink);" onkeydown="if (event.key === 'Enter') CompDoor.check()">
                <button class="btn primary" onclick="CompDoor.check()">Check</button></div>${verdict}
            <div class="faint" style="font-size:.82em; margin-top:6px;">Coupons let in ${live.door_coupons || 0} so far.</div></div>
        <div class="card" style="margin-bottom:14px;"><div style="font-weight:800; margin-bottom:10px;">Paid €${DOOR_PRICE}</div>
            <div class="counter"><button class="btn" onclick="CompDoor.add('cash', -1)">−1</button><div class="n">${live.door_cash || 0}</div><button class="btn primary" onclick="CompDoor.add('cash', 1)">+1</button></div></div>
        <div class="card" style="margin-bottom:14px;"><div style="font-weight:800; margin-bottom:10px;">Studio students (free)</div>
            <div class="counter"><button class="btn" onclick="CompDoor.add('student', -1)">−1</button><div class="n">${live.door_students || 0}</div><button class="btn go" onclick="CompDoor.add('student', 1)">+1</button></div></div>
        <div class="card"><div style="font-weight:800; margin-bottom:10px;">Under 6 (free)</div>
            <div class="counter"><button class="btn" onclick="CompDoor.add('free', -1)">−1</button><div class="n">${live.door_free || 0}</div><button class="btn go" onclick="CompDoor.add('free', 1)">+1</button></div></div>
        <p class="faint" style="text-align:center; font-size:.85em;">Free: dancers, all studio students, children under 6, guests with a coupon. Everyone else pays €${DOOR_PRICE}.</p>
    </div>`);
}
let doorCoupon = null;   // last coupon answer shown on the Door screen
window.CompDoor = {
    async add(kind, delta) {
        if (delta < 0 && !confirm('Remove one?')) return;
        try { await backend.door(kind, delta); } catch (e) { alert('Not saved: ' + (e.message || e)); }
        lastRenderKey = ''; await refresh();
    },
    async check() {
        const code = (document.getElementById('couponCode').value || '').trim();
        if (!code) return;
        try { doorCoupon = await backend.coupon(code, false); } catch (e) { alert('Cannot check: ' + (e.message || e)); return; }
        doorCode = code; lastRenderKey = ''; render();
        const i = document.getElementById('couponCode'); if (i) i.value = code.toUpperCase();
    },
    async letIn() {
        if (!doorCode) return;
        try { doorCoupon = await backend.coupon(doorCode, true); } catch (e) { alert('Not saved: ' + (e.message || e)); return; }
        lastRenderKey = ''; await refresh();
        setTimeout(() => { doorCoupon = null; doorCode = ''; lastRenderKey = ''; render(); }, 4000);
    }
};
let doorCode = '';

// ---------------------------------------------------------------- start
if (!DEMO && !supa) messageScreen('Cannot connect', 'Check the internet and reload.');
else if (!DEMO && ROLE !== 'control' && !savedPin()) pinGate();
else startPolling();
})();
