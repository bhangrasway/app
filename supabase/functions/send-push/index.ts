// Supabase Edge Function "send-push": the admin sends a notification to students' phones.
//
// Two uses:
//  1. To students, from admin.html (logged-in admin only):
//       { title, body, url?, student_ids: number[], target_label }
//     Looks up the phones those students turned notifications on for
//     (push_subscriptions, push_notifications.sql), sends each phone one copy,
//     removes phones that no longer exist (404/410), and logs push_messages.
//  2. To the admin's own devices (admin_push_subscriptions, admin_push.sql):
//       { to: 'admin', title, body, url? }
//     from the database triggers on new student requests (header
//     x-push-secret = PUSH_TRIGGER_SECRET) or the admin's "Send a test".
//
// Secrets (Dashboard -> Edge Functions -> Secrets): VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_TRIGGER_SECRET. SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    // Allowed: a logged-in admin (sign-ups are off, so every user is the admin),
    // or the database trigger carrying the shared secret (admin alerts only).
    const triggerSecret = Deno.env.get('PUSH_TRIGGER_SECRET');
    const fromTrigger = !!triggerSecret && req.headers.get('x-push-secret') === triggerSecret;
    let isAdmin = false;
    if (!fromTrigger) {
        const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
        });
        const { data: userData } = await asCaller.auth.getUser();
        isAdmin = !!userData?.user;
    }
    if (!fromTrigger && !isAdmin) return json({ error: 'Not logged in' }, 401);

    const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) return json({ error: 'VAPID secrets are missing in Supabase' }, 500);
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'https://bhangrasway.com', publicKey, privateKey);

    let input: { to?: string; title?: string; body?: string; url?: string; student_ids?: number[]; target_label?: string; kind?: string; batch_id?: number };
    try { input = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // ----- 3. Automatic notifications (pg_cron every 15 min, push_auto.sql) -----
    if (input.to === 'auto') return json(await runAuto(admin));
    // Admin's «Send me a sample»: one filled-in example to the admin's own devices.
    if (input.to === 'auto-preview') {
        if (!isAdmin) return json({ error: 'Not allowed' }, 403);
        return json(await autoPreview(admin, input.kind === 'birthday' ? 'birthday' : input.kind === 'checkin' ? 'checkin' : 'reminder', Number(input.batch_id) || null));
    }

    const title = String(input.title ?? '').trim().slice(0, 80);
    const body = String(input.body ?? '').trim().slice(0, 400);
    const ids = Array.isArray(input.student_ids) ? input.student_ids.map(Number).filter(Number.isFinite) : [];
    if (!title || !body) return json({ error: 'Title and message are required' }, 400);

    const deliver = async (list: { endpoint: string; p256dh: string; auth: string }[], url: string) => {
        const payload = JSON.stringify({ title, body, url, tag: `bs-${Date.now()}` });
        let sent = 0, failed = 0;
        const gone: string[] = [];
        await Promise.all(list.map(async (s) => {
            try {
                await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
                sent++;
            } catch (e) {
                failed++;
                const code = (e as { statusCode?: number }).statusCode;
                if (code === 404 || code === 410) gone.push(s.endpoint); // unsubscribed / app removed
            }
        }));
        return { sent, failed, gone };
    };

    // ----- 2. Admin alerts -----
    if (input.to === 'admin') {
        const { data: subs, error } = await admin.from('admin_push_subscriptions').select('endpoint, p256dh, auth');
        if (error) return json({ error: error.message }, 500);
        const r = await deliver(subs ?? [], input.url || 'admin.html');
        if (r.gone.length) await admin.from('admin_push_subscriptions').delete().in('endpoint', r.gone);
        return json({ devices: (subs ?? []).length, sent: r.sent, failed: r.failed, removed: r.gone.length });
    }

    // ----- 1. To students (admin only, never from the trigger) -----
    if (!isAdmin) return json({ error: 'Not allowed' }, 403);
    if (!ids.length) return json({ error: 'No students selected' }, 400);
    const { data: subs, error } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth, student_id')
        .in('student_id', ids);
    if (error) return json({ error: error.message }, 500);

    // One copy per phone, even if it is subscribed for several children.
    const byEndpoint = new Map<string, { endpoint: string; p256dh: string; auth: string; student_id: number }>();
    (subs ?? []).forEach((s) => byEndpoint.set(s.endpoint, s));

    let sent = 0, failed = 0, gone: string[] = [];
    if (/\{nome\}/.test(title + body)) {
        // {nome} = each student's first name: one personal message per phone.
        const { data: names } = await admin.from('students').select('*').in('id', ids);
        const nameOf = new Map((names ?? []).map((s: Record<string, unknown>) => [Number(s.id), firstName(s)]));
        for (const s of byEndpoint.values()) {
            const n = nameOf.get(Number(s.student_id)) || '';
            const ok = await sendTo(admin, [s], fill(title, { nome: n }).replace(/\s+([!,.])/g, '$1'), fill(body, { nome: n }).replace(/\s+([!,.])/g, '$1'), 'push_subscriptions');
            if (ok) sent++; else failed++;
        }
    } else {
        ({ sent, failed, gone } = await deliver([...byEndpoint.values()], input.url || 'member.html'));
        if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
    }

    await admin.from('push_messages').insert({
        title, body, target_label: String(input.target_label ?? '').slice(0, 120),
        student_count: ids.length, device_count: byEndpoint.size, sent, failed
    });
    return json({ devices: byEndpoint.size, sent, failed, removed: gone.length });
});

// ============================================================================
// Automatic notifications: class reminders (evening before) and birthdays.
// Settings: push_auto_settings, push_reminders, push_skip_dates (push_auto.sql),
// edited in admin.html → Students → «Auto notifications». push_auto_log
// makes every reminder/birthday go out once.
// ============================================================================
type Sub = { endpoint: string; p256dh: string; auth: string; student_id?: number };
// deno-lint-ignore no-explicit-any
type Db = any;

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_REMINDERS = [
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
const DEFAULT_CHECKINS = [
    '🥁 Sei in sala? Tocca qui per il check-in 👆',
    '👋 Arrived, {nome}? Tap here to check in ✅',
    '📍 Ciao {nome}! Tocca per segnare la presenza 💃'
];
const DEFAULT_BIRTHDAYS = [
    '🎂 Happy birthday {nome}! Dance like nobody\'s watching today 🕺🎉',
    '🎉 Buon compleanno {nome}! Oggi balli tu, noi applaudiamo 👏💃',
    '🥳 One year older, more Bhangra moves! Happy birthday {nome} 🎂🥁',
    '🎂 Tanti auguri {nome}! Un anno pieno di energia e sorrisi ✨'
];

function romeNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function addDays(iso: string, n: number) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
const weekdayOf = (iso: string) => WEEKDAYS[new Date(iso + 'T12:00:00Z').getUTCDay()];
// "1:30 PM" -> "13:30" (batches.start_time format); "16:00" stays.
function to24(t: string) {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/);
    if (!m) return String(t || '');
    let h = Number(m[1]);
    if (m[3]) { const pm = /p/i.test(m[3]); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    return `${String(h).padStart(2, '0')}:${m[2]}`;
}
const hhmm = (t: string) => String(t || '').slice(0, 5);
// Birth "MM-DD" from a codice fiscale (omocodia-safe), or null.
function birthMonthDay(cfRaw: string) {
    const cf = String(cfRaw || '').toUpperCase().replace(/\s/g, '');
    if (cf.length !== 16) return null;
    const omo: Record<string, string> = { L: '0', M: '1', N: '2', P: '3', Q: '4', R: '5', S: '6', T: '7', U: '8', V: '9' };
    const dig = (c: string) => (/\d/.test(c) ? c : omo[c] ?? '');
    const month = 'ABCDEHLMPRST'.indexOf(cf[8]) + 1;
    let day = Number(dig(cf[9]) + dig(cf[10]));
    if (day > 40) day -= 40;
    if (!month || !(day >= 1 && day <= 31)) return null;
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
const firstName = (s: Record<string, unknown>) =>
    String(s.nome || String(s.name || '').trim().split(/\s+/)[0] || '').trim();
function fill(tpl: string, v: Record<string, string>) {
    return tpl.replace(/\{(nome|batch|ora|sede)\}/g, (_m: string, k: string) => v[k] ?? '');
}
function pick(list: unknown, fallback: string[]) {
    const arr = (Array.isArray(list) ? list : []).map((x) => String(x || '').trim()).filter(Boolean);
    const use = arr.length ? arr : fallback;
    return use[Math.floor(Math.random() * use.length)];
}
async function sendTo(db: Db, subs: Sub[], title: string, body: string, table: string, url?: string) {
    let sent = 0;
    const gone: string[] = [];
    const payload = JSON.stringify({ title, body, url: url || (table === 'admin_push_subscriptions' ? 'admin.html' : 'member.html'), tag: `bs-${Date.now()}-${Math.random()}` });
    await Promise.all(subs.map(async (s) => {
        try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 43200 }); sent++; }
        catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) gone.push(s.endpoint); }
    }));
    if (gone.length) await db.from(table).delete().in('endpoint', gone);
    return sent;
}
// Active like admin.html's isStudentActive: manual switch first, otherwise
// attended (or joined) in the last 3 months.
async function activeStudentIds(db: Db, students: Record<string, unknown>[]) {
    const since = addDays(romeNow().date, -92);
    const recent = new Set<number>();
    for (const [dateCol, idCol] of [['attendance_date', 'student_id'], ['attendanceDate', 'studentId']]) {
        const { data, error } = await db.from('attendance').select('*').gte(dateCol, since);
        if (error) continue;
        (data ?? []).forEach((r: Record<string, unknown>) => {
            const present = r.is_present ?? r.isPresent ?? r.ispresent ?? true;
            if (present) recent.add(Number(r[idCol] ?? r.student_id ?? r.studentId));
        });
        break;
    }
    return new Set(students.filter((s) => {
        const ov = s.active_override;
        if (ov === true || ov === false) return ov;
        const join = String(s.join_date ?? s.joinDate ?? s.joindate ?? '').slice(0, 10);
        return recent.has(Number(s.id)) || !join || join >= since;
    }).map((s) => Number(s.id)));
}

async function runAuto(db: Db) {
    const now = romeNow();
    const { data: st } = await db.from('push_auto_settings').select('*').eq('id', 1).maybeSingle();
    if (!st) return { ok: true, note: 'push_auto.sql not run' };
    const out: Record<string, number> = { reminders: 0, birthdays: 0, checkins: 0, sent: 0 };
    if (!st.reminders_enabled && !st.birthday_enabled && !st.checkin_enabled) return { ok: true, ...out, checkins: 0 };
    const { data: studentRows } = await db.from('students').select('*');
    const students = (studentRows ?? []) as Record<string, unknown>[];
    const { data: subRows } = await db.from('push_subscriptions').select('endpoint, p256dh, auth, student_id');
    const subsOf = new Map<number, Sub[]>();
    (subRows ?? []).forEach((s: Sub) => { const k = Number(s.student_id); if (!subsOf.has(k)) subsOf.set(k, []); subsOf.get(k)!.push(s); });
    if (!subsOf.size) return { ok: true, ...out };
    const active = await activeStudentIds(db, students);
    const already = async (kind: string, ref: string, forDate: string) => {
        const { data } = await db.from('push_auto_log').select('kind').eq('kind', kind).eq('ref', ref).eq('for_date', forDate).limit(1);
        return !!(data && data.length);
    };

    // ----- class reminders: tomorrow's batches, from their send time -----
    if (st.reminders_enabled) {
        const tomorrow = addDays(now.date, 1);
        const [{ data: batches }, { data: rems }, { data: skips }, { data: locs }] = await Promise.all([
            db.from('batches').select('*'), db.from('push_reminders').select('*'),
            db.from('push_skip_dates').select('*').eq('skip_date', tomorrow), db.from('locations').select('id, name')
        ]);
        const remOf = new Map((rems ?? []).map((r: Record<string, unknown>) => [Number(r.batch_id), r]));
        const locName = new Map((locs ?? []).map((l: Record<string, unknown>) => [Number(l.id), String(l.name)]));
        for (const b of (batches ?? []) as Record<string, unknown>[]) {
            if (b.active === false || b.day !== weekdayOf(tomorrow)) continue;
            const r = (remOf.get(Number(b.id)) ?? {}) as Record<string, unknown>;
            if (r.enabled === false) continue;
            if (now.time < hhmm(String(r.send_time || '19:00'))) continue;
            if ((skips ?? []).some((x: Record<string, unknown>) => x.location_id == null || Number(x.location_id) === Number(b.location_id))) continue;
            if (await already('reminder', String(b.id), tomorrow)) continue;
            const roster = students.filter((s) => s.batch === b.name && Number(s.location_id ?? s.locationId) === Number(b.location_id) && active.has(Number(s.id)));
            let sent = 0;
            const seen = new Set<string>();
            for (const s of roster) {
                const subs = (subsOf.get(Number(s.id)) ?? []).filter((x) => !seen.has(x.endpoint));
                subs.forEach((x) => seen.add(x.endpoint));
                if (!subs.length) continue;
                const body = fill(pick(r.messages, Array.isArray(st.default_messages) && st.default_messages.length ? st.default_messages : DEFAULT_REMINDERS),
                    { nome: firstName(s), batch: String(b.name), ora: to24(String(b.start_time)), sede: locName.get(Number(b.location_id)) || '' });
                sent += await sendTo(db, subs, '🥁 Bhangra Sway', body, 'push_subscriptions');
            }
            await db.from('push_auto_log').insert({ kind: 'reminder', ref: String(b.id), for_date: tomorrow, sent });
            await db.from('push_messages').insert({ title: '🥁 Auto reminder', body: `Class of ${tomorrow}`, target_label: `Auto · Batch: ${b.name}`, student_count: roster.length, device_count: seen.size, sent, failed: seen.size - sent });
            out.reminders++; out.sent += sent;
        }
    }

    // ----- «Sei in sala? Tocca qui»: today's batches, from class start (+ offset),
    // for 2 hours, to students not checked in yet. The tap opens the app, which
    // checks the location and marks the attendance by itself. -----
    if (st.checkin_enabled) {
        const [{ data: batches }] = await Promise.all([db.from('batches').select('*')]);
        const toMin = (hm: string) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
        let presentToday: Set<number> | null = null;
        for (const b of (batches ?? []) as Record<string, unknown>[]) {
            if (b.active === false || b.day !== weekdayOf(now.date)) continue;
            const start = toMin(to24(String(b.start_time))) + Number(st.checkin_offset_min || 0);
            const nowMin = toMin(now.time);
            if (nowMin < start || nowMin > start + 120) continue;
            if (await already('checkin', String(b.id), now.date)) continue;
            if (!presentToday) {
                presentToday = new Set<number>();
                for (const [dateCol, idCol] of [['attendance_date', 'student_id'], ['attendanceDate', 'studentId']]) {
                    const { data, error } = await db.from('attendance').select('*').eq(dateCol, now.date);
                    if (error) continue;
                    (data ?? []).forEach((r: Record<string, unknown>) => presentToday!.add(Number(r[idCol] ?? r.student_id ?? r.studentId)));
                    break;
                }
            }
            const roster = students.filter((s) => s.batch === b.name && Number(s.location_id ?? s.locationId) === Number(b.location_id)
                && active.has(Number(s.id)) && !presentToday!.has(Number(s.id)));
            let sent = 0;
            const seen = new Set<string>();
            for (const s of roster) {
                const subs = (subsOf.get(Number(s.id)) ?? []).filter((x) => !seen.has(x.endpoint));
                subs.forEach((x) => seen.add(x.endpoint));
                if (!subs.length) continue;
                const body = fill(pick(st.checkin_messages, DEFAULT_CHECKINS), { nome: firstName(s), batch: String(b.name), ora: to24(String(b.start_time)), sede: '' });
                sent += await sendTo(db, subs, '📍 Check-in', body, 'push_subscriptions', `member.html?checkin=1&sid=${s.id}`);
            }
            await db.from('push_auto_log').insert({ kind: 'checkin', ref: String(b.id), for_date: now.date, sent });
            out.checkins = (out.checkins || 0) + 1; out.sent += sent;
        }
    }

    // ----- birthdays: today, from the birthday time -----
    if (st.birthday_enabled && now.time >= hhmm(String(st.birthday_time || '09:00'))) {
        const md = now.date.slice(5);
        for (const s of students) {
            if (!active.has(Number(s.id)) || !subsOf.has(Number(s.id))) continue;
            if (birthMonthDay(String(s.codiceFiscale ?? s.codice_fiscale ?? s.codicefiscale ?? '')) !== md) continue;
            if (await already('birthday', String(s.id), now.date)) continue;
            const body = fill(pick(st.birthday_messages, DEFAULT_BIRTHDAYS), { nome: firstName(s), batch: String(s.batch || ''), ora: '', sede: '' });
            const sent = await sendTo(db, subsOf.get(Number(s.id))!, '🎂 Bhangra Sway', body, 'push_subscriptions');
            await db.from('push_auto_log').insert({ kind: 'birthday', ref: String(s.id), for_date: now.date, sent });
            out.birthdays++; out.sent += sent;
        }
    }
    return { ok: true, ...out };
}

// A filled-in sample to the admin's own devices (nothing is logged).
async function autoPreview(db: Db, kind: 'reminder' | 'birthday' | 'checkin', batchId: number | null) {
    const { data: st } = await db.from('push_auto_settings').select('*').eq('id', 1).maybeSingle();
    const { data: adminSubs } = await db.from('admin_push_subscriptions').select('endpoint, p256dh, auth');
    if (!adminSubs?.length) return { error: 'Turn on admin notifications first (the bell in the header).' };
    let body: string;
    if (kind === 'birthday') {
        body = fill(pick(st?.birthday_messages, DEFAULT_BIRTHDAYS), { nome: 'Simran', batch: '', ora: '', sede: '' });
    } else if (kind === 'checkin') {
        body = fill(pick(st?.checkin_messages, DEFAULT_CHECKINS), { nome: 'Simran', batch: '', ora: '', sede: '' });
    } else {
        const { data: b } = batchId ? await db.from('batches').select('*').eq('id', batchId).maybeSingle() : { data: null };
        const { data: r } = batchId ? await db.from('push_reminders').select('*').eq('batch_id', batchId).maybeSingle() : { data: null };
        const { data: l } = b ? await db.from('locations').select('name').eq('id', b.location_id).maybeSingle() : { data: null };
        body = fill(pick(r?.messages, Array.isArray(st?.default_messages) && st.default_messages.length ? st.default_messages : DEFAULT_REMINDERS),
            { nome: 'Simran', batch: b?.name || 'Avanzato', ora: b ? to24(b.start_time) : '13:30', sede: l?.name || 'Cremona' });
    }
    const sent = await sendTo(db, adminSubs, kind === 'birthday' ? '🎂 Bhangra Sway' : kind === 'checkin' ? '📍 Check-in' : '🥁 Bhangra Sway', body, 'admin_push_subscriptions');
    return { sent, body };
}
