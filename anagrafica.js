// ============================================================================
// anagrafica.js — shared by admin.html and member.html.
//
// Everything needed to keep a student's anagrafica correct enough for a
// fattura elettronica not to be "scartata":
//   - codice fiscale: format + check character (incl. omocodia), birth date,
//     and whether it matches the nome/cognome typed (catches swapped or
//     misspelled names — the single biggest source of confusion here);
//   - nome/cognome split suggestion for old single-field names, using the CF;
//   - comune picker over the official comuni list (data/comuni.json), so the
//     provincia is always the real 2-letter sigla and the CAP is one that
//     actually belongs to that comune — never free text like "bg" or "cr".
// Plain functions on window.Anagrafica, no dependencies.
// ============================================================================
(function () {
    'use strict';

    // ---------- text helpers ----------
    function stripAccents(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    }
    function lettersOnly(s) {
        return stripAccents(s).toUpperCase().replace(/[^A-Z]/g, '');
    }
    // "mARIA  grazia" -> "Maria Grazia" (keeps apostrophes/hyphens: D'Angelo, Rossi-Bianchi)
    function titleCase(s) {
        return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
            .replace(/(^|[\s'\-])([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
    }
    function normalizeCf(cf) {
        return String(cf || '').toUpperCase().replace(/\s+/g, '');
    }

    // ---------- codice fiscale ----------
    const ODD = {
        0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
        A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
        N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23
    };
    const MONTHS = 'ABCDEHLMPRST';
    const OMOCODIA = 'LMNPQRSTUV'; // replaces digits 0-9 in omocodic codes
    const CF_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

    function cfCheckChar(first15) {
        let sum = 0;
        for (let i = 0; i < 15; i += 1) {
            const ch = first15[i];
            if (i % 2 === 0) sum += ODD[ch];
            else sum += /[0-9]/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 65;
        }
        return String.fromCharCode(65 + (sum % 26));
    }
    function deOmocodia(ch) {
        const i = OMOCODIA.indexOf(ch);
        return i >= 0 ? String(i) : ch;
    }

    // Messages: Italian by default (member portal); admin.html sets
    // window.ANAGRAFICA_LANG = 'en' before loading this file.
    const EN = (typeof window !== 'undefined' && window.ANAGRAFICA_LANG === 'en');
    const msg = (it, en) => (EN ? en : it);

    // { valid, reason, birthDate: 'YYYY-MM-DD', sex: 'M'|'F' }
    function validateCodiceFiscale(cfRaw, refDate) {
        const cf = normalizeCf(cfRaw);
        if (!cf) return { valid: false, reason: msg('mancante', 'missing') };
        if (cf.length !== 16) return { valid: false, reason: msg('deve avere 16 caratteri', 'must have 16 characters') };
        if (!CF_RE.test(cf)) return { valid: false, reason: msg('formato non valido', 'wrong format') };
        if (cfCheckChar(cf.slice(0, 15)) !== cf[15]) return { valid: false, reason: msg('carattere di controllo errato (probabile errore di battitura)', 'wrong check letter (probably a typo)') };
        const yy = Number(deOmocodia(cf[6]) + deOmocodia(cf[7]));
        const month = MONTHS.indexOf(cf[8]) + 1;
        let day = Number(deOmocodia(cf[9]) + deOmocodia(cf[10]));
        const sex = day > 40 ? 'F' : 'M';
        if (day > 40) day -= 40;
        if (day < 1 || day > 31) return { valid: false, reason: msg('giorno di nascita non valido', 'invalid birth day') };
        const ref = refDate ? new Date(refDate) : new Date();
        const currentYY = ref.getFullYear() % 100;
        const year = yy > currentYY ? 1900 + yy : 2000 + yy;
        const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { valid: true, reason: '', birthDate, sex };
    }

    // The 3-letter codes a CF derives from cognome / nome.
    function cognomeCode(cognome) {
        const l = lettersOnly(cognome);
        const cons = l.replace(/[AEIOU]/g, '');
        const vow = l.replace(/[^AEIOU]/g, '');
        return (cons + vow + 'XXX').slice(0, 3);
    }
    function nomeCode(nome) {
        const l = lettersOnly(nome);
        const cons = l.replace(/[AEIOU]/g, '');
        if (cons.length >= 4) return cons[0] + cons[2] + cons[3];
        const vow = l.replace(/[^AEIOU]/g, '');
        return (cons + vow + 'XXX').slice(0, 3);
    }
    // true / false, or null when it can't be judged (missing pieces).
    function cfMatchesName(cfRaw, nome, cognome) {
        const cf = normalizeCf(cfRaw);
        if (cf.length !== 16 || !lettersOnly(nome) || !lettersOnly(cognome)) return null;
        return cf.slice(0, 3) === cognomeCode(cognome) && cf.slice(3, 6) === nomeCode(nome);
    }

    // Age in whole years on a date, from the CF birth date (preferred) or a
    // plain age number as fallback. null when neither is usable.
    function ageOnDate(cfRaw, fallbackAge, onDate) {
        const v = validateCodiceFiscale(cfRaw, onDate);
        const ref = onDate ? new Date(onDate) : new Date();
        if (v.valid) {
            const [y, m, d] = v.birthDate.split('-').map(Number);
            let age = ref.getFullYear() - y;
            if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d)) age -= 1;
            return age;
        }
        const n = Number(fallbackAge);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    function isMinorOnDate(cfRaw, fallbackAge, onDate) {
        const age = ageOnDate(cfRaw, fallbackAge, onDate);
        return age !== null && age < 18;
    }

    // Suggest { nome, cognome, confirmed } from an old single "name" field.
    // Tries every split point in both orders ("Nome Cognome" and "Cognome
    // Nome") and keeps the one the CF confirms. Without a usable CF: last
    // word = cognome, confirmed false (to be checked by a human).
    function suggestNameSplit(fullName, cfRaw) {
        const words = String(fullName || '').trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return { nome: '', cognome: '', confirmed: false };
        if (words.length === 1) return { nome: titleCase(words[0]), cognome: '', confirmed: false };
        for (let k = 1; k < words.length; k += 1) {
            const a = words.slice(0, k).join(' ');
            const b = words.slice(k).join(' ');
            if (cfMatchesName(cfRaw, a, b) === true) return { nome: titleCase(a), cognome: titleCase(b), confirmed: true };
            if (cfMatchesName(cfRaw, b, a) === true) return { nome: titleCase(b), cognome: titleCase(a), confirmed: true };
        }
        return { nome: titleCase(words.slice(0, -1).join(' ')), cognome: titleCase(words[words.length - 1]), confirmed: false };
    }

    // ---------- comuni ----------
    let comuni = null; // [{ n, s, c: [cap] }]
    let comuniPromise = null;
    function loadComuni() {
        if (comuni) return Promise.resolve(comuni);
        if (!comuniPromise) {
            comuniPromise = fetch('data/comuni.json')
                .then((r) => { if (!r.ok) throw new Error('comuni ' + r.status); return r.json(); })
                .then((data) => { comuni = data; return data; })
                .catch((e) => { comuniPromise = null; throw e; });
        }
        return comuniPromise;
    }
    function keyOf(s) { return stripAccents(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    // The studio's own area first (Cremona and neighbouring provinces), so
    // "berg" offers Bergamo before Bergamasco (AL) and "crem" offers Cremona.
    const NEARBY = ['CR', 'BG', 'BS', 'PC', 'LO', 'MN', 'PR', 'MI', 'PV', 'LC', 'CO', 'VR'];
    function rank(c) {
        const i = NEARBY.indexOf(c.s);
        return (i < 0 ? 100 : i) * 1000 + c.n.length;
    }
    function searchComuni(term, limit) {
        if (!comuni) return [];
        const k = keyOf(term);
        if (!k) return [];
        const exact = [];
        const starts = [];
        const contains = [];
        for (const c of comuni) {
            const ck = c._k || (c._k = keyOf(c.n));
            if (ck === k) exact.push(c);
            else if (ck.startsWith(k)) starts.push(c);
            else if (ck.includes(k)) contains.push(c);
        }
        const byRank = (a, b) => rank(a) - rank(b);
        const found = exact.sort(byRank).concat(starts.sort(byRank), contains.sort(byRank));
        // Spelling mistakes ("cremnoa", "castelvedro"): also the closest names,
        // compared with the whole name or with its start of the same length.
        if (found.length < (limit || 8) && k.length >= 3) {
            const max = k.length <= 4 ? 1 : k.length <= 8 ? 2 : 3;
            const near = [];
            for (const c of comuni) {
                if (found.includes(c)) continue;
                const ck = c._k || (c._k = keyOf(c.n));
                const d = Math.min(editDistance(k, ck.slice(0, k.length), max), Math.abs(ck.length - k.length) <= max ? editDistance(k, ck, max) : max + 1);
                if (d <= max) near.push({ c, d });
            }
            near.sort((a, b) => a.d - b.d || rank(a.c) - rank(b.c));
            near.forEach((x) => found.push(x.c));
        }
        return found.slice(0, limit || 8);
    }
    // Levenshtein distance, giving up early once it is above max.
    function editDistance(a, b, max) {
        if (Math.abs(a.length - b.length) > max) return max + 1;
        let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
        for (let i = 1; i <= a.length; i++) {
            const cur = [i];
            let best = i;
            for (let j = 1; j <= b.length; j++) {
                cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                if (cur[j] < best) best = cur[j];
            }
            if (best > max) return max + 1;
            prev = cur;
        }
        return prev[b.length];
    }
    // Exact match by name (and sigla, when given). Accepts sloppy input:
    // "mornico al serio" / "Mornico al Serio", provincia "bg" / "Bergamo (BG)".
    function findComune(name, provinciaHint) {
        if (!comuni || !name) return null;
        const k = keyOf(name);
        const matches = comuni.filter((c) => keyOf(c.n) === k);
        if (matches.length === 0) return null;
        if (matches.length === 1) return matches[0];
        const sigla = siglaFromText(provinciaHint);
        return matches.find((c) => c.s === sigla) || null;
    }
    // "Piacenza (PC)" / "pc" / "PC" -> "PC"; anything else -> ''
    function siglaFromText(text) {
        const t = String(text || '').trim();
        const inParens = t.match(/\(([A-Za-z]{2})\)/);
        if (inParens) return inParens[1].toUpperCase();
        if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
        return '';
    }

    // Street types an Italian address line normally starts with. "Trento"
    // alone reads like a city, so a missing type is a (non-blocking) warning.
    const TOPONIMI = /^(via|viale|v\.le|piazza|p\.za|p\.zza|piazzale|p\.le|piazzetta|corso|c\.so|largo|vicolo|vicoletto|vico|strada|str\.|stradone|stradella|localit[aà]|loc\.|frazione|fraz\.|contrada|c\.da|borgo|cascina|salita|discesa|lungo\w*|rotonda|traversa|galleria|calle|campo|regione|quartiere|podere|alzaia|circonvallazione|rione|passaggio|parco)(?=[\s.,]|$)/i;
    function hasToponimo(via) { return TOPONIMI.test(String(via || '').trim()); }

    // { ok, problems: [..], warnings: [..] } for a full address. Needs loadComuni() first
    // for the comune/CAP checks; without it only the format checks run.
    function validateAddress(a) {
        const problems = [];
        const warnings = [];
        if (!String(a.via || '').trim()) problems.push(msg('via mancante', 'street missing'));
        else if (!hasToponimo(a.via)) warnings.push(msg('scrivi anche il tipo di via (es. "Via Trento", non "Trento")', 'write the street type too (e.g. "Via Trento", not "Trento")'));
        if (!String(a.comune || '').trim()) problems.push(msg('comune mancante', 'comune (town) missing'));
        if (!/^[A-Z]{2}$/.test(String(a.provincia || ''))) problems.push(msg('provincia non valida', 'invalid provincia'));
        if (!/^\d{5}$/.test(String(a.cap || ''))) problems.push(msg('CAP non valido', 'invalid CAP'));
        if (comuni && a.comune) {
            const c = findComune(a.comune, a.provincia);
            if (!c) problems.push(msg('comune non trovato nell\'elenco ufficiale', 'comune not found in the official list'));
            else {
                if (a.provincia && c.s !== a.provincia) problems.push(msg(`provincia errata (${a.comune} è ${c.s})`, `wrong provincia (${a.comune} is ${c.s})`));
                if (/^\d{5}$/.test(String(a.cap || '')) && !c.c.includes(a.cap)) problems.push(msg(`CAP non corrisponde al comune (${c.c.length === 1 ? c.c[0] : c.c[0] + '…'})`, `CAP doesn't match the comune (${c.c.length === 1 ? c.c[0] : c.c[0] + '…'})`));
            }
        }
        return { ok: problems.length === 0, problems, warnings };
    }

    // Old "Via|Civico|CAP|Comune|Provincia" string (older rows may have
    // dropped empty slots) -> parts. Re-anchors on the 5-digit CAP.
    function parseLegacyAddress(address) {
        let p = String(address || '').split('|').map((x) => x.trim());
        if (p.length > 1 && p.length < 5) {
            const capIdx = p.findIndex((x) => /^\d{5}$/.test(x));
            if (capIdx >= 0) {
                const before = p.slice(0, capIdx);
                p = [before[0] || '', before.slice(1).join(' '), p[capIdx], p[capIdx + 1] || '', p[capIdx + 2] || ''];
            }
        }
        return { via: p[0] || '', civico: p[1] || '', cap: p[2] || '', comune: p[3] || '', provincia: p[4] || '' };
    }

    // ---------- comune picker UI ----------
    // Wires three inputs: comune (typed, with suggestions), provincia
    // (read-only, set from the pick) and CAP (suggestions from the pick,
    // auto-filled when the comune has a single CAP).
    function attachComunePicker(comuneInput, provinciaInput, capInput, onChange) {
        if (!comuneInput || comuneInput.dataset.pickerAttached) return;
        comuneInput.dataset.pickerAttached = '1';
        comuneInput.setAttribute('autocomplete', 'off');
        provinciaInput.readOnly = true;
        provinciaInput.tabIndex = -1;
        provinciaInput.placeholder = 'auto';

        const wrap = comuneInput.parentElement;
        if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
        const list = document.createElement('div');
        list.style.cssText = 'position:absolute; left:0; right:0; z-index:60; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); box-shadow:var(--shadow-md); max-height:240px; overflow-y:auto; display:none; margin-top:2px;';
        wrap.appendChild(list);

        const capListId = (capInput.id || 'cap') + 'Options';
        let capList = document.getElementById(capListId);
        if (!capList) {
            capList = document.createElement('datalist');
            capList.id = capListId;
            document.body.appendChild(capList);
        }
        capInput.setAttribute('list', capListId);
        capInput.setAttribute('inputmode', 'numeric');
        capInput.maxLength = 5;

        let activeIdx = -1;
        let current = [];
        const fire = () => { if (onChange) onChange(); };

        function choose(c) {
            comuneInput.value = c.n;
            provinciaInput.value = c.s;
            capList.innerHTML = c.c.map((cap) => `<option value="${cap}">`).join('');
            if (c.c.length === 1) capInput.value = c.c[0];
            else if (!c.c.includes(capInput.value)) capInput.value = '';
            list.style.display = 'none';
            comuneInput.dataset.valid = '1';
            fire();
        }
        function render() {
            list.innerHTML = current.map((c, i) => `<div data-i="${i}" style="padding:8px 11px; cursor:pointer; font-size:0.9em; ${i === activeIdx ? 'background:var(--accent-soft);' : ''}">${c.n} <span style="color:var(--ink-faint);">(${c.s})</span></div>`).join('')
                || `<div style="padding:8px 11px; font-size:0.85em; color:var(--ink-faint);">Nessun comune trovato</div>`;
            list.style.display = 'block';
        }
        list.addEventListener('mousedown', (e) => {
            const row = e.target.closest('[data-i]');
            if (!row) return;
            e.preventDefault();
            choose(current[Number(row.dataset.i)]);
        });
        comuneInput.addEventListener('input', () => {
            comuneInput.dataset.valid = '';
            provinciaInput.value = '';
            loadComuni().then(() => {
                current = searchComuni(comuneInput.value, 8);
                activeIdx = current.length ? 0 : -1;
                if (comuneInput.value.trim()) render(); else list.style.display = 'none';
            }).catch(() => {});
            fire();
        });
        comuneInput.addEventListener('keydown', (e) => {
            if (list.style.display !== 'block' || !current.length) return;
            if (e.key === 'ArrowDown') { activeIdx = Math.min(activeIdx + 1, current.length - 1); render(); e.preventDefault(); }
            else if (e.key === 'ArrowUp') { activeIdx = Math.max(activeIdx - 1, 0); render(); e.preventDefault(); }
            else if (e.key === 'Enter') { if (activeIdx >= 0) { choose(current[activeIdx]); e.preventDefault(); } }
            else if (e.key === 'Escape') { list.style.display = 'none'; }
        });
        comuneInput.addEventListener('blur', () => {
            setTimeout(() => { list.style.display = 'none'; }, 150);
            // Typed a full, unambiguous name without clicking — accept it.
            if (!comuneInput.dataset.valid && comuni) {
                const exact = findComune(comuneInput.value, provinciaInput.value);
                if (exact) choose(exact);
            }
        });
        capInput.addEventListener('input', () => { capInput.value = capInput.value.replace(/\D/g, '').slice(0, 5); fire(); });
    }

    // Puts a known comune into a picker-wired set of inputs (e.g. when
    // editing). Unknown/old values are kept as typed and flagged invalid.
    function setComuneValue(comuneInput, provinciaInput, capInput, comune, provincia, cap) {
        comuneInput.value = comune || '';
        provinciaInput.value = siglaFromText(provincia) || '';
        capInput.value = cap || '';
        comuneInput.dataset.valid = '';
        const apply = () => {
            const c = findComune(comune, provincia);
            if (c) {
                comuneInput.value = c.n;
                provinciaInput.value = c.s;
                comuneInput.dataset.valid = '1';
                const capList = document.getElementById((capInput.id || 'cap') + 'Options');
                if (capList) capList.innerHTML = c.c.map((x) => `<option value="${x}">`).join('');
                if (!cap && c.c.length === 1) capInput.value = c.c[0];
            }
        };
        if (comune) loadComuni().then(apply).catch(() => {});
    }

    window.Anagrafica = {
        titleCase, normalizeCf, validateCodiceFiscale, cfMatchesName, cognomeCode, nomeCode,
        ageOnDate, isMinorOnDate, suggestNameSplit,
        loadComuni, searchComuni, findComune, siglaFromText, validateAddress, parseLegacyAddress, hasToponimo,
        attachComunePicker, setComuneValue,
        get comuniLoaded() { return !!comuni; }
    };
})();
