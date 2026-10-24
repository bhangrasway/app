// ============================================================================
// Push notifications in admin.html (push_notifications.sql, admin_push.sql,
// Edge Function "send-push"; the phone side is sw.js).
//
//  * Send to students: everyone, a location, a batch, one student, or a
//    hand-picked list ("Choose students…"). Students turn notifications on
//    in member.html.
//  * Admin alerts: the bell in the header turns on notifications on THIS
//    phone/computer for new student requests (passcode reset, check-in,
//    batch change, detail changes, certificates). Sent by database triggers.
//
// Uses the generic modal from tasse.js (taxModal / closeTaxModal2).
// ============================================================================

// Same public key as member.html (the private one is only in Supabase secrets).
const ADMIN_VAPID_PUBLIC_KEY = 'BL0GiDV-_qnD_FSIQDqsXFj7e1udVtXY9Jp_KnJ_P6YIUNurClu3CcYprqQcsWix007UgnTYJ6kI6HIBypM8RuQ';

let pushSubscribedIds = new Set(); // students with at least one phone subscribed
let pushHistory = [];
let pushSetupMissing = false;
let pushPicked = new Set();         // "Choose students…" selection

async function loadPushData() {
    const [subs, msgs] = await Promise.all([
        supabaseClient.from('push_subscriptions').select('student_id'),
        supabaseClient.from('push_messages').select('*').order('created_at', { ascending: false }).limit(8)
    ]);
    pushSetupMissing = !!subs.error;
    pushSubscribedIds = new Set((subs.data || []).map((r) => r.student_id));
    pushHistory = msgs.data || [];
    const { data: st } = await supabaseClient.from('push_auto_settings').select('low_credit_title, low_credit_body').eq('id', 1).maybeSingle();
    lowCreditSaved = { title: (st && st.low_credit_title) || '', body: (st && st.low_credit_body) || '' };
}

// Ready messages for the «Send notification» window: pick one, it fills title,
// message and (optional) link; edit if you like, then send. {nome} = first name.
const GOOGLE_REVIEW_URL = 'https://g.page/r/CVJVpuKR5ThQEAE/review';
const PUSH_TEMPLATES = [
    { label: '⏳ 3 hours left', title: '⏳ 3 ore alla lezione!', body: 'Ciao {nome}! Tra 3 ore si balla 🥁 Scarpe pronte? 👟🔥' },
    { label: '⏰ 1 hour left', title: '⏰ Manca 1 ora!', body: 'Acqua 💧 energia ⚡ sorriso 😄 … ci vediamo tra un\'ora!' },
    { label: '🚀 Starting soon', title: '🚀 Si parte!', body: 'Loading Bhangra… ▓▓▓▓▓▓▓▓░░ 80% 🕺 Arriva in sala, si comincia!' },
    { label: '⭐ Rate us on Google', title: '⭐ Com\'era la lezione?', body: 'Ti è piaciuta? Lasciaci 5 stelle su Google ⭐⭐⭐⭐⭐ Tocca qui, bastano 10 secondi 🙏', url: GOOGLE_REVIEW_URL },
    { label: '🙏 Thanks for today', title: '🙏 Grazie {nome}!', body: 'Che energia oggi! 🔥 Riposa le gambe, alla prossima 💛' },
    { label: '💪 Practice at home', title: '💪 Compito di oggi', body: '10 minuti di Bhangra a casa = 💪 alla prossima lezione. Il divano può aspettare 🛋️😜' },
    { label: '🌧️ Rain? Class is on', title: '🌧️ Piove? Noi balliamo!', body: 'La lezione c\'è, la pioggia non ci ferma ☔🕺 Ci vediamo in sala!' },
    { label: '🎉 Weekend', title: '🎉 Weekend = Bhangra', body: 'Lavoro finito? Ora tocca al dhol 🥁 Ci vediamo questo weekend!' },
    { label: '📸 Photos online', title: '📸 Foto online!', body: 'Le foto dell\'ultima lezione sono pronte 😍 Chiedile nel gruppo WhatsApp!' }
];
function applyPushTemplate(i) {
    const tpl = PUSH_TEMPLATES[Number(i)];
    if (!tpl) return;
    document.getElementById('pushTitle').value = tpl.title;
    document.getElementById('pushBody').value = tpl.body;
    document.getElementById('pushLink').value = tpl.url || '';
}

// Every audience the admin can pick: all, each location, each batch, a hand-picked list, one student.
function pushAudiences() {
    const active = students.filter((s) => isStudentActive(s));
    const list = [{ key: 'all', label: 'All active students', ids: active.map((s) => s.id) }];
    locations.forEach((l) => list.push({ key: `loc-${l.id}`, label: `Location: ${l.name}`, ids: active.filter((s) => s.locationId === l.id).map((s) => s.id) }));
    batchList.filter((b) => b.active !== false).forEach((b) => list.push({
        key: `batch-${b.id}`, label: `Batch: ${b.name} (${getLocationName(b.location_id)})`,
        ids: active.filter((s) => s.batch === b.name && s.locationId === b.location_id).map((s) => s.id)
    }));
    const low = lowCreditStudents();
    list.splice(1, 0, { key: 'lowcredit', label: `Credit €0 or less (${low.length})`, ids: [...pushPicked] });
    list.push({ key: 'pick', label: 'Choose students…', ids: [...pushPicked] });
    [...students].sort((a, b) => String(a.name).localeCompare(String(b.name))).forEach((s) => list.push({ key: `stu-${s.id}`, label: `Student: ${s.name}`, ids: [s.id] }));
    return list;
}
// Active students whose credit is finished or below zero (never the inactive ones).
function lowCreditStudents() {
    return students.filter((s) => isStudentActive(s) && Number(s.v2CreditBalance || 0) <= 0);
}
// Default (gentle) credit message; the admin's own saved one wins (push_auto_settings).
const LOW_CREDIT_TITLE = '💛 A little reminder';
const LOW_CREDIT_BODY = "Hi {nome}! 😊 Just a little reminder to top up your balance in the next classes, whenever you feel comfortable. Thank you! 🙏";
let lowCreditSaved = { title: '', body: '' };
function currentPushAudience() {
    return pushAudiences().find((x) => x.key === document.getElementById('pushTarget').value);
}

async function openPushModal(presetKey) {
    await loadPushData();
    if (pushSetupMissing) { alert('Run push_notifications.sql in Supabase first.'); return; }
    pushPicked = new Set();
    pushPickerMode = null;
    const opts = pushAudiences().map((a) => `<option value="${escapeHtml(a.key)}" ${a.key === presetKey ? 'selected' : ''}>${escapeHtml(a.label)}</option>`).join('');
    const history = pushHistory.length ? pushHistory.map((m) => `
        <div style="padding:6px 0; border-bottom:1px solid var(--border-soft); font-size:0.82em;">
            <b>${escapeHtml(m.title)}</b> · ${escapeHtml(m.target_label || '')} · ${new Date(m.created_at).toLocaleDateString('it-IT')}
            <span style="color:var(--ink-faint);">· reached ${m.sent} phone${m.sent === 1 ? '' : 's'}${m.failed ? `, ${m.failed} failed` : ''}</span>
            <div style="color:var(--ink-soft);">${escapeHtml(m.body)}</div>
        </div>`).join('') : '<div style="font-size:0.82em; color:var(--ink-faint);">Nothing sent yet.</div>';
    taxModal('Send notification',
        `<div class="field"><label>Send to</label><select id="pushTarget" onchange="onPushTargetChange()" style="width:100%;">${opts}</select></div>
        <div id="pushPicker" class="hidden" style="margin:-4px 0 12px;">
            <div style="display:flex; gap:8px; margin-bottom:6px;">
                <input id="pushPickSearch" placeholder="Search name…" oninput="renderPushPicker()" style="flex:1;">
                <label style="display:flex; align-items:center; gap:4px; font-size:0.8em; white-space:nowrap;"><input type="checkbox" id="pushPickOnlyOn" onchange="renderPushPicker()"> only with notifications on</label>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:6px;">
                <button type="button" class="btn btn-outline btn-sm" onclick="setAllPushPicked(true)">Select all</button>
                <button type="button" class="btn btn-outline btn-sm" onclick="setAllPushPicked(false)">Select none</button>
            </div>
            <div id="pushPickList" style="max-height:220px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius-sm); padding:4px 8px;"></div>
        </div>
        <div id="pushReach" style="font-size:0.84em; margin:-4px 0 12px;"></div>
        <div class="field"><label>Template (optional)</label>
            <select id="pushTemplate" onchange="applyPushTemplate(this.value)" style="width:100%;">
                <option value="">— write your own —</option>
                ${PUSH_TEMPLATES.map((tpl, i) => `<option value="${i}">${escapeHtml(tpl.label)}</option>`).join('')}
            </select></div>
        <div class="field"><label>Title</label><input id="pushTitle" maxlength="80" placeholder="e.g. Lezione annullata"></div>
        <div class="field"><label>Message</label><textarea id="pushBody" maxlength="400" rows="3" placeholder="e.g. Oggi la lezione delle 15:30 è annullata. Ci vediamo sabato!"></textarea></div>
        <div class="field"><label>Link (optional: opens when they tap the notification)</label>
            <input id="pushLink" type="url" placeholder="Empty = opens the Bhangra Sway app" style="width:100%;"></div>
        <button type="button" class="btn btn-outline btn-sm hidden" id="pushSaveCreditBtn" style="margin:-4px 0 10px;" onclick="saveLowCreditMessage()">Save as my credit message</button>
        <div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:14px;">Write it in the language your students read: the message is sent exactly as written. <b>{nome}</b> becomes each student's first name.</div>
        <div style="font-weight:700; font-size:0.85em; margin-bottom:4px;">Last messages</div>${history}`,
        `<div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Cancel</button><button class="btn btn-primary" id="pushSendBtn" onclick="sendPush()">Send</button></div>`);
    onPushTargetChange();
}

let pushPickerMode = null; // 'pick' | 'lowcredit'
function onPushTargetChange() {
    const key = document.getElementById('pushTarget').value;
    const picking = key === 'pick' || key === 'lowcredit';
    document.getElementById('pushPicker').classList.toggle('hidden', !picking);
    if (picking && pushPickerMode !== key) {
        pushPickerMode = key;
        // Credit list: everyone ticked; untick who shouldn't get it. Choose: nobody ticked.
        pushPicked = new Set(key === 'lowcredit' ? lowCreditStudents().map((s) => s.id) : []);
        if (key === 'lowcredit') {
            const t = document.getElementById('pushTitle'), b = document.getElementById('pushBody');
            if (!t.value.trim()) t.value = lowCreditSaved.title || LOW_CREDIT_TITLE;
            if (!b.value.trim()) b.value = lowCreditSaved.body || LOW_CREDIT_BODY;
        }
    }
    if (!picking) pushPickerMode = null;
    document.getElementById('pushSaveCreditBtn').classList.toggle('hidden', key !== 'lowcredit');
    if (picking) renderPushPicker();
    updatePushReach();
}
async function saveLowCreditMessage() {
    const title = document.getElementById('pushTitle').value.trim();
    const body = document.getElementById('pushBody').value.trim();
    if (!title || !body) { alert('Write a title and a message first.'); return; }
    const { error } = await supabaseClient.from('push_auto_settings').upsert({ id: 1, low_credit_title: title, low_credit_body: body, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) { alert('Could not save: ' + error.message + (/column/.test(error.message) ? '\n\nRun push_auto.sql again in Supabase.' : '')); return; }
    lowCreditSaved = { title, body };
    alert('Saved. Next time «Credit €0 or less» starts with this message.');
}
function setAllPushPicked(on) {
    renderPushPickerList().forEach((s) => { if (on) pushPicked.add(s.id); else pushPicked.delete(s.id); });
    renderPushPicker();
    updatePushReach();
}
function renderPushPickerList() {
    const q = document.getElementById('pushPickSearch').value.trim().toLowerCase();
    const onlyOn = document.getElementById('pushPickOnlyOn').checked;
    const base = pushPickerMode === 'lowcredit' ? lowCreditStudents() : students.filter((s) => isStudentActive(s));
    return base
        .filter((s) => !q || String(s.name).toLowerCase().includes(q))
        .filter((s) => !onlyOn || pushSubscribedIds.has(s.id))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}
function renderPushPicker() {
    const list = renderPushPickerList();
    document.getElementById('pushPickList').innerHTML = list.length ? list.map((s) => `
        <label style="display:flex; align-items:center; gap:8px; padding:5px 0; font-size:0.86em; cursor:pointer;">
            <input type="checkbox" ${pushPicked.has(s.id) ? 'checked' : ''} onchange="togglePushPick(${s.id}, this.checked)">
            <span style="flex:1;">${escapeHtml(s.name)} <span style="color:var(--ink-faint);">· ${escapeHtml(s.batch || '')} · ${escapeHtml(getLocationName(s.locationId))}</span>${pushPickerMode === 'lowcredit' ? ` <b style="color:var(--danger);">€${Number(s.v2CreditBalance || 0)}</b>` : ''}</span>
            ${pushSubscribedIds.has(s.id) ? '<span class="badge badge-success">on</span>' : '<span class="badge badge-neutral">off</span>'}
        </label>`).join('') : '<div style="font-size:0.82em; color:var(--ink-faint); padding:6px 0;">No students.</div>';
}
function togglePushPick(id, on) {
    if (on) pushPicked.add(id); else pushPicked.delete(id);
    updatePushReach();
}

function updatePushReach() {
    const a = currentPushAudience();
    const on = a.ids.filter((id) => pushSubscribedIds.has(id)).length;
    document.getElementById('pushReach').innerHTML = `${a.ids.length} student${a.ids.length === 1 ? '' : 's'} · <b>${on}</b> with notifications on`
        + (on < a.ids.length ? ' <span style="color:var(--ink-faint);">(the others don\'t receive it: they must turn notifications on in their app)</span>' : '');
}

async function sendPush() {
    const a = currentPushAudience();
    const title = document.getElementById('pushTitle').value.trim();
    const body = document.getElementById('pushBody').value.trim();
    if (!title || !body) { alert('Write a title and a message.'); return; }
    if (!a.ids.length) { alert('Choose at least one student.'); return; }
    if (!a.ids.some((id) => pushSubscribedIds.has(id))) { alert('Nobody in this group has notifications on yet.'); return; }
    const label = a.key === 'pick' ? `${a.ids.length} chosen student${a.ids.length === 1 ? '' : 's'}`
        : a.key === 'lowcredit' ? `Credit €0 or less (${a.ids.length} chosen)` : a.label;
    if (!confirm(`Send "${title}" to ${label}?`)) return;
    const btn = document.getElementById('pushSendBtn');
    btn.disabled = true; btn.textContent = 'Sending…';
    const { data, error } = await supabaseClient.functions.invoke('send-push', {
        body: { title, body, student_ids: a.ids, target_label: label, url: (document.getElementById('pushLink').value || '').trim() || 'member.html' }
    });
    btn.disabled = false; btn.textContent = 'Send';
    if (error || data?.error) { alert('Not sent: ' + await pushErrorText(error, data)); return; }
    alert(`Sent to ${data.sent} phone${data.sent === 1 ? '' : 's'}${data.failed ? ` (${data.failed} failed${data.removed ? `, ${data.removed} removed because the app was uninstalled` : ''})` : ''}.`);
    closeTaxModal2();
}
async function pushErrorText(error, data) {
    let msg = data?.error || error?.message || 'unknown error';
    try { const j = await error?.context?.json?.(); if (j?.error) msg = j.error; } catch {}
    return msg;
}

// ---------- Admin alerts on this device (bell in the header) ----------
function adminPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function adminIsIos() {
    return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function adminIsInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
async function adminSwRegistration() {
    try { return await navigator.serviceWorker.register('sw.js'); } catch { return null; }
}
async function adminCurrentSubscription() {
    if (!adminPushSupported()) return null;
    const reg = await adminSwRegistration();
    return reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
}

async function openAdminPushModal() {
    const supported = adminPushSupported();
    const sub = await adminCurrentSubscription();
    let on = false;
    if (sub && Notification.permission === 'granted') {
        const { data } = await supabaseClient.from('admin_push_subscriptions').select('id').eq('endpoint', sub.endpoint).limit(1);
        on = !!(data && data.length);
    }
    const state = !supported
        ? (adminIsIos() && !adminIsInstalled()
            ? 'On iPhone: first add the admin to the Home Screen (Share → «Aggiungi alla schermata Home»), open it from the icon, log in, then come back here.'
            : "This browser can't receive notifications.")
        : Notification.permission === 'denied' ? 'Notifications are blocked for this site: allow them in the browser/phone settings.'
        : on ? '<b style="color:var(--success);">On</b> for this device.'
        : 'Off for this device.';
    taxModal('Admin notifications on this device',
        `<p style="font-size:0.88em; margin-top:0;">Get a notification on this phone/computer when a student sends a request: <b>passcode reset</b>, <b>manual check-in</b>, <b>batch change</b>, <b>change of personal details</b>, <b>medical certificate</b>.</p>
        <p style="font-size:0.88em;">Status: ${state}</p>
        <p style="font-size:0.8em; color:var(--ink-faint);">Turn it on on each device you want (for example your phone and your laptop).</p>`,
        `<div style="display:flex; gap:8px; margin-left:auto;">
            <button class="btn btn-outline" onclick="closeTaxModal2()">Close</button>
            ${on ? '<button class="btn btn-outline" onclick="sendAdminTestPush()">Send a test</button><button class="btn btn-danger" onclick="disableAdminPush()">Turn off</button>'
                : supported && Notification.permission !== 'denied' ? '<button class="btn btn-primary" onclick="enableAdminPush()">Turn on</button>' : ''}
        </div>`);
}
function adminVapidBytes() {
    const k = ADMIN_VAPID_PUBLIC_KEY;
    const b64 = (k + '='.repeat((4 - k.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
async function enableAdminPush() {
    const permission = await Notification.requestPermission(); // first: iPhone needs it right after the tap
    if (permission !== 'granted') { openAdminPushModal(); return; }
    try {
        const reg = await adminSwRegistration();
        await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription()
            || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: adminVapidBytes() });
        const j = sub.toJSON();
        const { error } = await supabaseClient.from('admin_push_subscriptions').upsert(
            { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 300) },
            { onConflict: 'endpoint' });
        if (error) throw error;
    } catch (e) {
        alert('Could not turn on: ' + (e.message || e) + (String(e.message || '').includes('admin_push_subscriptions') ? '\nRun admin_push.sql in Supabase first.' : ''));
        return;
    }
    openAdminPushModal();
}
async function disableAdminPush() {
    const sub = await adminCurrentSubscription();
    if (sub) {
        await supabaseClient.from('admin_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        try { await sub.unsubscribe(); } catch {}
    }
    openAdminPushModal();
}
async function sendAdminTestPush() {
    const { data, error } = await supabaseClient.functions.invoke('send-push', {
        body: { to: 'admin', title: 'Test', body: 'Admin notifications work on this device.', url: 'admin.html' }
    });
    if (error || data?.error) { alert('Not sent: ' + await pushErrorText(error, data)); return; }
    alert(`Test sent to ${data.sent} admin device${data.sent === 1 ? '' : 's'}.`);
}

// ---------- Automatic notifications (push_auto.sql + send-push 'auto') ----------
// Class reminders the evening before each batch's class, and birthday wishes.
// The same default lists live in supabase/functions/send-push (used when a
// list here is left empty).
const AUTO_DEFAULT_REMINDERS = [
    '🌟 {nome}, sei a un passo dalla tua versione migliore: domani alle {ora} si balla! 💪🥁',
    '👣 One step closer to your best Bhangra! See you tomorrow at {ora} 💫',
    'Ogni lezione è un passo avanti 👣 Domani alle {ora} facciamone un altro insieme! 🔥',
    'Tomorrow {ora}: one more step, one more beat, one more smile 🥁😄',
    '✨ Domani alle {ora} non è solo una lezione: è il tuo momento. Ti aspettiamo, {nome}!',
    '👟 Shoes tied, {nome}? Tomorrow {ora} we dance! 🔥',
    '🥁 Domani alle {ora} si balla! Pronto/a? 💃',
    'Sofa 0 – Bhangra 1 🛋️➡️🕺 Tomorrow {ora}!',
    'Calorie in fuga 🏃‍♀️🔥 Domani alle {ora}, non mancare!',
    '⚠️ Warning: extreme happiness tomorrow at {ora} 😄🥁',
    'Domani {ora}: stress a casa, energia in sala! ⚡',
    'Your legs called 📞 They want Bhangra tomorrow at {ora} 🦵🎶',
    '🎶 Il dhol ti aspetta domani alle {ora} 😎',
    'Tomorrow {ora}: sweat, smile, repeat 💦😄',
    '🚨 Allarme divertimento! Domani alle {ora} a {sede} 💃🕺',
    'One class closer to Bhangra star ⭐ See you tomorrow at {ora}!',
    'Sveglia i piedi 👣 Domani alle {ora} si vola! 🚀'
];
const AUTO_DEFAULT_BIRTHDAYS = [
    '🎂 Happy birthday {nome}! Dance like nobody\'s watching today 🕺🎉',
    '🎉 Buon compleanno {nome}! Oggi balli tu, noi applaudiamo 👏💃',
    '🥳 One year older, more Bhangra moves! Happy birthday {nome} 🎂🥁',
    '🎂 Tanti auguri {nome}! Un anno pieno di energia e sorrisi ✨'
];
const AUTO_DEFAULT_CHECKINS = [
    '🥁 Sei in sala? Tocca qui per il check-in 👆',
    '👋 Arrived, {nome}? Tap here to check in ✅',
    '📍 Ciao {nome}! Tocca per segnare la presenza 💃'
];
const AUTO_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
let autoState = null; // { settings, reminders: Map(batchId -> row), skips: [] }

const autoLines = (txt) => String(txt || '').split('\n').map((x) => x.trim()).filter(Boolean);
const autoText = (list) => (Array.isArray(list) ? list : []).join('\n');
function autoDayBefore(day) {
    const i = AUTO_WEEKDAYS.indexOf(day);
    return i < 0 ? '' : AUTO_WEEKDAYS[(i + 6) % 7];
}

async function openAutoPushModal() {
    const [st, rem, skips] = await Promise.all([
        supabaseClient.from('push_auto_settings').select('*').eq('id', 1).maybeSingle(),
        supabaseClient.from('push_reminders').select('*'),
        supabaseClient.from('push_skip_dates').select('*').order('skip_date', { ascending: true })
    ]);
    if (st.error || rem.error || skips.error) { alert('Run push_auto.sql in Supabase first (and enable the pg_cron extension).'); return; }
    autoState = {
        settings: st.data || {},
        reminders: new Map((rem.data || []).map((r) => [r.batch_id, r])),
        skips: skips.data || []
    };
    renderAutoPushModal();
}

function renderAutoPushModal() {
    const s = autoState.settings;
    const today = formatLocalDate(new Date());
    const batches = batchList.filter((b) => b.active !== false)
        .sort((a, b) => String(getLocationName(a.location_id)).localeCompare(String(getLocationName(b.location_id))) || (a.sort_order || 0) - (b.sort_order || 0));
    const batchRows = batches.map((b) => {
        const r = autoState.reminders.get(b.id) || {};
        const on = r.enabled !== false;
        const own = Array.isArray(r.messages) && r.messages.length;
        return `
        <div style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:9px 11px; margin-bottom:8px; font-size:0.86em;">
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <label style="display:flex; align-items:center; gap:7px; font-weight:700; cursor:pointer; flex:1; min-width:180px;">
                    <input type="checkbox" id="arOn_${b.id}" ${on ? 'checked' : ''} style="width:16px; height:16px; margin:0;">
                    ${escapeHtml(b.name)} <span style="font-weight:400; color:var(--ink-faint);">· ${escapeHtml(getLocationName(b.location_id))} · ${escapeHtml(b.day)} ${escapeHtml(b.start_time)}</span>
                </label>
                <span style="color:var(--ink-soft);">sent ${escapeHtml(autoDayBefore(b.day))} at</span>
                <input type="time" id="arTime_${b.id}" value="${escapeHtml(String(r.send_time || '19:00').slice(0, 5))}" style="padding:4px 6px; border-radius:var(--radius-sm); border:1px solid var(--border);">
                <button type="button" class="btn btn-outline btn-sm" onclick="sendAutoSample('reminder', ${b.id})">Send me a sample</button>
            </div>
            <details style="margin-top:6px;" ${own ? 'open' : ''}>
                <summary style="cursor:pointer; color:var(--ink-soft);">Own messages for this batch ${own ? `(${r.messages.length})` : '(none: uses the general list)'}</summary>
                <textarea id="arMsg_${b.id}" rows="3" placeholder="One message per line. Empty = the general list below." style="width:100%; margin-top:6px; font-size:0.95em;">${escapeHtml(autoText(r.messages))}</textarea>
            </details>
        </div>`;
    }).join('') || '<div style="font-size:0.85em; color:var(--ink-faint);">No active batches.</div>';
    const upcomingSkips = autoState.skips.filter((x) => String(x.skip_date) >= today);
    const skipRows = upcomingSkips.length ? upcomingSkips.map((x) => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 0; border-bottom:1px solid var(--border-soft); font-size:0.85em;">
            <span><b>${formatShortDate(x.skip_date)}</b> · ${x.location_id ? escapeHtml(getLocationName(x.location_id)) : 'all locations'}${x.note ? ' · ' + escapeHtml(x.note) : ''}</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="removeAutoSkip(${x.id})">Remove</button>
        </div>`).join('') : '<div style="font-size:0.82em; color:var(--ink-faint);">No days off planned.</div>';
    const defaults = Array.isArray(s.default_messages) && s.default_messages.length ? s.default_messages : AUTO_DEFAULT_REMINDERS;
    const bdays = Array.isArray(s.birthday_messages) && s.birthday_messages.length ? s.birthday_messages : AUTO_DEFAULT_BIRTHDAYS;
    taxModal('Auto notifications',
        `<p style="font-size:0.84em; color:var(--ink-soft); margin-top:0;">Sent by themselves to the students who turned notifications on. Every time a different message is picked from the list. In a message you can use <b>{nome}</b> (first name), <b>{ora}</b> (class time), <b>{batch}</b>, <b>{sede}</b>.</p>

        <div class="section-label">Class reminders (the evening before)</div>
        <label style="display:flex; align-items:center; gap:8px; font-weight:700; font-size:0.9em; margin-bottom:10px; cursor:pointer;">
            <input type="checkbox" id="arMaster" ${s.reminders_enabled ? 'checked' : ''} style="width:18px; height:18px; margin:0;"> Send class reminders
        </label>
        ${batchRows}
        <div class="field" style="margin-top:6px;"><label>General messages (one per line)</label>
            <textarea id="arDefaults" rows="7" style="width:100%; font-size:0.86em;">${escapeHtml(autoText(defaults))}</textarea></div>

        <div class="section-label">Check-in at class time</div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px; font-size:0.9em;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer;">
                <input type="checkbox" id="acOn" ${s.checkin_enabled ? 'checked' : ''} style="width:18px; height:18px; margin:0;"> Send «tap to check in»
            </label>
            <input type="number" id="acOffset" min="0" max="90" step="5" value="${Number(s.checkin_offset_min || 0)}" style="width:70px; padding:4px 6px; border-radius:var(--radius-sm); border:1px solid var(--border);">
            <span style="color:var(--ink-soft);">minutes after the class starts</span>
            <button type="button" class="btn btn-outline btn-sm" onclick="sendAutoSample('checkin')">Send me a sample</button>
        </div>
        <div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:6px;">Only to the batch's students not checked in yet. Their tap opens the app, which checks the location and marks them present by itself.</div>
        <textarea id="acMsgs" rows="3" style="width:100%; font-size:0.86em;">${escapeHtml(autoText(Array.isArray(s.checkin_messages) && s.checkin_messages.length ? s.checkin_messages : AUTO_DEFAULT_CHECKINS))}</textarea>

        <div class="section-label">Days off (no reminder for classes on that day)</div>
        ${skipRows}
        <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-top:8px;">
            <input type="date" id="arSkipDate" style="padding:5px 7px; border-radius:var(--radius-sm); border:1px solid var(--border);">
            <select id="arSkipLoc" style="padding:5px 7px; border-radius:var(--radius-sm); border:1px solid var(--border);"><option value="">All locations</option>${locations.map((l) => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')}</select>
            <input id="arSkipNote" placeholder="Note (e.g. Natale)" style="flex:1; min-width:120px; padding:5px 7px; border-radius:var(--radius-sm); border:1px solid var(--border);">
            <button type="button" class="btn btn-outline btn-sm" onclick="addAutoSkip()">Add day off</button>
        </div>

        <div class="section-label">Birthday wishes</div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px; font-size:0.9em;">
            <label style="display:flex; align-items:center; gap:8px; font-weight:700; cursor:pointer;">
                <input type="checkbox" id="abOn" ${s.birthday_enabled ? 'checked' : ''} style="width:18px; height:18px; margin:0;"> Send on the birthday at
            </label>
            <input type="time" id="abTime" value="${escapeHtml(String(s.birthday_time || '09:00').slice(0, 5))}" style="padding:4px 6px; border-radius:var(--radius-sm); border:1px solid var(--border);">
            <button type="button" class="btn btn-outline btn-sm" onclick="sendAutoSample('birthday')">Send me a sample</button>
        </div>
        <div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:6px;">The birthday comes from the codice fiscale: students without one don't get it.</div>
        <textarea id="abMsgs" rows="3" style="width:100%; font-size:0.86em;">${escapeHtml(autoText(bdays))}</textarea>
        <div style="font-size:0.8em; color:var(--ink-faint); margin-top:10px;">«Send me a sample» sends one example to your own devices (turn them on with the bell in the header first). Save first if you changed the messages.</div>`,
        `<div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Close</button><button class="btn btn-primary" id="autoSaveBtn" onclick="saveAutoPush()">Save</button></div>`);
}

async function saveAutoPush() {
    const btn = document.getElementById('autoSaveBtn');
    btn.disabled = true;
    const sameAsDefault = (list, def) => list.length === def.length && list.every((x, i) => x === def[i]);
    const defaults = autoLines(document.getElementById('arDefaults').value);
    const bdays = autoLines(document.getElementById('abMsgs').value);
    const checkins = autoLines(document.getElementById('acMsgs').value);
    const settings = {
        id: 1,
        reminders_enabled: document.getElementById('arMaster').checked,
        default_messages: sameAsDefault(defaults, AUTO_DEFAULT_REMINDERS) ? [] : defaults,
        birthday_enabled: document.getElementById('abOn').checked,
        birthday_time: document.getElementById('abTime').value || '09:00',
        birthday_messages: sameAsDefault(bdays, AUTO_DEFAULT_BIRTHDAYS) ? [] : bdays,
        checkin_enabled: document.getElementById('acOn').checked,
        checkin_offset_min: Math.max(0, Math.min(90, Number(document.getElementById('acOffset').value) || 0)),
        checkin_messages: sameAsDefault(checkins, AUTO_DEFAULT_CHECKINS) ? [] : checkins,
        updated_at: new Date().toISOString()
    };
    const rows = batchList.filter((b) => b.active !== false && document.getElementById(`arOn_${b.id}`)).map((b) => ({
        batch_id: b.id,
        enabled: document.getElementById(`arOn_${b.id}`).checked,
        send_time: document.getElementById(`arTime_${b.id}`).value || '19:00',
        messages: autoLines(document.getElementById(`arMsg_${b.id}`).value),
        updated_at: new Date().toISOString()
    }));
    const [a, r] = await Promise.all([
        supabaseClient.from('push_auto_settings').upsert(settings, { onConflict: 'id' }),
        rows.length ? supabaseClient.from('push_reminders').upsert(rows, { onConflict: 'batch_id' }) : Promise.resolve({})
    ]);
    btn.disabled = false;
    if (a.error || r.error) { alert('Could not save: ' + (a.error || r.error).message + (/column/.test((a.error || r.error).message) ? '\n\nRun push_auto.sql again in Supabase.' : '')); return; }
    autoState.settings = settings;
    rows.forEach((x) => autoState.reminders.set(x.batch_id, x));
    alert('Saved.' + (settings.reminders_enabled || settings.birthday_enabled || settings.checkin_enabled ? '' : '\n\nAuto notifications are OFF: tick «Send class reminders» and/or «Send on the birthday» to start them.'));
}

async function addAutoSkip() {
    const date = document.getElementById('arSkipDate').value;
    if (!date) { alert('Choose the date.'); return; }
    const loc = Number(document.getElementById('arSkipLoc').value) || null;
    const note = document.getElementById('arSkipNote').value.trim() || null;
    const { data, error } = await supabaseClient.from('push_skip_dates').insert({ skip_date: date, location_id: loc, note }).select().single();
    if (error) { alert('Could not save: ' + error.message); return; }
    autoState.skips.push(data);
    autoState.skips.sort((x, y) => String(x.skip_date).localeCompare(String(y.skip_date)));
    renderAutoPushModal();
}
async function removeAutoSkip(id) {
    const { error } = await supabaseClient.from('push_skip_dates').delete().eq('id', id);
    if (error) { alert('Could not remove: ' + error.message); return; }
    autoState.skips = autoState.skips.filter((x) => x.id !== id);
    renderAutoPushModal();
}
async function sendAutoSample(kind, batchId) {
    const { data, error } = await supabaseClient.functions.invoke('send-push', { body: { to: 'auto-preview', kind, batch_id: batchId || null } });
    if (error || data?.error) { alert('Not sent: ' + await pushErrorText(error, data)); return; }
    alert(`Sample sent to ${data.sent} device${data.sent === 1 ? '' : 's'}:\n\n${data.body}`);
}
