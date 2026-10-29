// ============================================================================
// tasse.js — admin.html only (tax_tab.sql). The "Tasse" tab.
//
// For a forfettario with INPS Gestione Separata:
//   - calculator per tax year (ricavi from the fatture register, coefficient,
//     imposta sostitutiva 5% start-up / 15%, INPS), with the OFFICIAL figures
//     from the declaration taking precedence when entered;
//   - deadlines (30/06 saldo + 1st acconto, 30/11 2nd acconto) with the F24
//     lines ready to copy, credits applied automatically, and the "F24 a zero
//     va inviato comunque" warning;
//   - credits (e.g. IRPEF from the declaration's quadro RX) with what's used
//     and what's left, and a record of every F24 sent.
// Nothing is sent anywhere: the user files and pays on the AdE site / bank.
//
// Rules and rates are editable in Impostazioni because they change; the
// screen says so. Relies on admin.html / fatture.js globals at call time.
// ============================================================================

let taxSettings = null;
let taxYears = {};      // { [anno]: row }
let taxCredits = [];
let taxF24 = [];
let taxMissing = false;

const TAX_ACCONTO_MIN = 51.65;      // under this: no acconto
const TAX_ACCONTO_SINGLE = 257.52;  // under this: single acconto in November
const INPS_ACCONTO_PERC = 80;       // Gestione Separata: 80% of the year, in two halves

async function loadTaxData() {
    try {
        const [s, y, c, f] = await Promise.all([
            supabaseClient.from('tax_settings').select('*').eq('id', 1).maybeSingle(),
            supabaseClient.from('tax_years').select('*'),
            supabaseClient.from('tax_credits').select('*').is('deleted_at', null).order('created_at', { ascending: true }),
            supabaseClient.from('tax_f24').select('*').is('deleted_at', null).order('data', { ascending: false })
        ]);
        const err = s.error || y.error || c.error || f.error;
        if (err) throw err;
        taxSettings = s.data || {};
        taxYears = {};
        (y.data || []).forEach((r) => { taxYears[r.anno] = r; });
        taxCredits = c.data || [];
        taxF24 = f.data || [];
        taxMissing = false;
        if (typeof loadJobData === 'function') await loadJobData();
    } catch (e) {
        console.error('Tasse not available (has tax_tab.sql been run?):', e);
        taxMissing = true;
    }
}

// ---------- helpers ----------
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const eur = (n) => '€ ' + r2(n).toFixed(2).replace('.', ',');
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function taxAliquotaFor(anno) {
    const st = taxSettings || {};
    const start = Number(st.anno_inizio) || 2025;
    const years = Number(st.anni_agevolati) || 5;
    return anno < start + years ? Number(st.aliquota_agevolata ?? 5) : Number(st.aliquota_ordinaria ?? 15);
}
// Ricavi from the fatture register (the user's chosen base): every issued,
// not-rejected fattura dated in that year.
function taxRicaviFromFatture(anno) {
    if (typeof fattureList === 'undefined') return 0;
    // a nota di credito counts as minus (fatturaSign)
    return r2(fattureList.filter((f) => f.anno === anno && f.status !== 'rejected').reduce((s, f) => s + fatturaSign(f) * Number(f.importo || 0), 0));
}
// All F24 lines (from the record) with their F24's date.
function taxAllLines() {
    const out = [];
    taxF24.forEach((f) => (f.righe || []).forEach((l) => out.push({ ...l, _data: String(f.data).slice(0, 10), _f24: f })));
    return out;
}
// INPS actually paid (or offset) during a calendar year: deductible from the
// forfettario income of that year.
function taxInpsPaidDuring(anno) {
    return r2(taxAllLines().filter((l) => l.sezione === 'INPS' && l._data.slice(0, 4) === String(anno)).reduce((s, l) => s + Number(l.debito || 0), 0));
}
function taxAccontiPaidFor(anno, kind) { // kind: 'imposta' | 'inps'
    return r2(taxAllLines().filter((l) => String(l.anno) === String(anno) && (l.tipo === 'acconto1' || l.tipo === 'acconto2')
        && (kind === 'inps' ? l.sezione === 'INPS' : l.sezione === 'ERARIO' && (l.codice === '1790' || l.codice === '1791')))
        .reduce((s, l) => s + Number(l.debito || 0), 0));
}

// Everything about one tax year. Official figures (tax_years) win.
function taxYearFigures(anno) {
    const st = taxSettings || {};
    const off = taxYears[anno] || {};
    const coeff = Number(st.coefficiente ?? 78);
    const aliquota = taxAliquotaFor(anno);
    const ricaviCalc = taxRicaviFromFatture(anno);
    const ricavi = num(off.ricavi) ?? ricaviCalc;
    const reddito = num(off.reddito) ?? r2(ricavi * coeff / 100);
    const inps = num(off.inps) ?? r2(reddito * Number(st.inps_aliquota ?? 26.07) / 100);
    const deducibili = taxInpsPaidDuring(anno);
    const imponibile = Math.max(0, r2(reddito - deducibili));
    const imposta = num(off.imposta) ?? r2(imponibile * aliquota / 100);
    // Acconti for the NEXT year, computed from this year (metodo storico).
    let a1i = 0, a2i = 0;
    if (imposta > TAX_ACCONTO_SINGLE) { a1i = r2(imposta * 0.4); a2i = r2(imposta - a1i); }
    else if (imposta > TAX_ACCONTO_MIN) { a2i = imposta; }
    const inpsAcc = r2(inps * INPS_ACCONTO_PERC / 100);
    let a1p = r2(inpsAcc / 2), a2p = r2(inpsAcc - a1p);
    if (num(off.acconto1_imposta) !== null) a1i = num(off.acconto1_imposta);
    if (num(off.acconto2_imposta) !== null) a2i = num(off.acconto2_imposta);
    if (num(off.acconto1_inps) !== null) a1p = num(off.acconto1_inps);
    if (num(off.acconto2_inps) !== null) a2p = num(off.acconto2_inps);
    const accImpPaid = taxAccontiPaidFor(anno, 'imposta');
    const accInpsPaid = taxAccontiPaidFor(anno, 'inps');
    return {
        anno, official: !!taxYears[anno], ricaviCalc, ricavi, coeff, reddito, deducibili, imponibile, aliquota, imposta, inps,
        accImpPaid, accInpsPaid,
        saldoImposta: r2(imposta - accImpPaid), saldoInps: r2(inps - accInpsPaid),
        next: { acconto1Imposta: a1i, acconto2Imposta: a2i, acconto1Inps: a1p, acconto2Inps: a2p }
    };
}

function taxCreditUsed(creditId) {
    return r2(taxAllLines().filter((l) => l.credit_id === creditId).reduce((s, l) => s + Number(l.credito || 0), 0));
}
function taxCreditsAvailable() {
    return taxCredits.map((c) => ({ ...c, used: taxCreditUsed(c.id), left: r2(Number(c.importo) - taxCreditUsed(c.id)) })).filter((c) => c.left > 0.004);
}

// ---------- deadlines + F24 drafts ----------
function taxStudioCf() {
    return (typeof fatturaSettings !== 'undefined' && fatturaSettings && fatturaSettings.codice_fiscale) || '';
}
function taxDeadlinesFor(P) {
    const Y = P - 1;
    const fy = taxYearFigures(Y);
    const sede = (taxSettings && taxSettings.inps_sede) || '';
    const cf = taxStudioCf();
    const inpsLine = (anno, tipo, debito) => ({ sezione: 'INPS', codice: 'PXX', sede, matricola: cf, anno, periodo: `01/${anno} – 12/${anno}`, tipo, debito, credito: 0 });
    const june = [
        fy.saldoImposta > 0 && { sezione: 'ERARIO', codice: '1792', anno: Y, tipo: 'saldo', debito: fy.saldoImposta, credito: 0 },
        fy.next.acconto1Imposta > 0 && { sezione: 'ERARIO', codice: '1790', anno: P, tipo: 'acconto1', debito: fy.next.acconto1Imposta, credito: 0 },
        fy.saldoInps > 0 && inpsLine(Y, 'saldo', fy.saldoInps),
        fy.next.acconto1Inps > 0 && inpsLine(P, 'acconto1', fy.next.acconto1Inps)
    ].filter(Boolean);
    const nov = [
        fy.next.acconto2Imposta > 0 && { sezione: 'ERARIO', codice: '1791', anno: P, tipo: 'acconto2', debito: fy.next.acconto2Imposta, credito: 0 },
        fy.next.acconto2Inps > 0 && inpsLine(P, 'acconto2', fy.next.acconto2Inps)
    ].filter(Boolean);
    return [
        { key: `${P}-06`, date: `${P}-06-30`, title: `30/06/${P} — F24: saldo ${Y} + 1° acconto ${P}`, lines: june, figures: fy },
        { key: `${P}-11`, date: `${P}-11-30`, title: `30/11/${P} — F24: 2° acconto ${P}`, lines: nov, figures: fy },
        { key: `${P}-redditi`, date: `${P}-10-31`, title: `31/10/${P} — send the Modello Redditi PF ${P} (income ${Y})`, lines: null, figures: fy }
    ];
}
function taxF24ForDeadline(key) { return taxF24.find((f) => f.scadenza === key) || null; }

// Adds credit lines (oldest credits first) up to the debit total.
function taxApplyCredits(lines) {
    const debit = r2(lines.reduce((s, l) => s + Number(l.debito || 0), 0));
    let need = debit;
    const credits = [];
    taxCreditsAvailable().forEach((c) => {
        if (need <= 0) return;
        const use = r2(Math.min(need, c.left));
        if (use > 0) {
            credits.push({ sezione: 'ERARIO', codice: c.codice_tributo, anno: c.anno_riferimento, tipo: 'credito', debito: 0, credito: use, credit_id: c.id, origine: c.origine });
            need = r2(need - use);
        }
    });
    const totale = r2(debit - credits.reduce((s, l) => s + l.credito, 0));
    return { all: lines.concat(credits), debit, totale };
}

function taxCopy(text) {
    navigator.clipboard?.writeText(String(text)).then(() => {}, () => {});
}
function taxRenderF24Lines(lines) {
    const rows = lines.map((l) => {
        const where = l.sezione === 'INPS'
            ? `sede <b>${escapeHtml(l.sede || '????')}</b> · causale <b>PXX</b> · matricola <b>${escapeHtml(l.matricola || '—')}</b> · periodo <b>${escapeHtml(l.periodo)}</b>`
            : `codice tributo <b>${escapeHtml(l.codice)}</b> · anno <b>${l.anno}</b>`;
        const label = { saldo: 'saldo', acconto1: '1° acconto', acconto2: '2° acconto', credito: 'credit used — «importi a credito compensati»' }[l.tipo] || '';
        return `
            <tr>
                <td style="padding:6px 8px 6px 0; white-space:nowrap; font-weight:700;">${l.sezione}</td>
                <td style="padding:6px 8px;">${where} <span style="color:var(--ink-faint);">(${label}${l.origine ? ' — ' + escapeHtml(l.origine) : ''})</span></td>
                <td style="padding:6px 8px; text-align:right; white-space:nowrap;">${l.debito ? `<span style="cursor:pointer; text-decoration:underline dotted;" title="Copy" onclick="taxCopy('${r2(l.debito).toFixed(2).replace('.', ',')}')">${eur(l.debito)}</span>` : ''}</td>
                <td style="padding:6px 0 6px 8px; text-align:right; white-space:nowrap; color:var(--success);">${l.credito ? `<span style="cursor:pointer; text-decoration:underline dotted;" title="Copy" onclick="taxCopy('${r2(l.credito).toFixed(2).replace('.', ',')}')">${eur(l.credito)}</span>` : ''}</td>
            </tr>`;
    }).join('');
    return `<table style="width:100%; border-collapse:collapse; font-size:0.84em;">
        <tr style="color:var(--ink-faint); font-size:0.9em;"><td>Sezione</td><td>What to type</td><td style="text-align:right;">Importi a debito</td><td style="text-align:right;">Importi a credito</td></tr>${rows}</table>`;
}

// Optional instalments (rateizzazione) of the June payment: 30/06, then the
// 16th of each month (20/08 in August), interest per month on later ones.
function taxInstalments(total, n, P) {
    const rate = Number((taxSettings && taxSettings.interesse_mensile) ?? 0.33) / 100;
    const base = r2(total / n);
    const dates = [`30/06/${P}`, `16/07/${P}`, `20/08/${P}`, `16/09/${P}`, `16/10/${P}`, `16/11/${P}`];
    return Array.from({ length: n }, (_, k) => {
        const amount = k === n - 1 ? r2(total - base * (n - 1)) : base;
        const interest = r2(amount * rate * k);
        return { date: dates[k], amount, interest, total: r2(amount + interest) };
    });
}

// ---------- rendering ----------
function renderTaxTab() {
    const el = document.getElementById('taxTabContent');
    if (!el) return;
    if (taxMissing) {
        el.innerHTML = `<div class="placeholder-card">${icon('warning', 26)}<h3>Taxes not set up yet</h3><div style="color:var(--ink-soft); font-size:0.88em;">Run tax_tab.sql in Supabase, then refresh the page.</div></div>`;
        return;
    }
    // «Job income (CU)» / «Redditi checklist» live in jobincome.js
    const view = typeof taxCurrentView === 'function' ? taxCurrentView() : 'studio';
    if (view === 'job') { renderJobIncome(el); return; }
    if (view === 'check') { renderRedditiChecklist(el); return; }
    const nowY = new Date().getFullYear();
    const sel = Number(document.getElementById('taxYearSelect')?.value) || nowY; // default: the running year
    const fy = taxYearFigures(sel);
    const credits = taxCredits.map((c) => ({ ...c, used: taxCreditUsed(c.id) }));
    const creditLeft = r2(credits.reduce((s, c) => s + Number(c.importo) - c.used, 0));
    const years = [...new Set([nowY - 1, nowY, ...Object.keys(taxYears).map(Number)])].sort((a, b) => b - a);
    const deadlines = [...taxDeadlinesFor(nowY), ...taxDeadlinesFor(nowY + 1), ...bolloDeadlines()];
    // Show only what needs attention now: anything past and not done + the next upcoming one.
    // Later deadlines are estimates that change with every fattura: folded away.
    const todayS = formatLocalDate(new Date());
    const isDone = (d) => d.bollo ? !!d.bollo.paid : d.lines === null ? !!taxYears[Number(d.key.slice(0, 4)) - 1]?.dichiarazione_protocollo : (!d.lines.length ? d.date < todayS : !!taxF24ForDeadline(d.key));
    const pastOrDone = deadlines.filter((d) => d.date < todayS || isDone(d));
    const upcoming = deadlines.filter((d) => !(d.date < todayS || isDone(d))).sort((a, b) => a.date.localeCompare(b.date));
    const nowList = [...pastOrDone.filter((d) => !isDone(d)), ...upcoming.slice(0, 1)];
    const doneList = pastOrDone.filter(isDone);
    const laterList = upcoming.slice(1);
    // The next deadline gets its button and open F24 lines only from 60 days before; until then it is an estimate.
    const soonS = formatLocalDate(new Date(Date.now() + 60 * 86400000));

    // Summary: the 3 things that matter, in one glance
    const nextD = upcoming[0];
    const nextDraft = nextD && nextD.lines ? taxApplyCredits(nextD.lines) : null;
    const overdueCount = pastOrDone.filter((d) => !isDone(d)).length;
    const st = taxSettings || {};
    const lastAgev = Number(st.anno_inizio || nowY) + Number(st.anni_agevolati || 5) - 1;
    const rateNow = taxAliquotaFor(nowY);
    const tile = (label, value, sub, color) => `<div class="card" style="flex:1 1 180px; padding:12px 16px;">
            <div style="font-size:0.75em; text-transform:uppercase; letter-spacing:0.04em; color:var(--ink-faint); font-weight:700;">${label}</div>
            <div style="font-size:1.35em; font-weight:800; margin:4px 0 2px; ${color ? 'color:' + color + ';' : ''}">${value}</div>
            <div style="font-size:0.8em; color:var(--ink-soft);">${sub}</div></div>`;
    const summary = `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:18px;">
        ${overdueCount
            ? tile('Needs attention', `${overdueCount} deadline${overdueCount > 1 ? 's' : ''}`, 'past and not marked as done — see below', 'var(--danger)')
            : tile('Next deadline', nextD ? nextD.title.split(' — ')[0] : '—', nextD ? (nextD.bollo ? `imposta di bollo: <b>${eur(nextD.bollo.amount)}</b>` : nextDraft ? `to pay: <b>${eur(nextDraft.totale)}</b>${nextD.date > formatLocalDate(new Date(Date.now() + 60 * 86400000)) ? ' · estimate, nothing to do now' : ''}` : 'send the Modello Redditi') : 'nothing planned')}
        ${tile('Credit left', eur(creditLeft), 'used automatically in your F24s', 'var(--success)')}
        ${tile('Your tax rate', `${rateNow}%`, rateNow < Number(st.aliquota_ordinaria || 15) ? `start-up rate until ${lastAgev}, then ${st.aliquota_ordinaria || 15}%` : 'imposta sostitutiva')}
    </div>`;

    el.innerHTML = `${typeof taxViewPills === 'function' ? taxViewPills() + taxAlertsHtml() : ''}
        ${summary}


        <div class="section-label">Next deadline (prossima scadenza)</div>
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">${nowList.map((d) => taxDeadlineCardHtml(d, d.date <= soonS)).join('') || '<div class="card" style="padding:12px 16px; font-size:0.88em;">Nothing to do now.</div>'}</div>
        ${laterList.length ? `<details style="margin-bottom:10px;"><summary style="cursor:pointer; font-size:0.86em; color:var(--ink-soft); padding:4px 0;">Later deadlines — estimates only, nothing to do now (${laterList.length})</summary>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">${laterList.map((d) => taxDeadlineCardHtml(d, false)).join('')}</div></details>` : ''}
        ${doneList.length ? `<details style="margin-bottom:22px;"><summary style="cursor:pointer; font-size:0.86em; color:var(--ink-soft); padding:4px 0;">Done (${doneList.length})</summary>
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">${doneList.map((d) => taxDeadlineCardHtml(d, false)).join('')}</div></details>` : '<div style="margin-bottom:22px;"></div>'}

        <div class="section-label">Credits (crediti) — ${eur(creditLeft)} available</div>
        <div class="card" style="padding:14px 16px; margin-bottom:22px;">
            ${credits.length ? credits.map((c) => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding:7px 0; border-bottom:1px solid var(--border-soft); font-size:0.87em;">
                    <span><b>${escapeHtml(c.origine)}</b> · codice tributo ${escapeHtml(c.codice_tributo)} · anno di riferimento ${c.anno_riferimento}</span>
                    <span style="display:flex; gap:10px; align-items:center;">
                        <span>${eur(c.importo)} · used ${eur(c.used)} · <b style="color:var(--success);">left ${eur(Number(c.importo) - c.used)}</b></span>
                        <button class="btn btn-outline btn-sm" onclick="openTaxCreditModal(${c.id})">Edit</button>
                    </span>
                </div>`).join('') : '<div style="color:var(--ink-faint); font-size:0.87em;">No credits entered yet.</div>'}
            <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="openTaxCreditModal()">+ Add credit</button>
        </div>

        <div class="section-label" style="display:flex; align-items:center; gap:10px;">Calculation for tax year
            <select id="taxYearSelect" onchange="renderTaxTab()" style="padding:4px 8px; border-radius:var(--radius-sm); border:1px solid var(--border);">${years.map((y) => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y}</option>`).join('')}</select>
        </div>
        <div class="card" style="padding:14px 16px; margin-bottom:22px; font-size:0.88em;">
            <div style="margin-bottom:8px;">${fy.official
                ? `<span class="badge badge-success">Official figures from the dichiarazione</span>`
                : `<span class="badge badge-neutral">App estimate (from your fatture)</span>`}
                <button class="btn btn-outline btn-sm" style="margin-left:8px;" onclick="openTaxYearModal(${sel})">${fy.official ? 'Edit dichiarazione figures' : 'Enter dichiarazione figures'}</button>
                ${taxYears[sel]?.dichiarazione_pdf_path ? `<button class="btn btn-primary btn-sm" style="margin-left:6px;" onclick="viewTaxPdf('${escapeHtml(taxYears[sel].dichiarazione_pdf_path)}')">Open dichiarazione PDF</button>` : ''}</div>
            ${[
                ['Ricavi — income (from fatture)', eur(fy.ricavi) + (fy.official && r2(fy.ricaviCalc) !== r2(fy.ricavi) ? ` <span style="color:var(--ink-faint);">(fatture register: ${eur(fy.ricaviCalc)})</span>` : '')],
                [`Reddito lordo — taxable base (${fy.coeff}% coefficiente)`, eur(fy.reddito)],
                ['INPS contributi paid during the year (deductible)', eur(fy.deducibili)],
                ['Reddito imponibile — taxable income', eur(fy.imponibile)],
                [`Imposta sostitutiva ${fy.aliquota}% — your tax`, eur(fy.imposta)],
                ['INPS Gestione Separata due', eur(fy.inps)],
                ['Acconti already paid (tax / INPS)', `${eur(fy.accImpPaid)} / ${eur(fy.accInpsPaid)}`],
                ['<b>Saldo</b> — balance to pay (tax / INPS)', `<b>${eur(fy.saldoImposta)} / ${eur(fy.saldoInps)}</b>`],
                [`Acconti ${sel + 1} — tax (June / November)`, `${eur(fy.next.acconto1Imposta)} / ${eur(fy.next.acconto2Imposta)}`],
                [`Acconti ${sel + 1} — INPS (June / November)`, `${eur(fy.next.acconto1Inps)} / ${eur(fy.next.acconto2Inps)}`]
            ].map(([k, v]) => `<div style="display:flex; justify-content:space-between; gap:10px; padding:5px 0; border-bottom:1px solid var(--border-soft);"><span style="color:var(--ink-soft);">${k}</span><span>${v}</span></div>`).join('')}
            <div style="font-size:0.85em; color:var(--ink-faint); margin-top:8px;">Where these go in the Modello Redditi: <b>quadro LM</b> (regime forfetario) for ricavi, reddito and imposta; <b>quadro RR sezione II</b> for INPS Gestione Separata; <b>quadro RX</b> for credits and debts. Rules and rates can change: always check that year's «istruzioni».</div>
        </div>

        <div class="section-label">F24 record — every F24 you sent</div>
        <div class="card" style="padding:14px 16px; margin-bottom:10px;">
            ${taxF24.length ? taxF24.map((f) => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding:7px 0; border-bottom:1px solid var(--border-soft); font-size:0.87em;">
                    <span><b>${formatShortDate(f.data)}</b> · ${escapeHtml(f.descrizione || '')} · total paid <b>${eur(f.totale)}</b></span>
                    <span style="display:flex; gap:6px;">
                        ${f.receipt_path ? `<button class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(f.receipt_path)}')">Receipt (quietanza)</button>` : ''}
                        <button class="btn btn-danger btn-sm" title="Remove from the record" onclick="deleteTaxF24(${f.id})">${icon('trash', 13)}</button>
                    </span>
                </div>`).join('') : '<div style="color:var(--ink-faint); font-size:0.87em;">No F24 recorded yet.</div>'}
        </div>

        <div class="section-label" style="margin-top:22px;">Help</div>
        ${taxGuidesHtml()}`;
}

// "When to do it" window: the Modello Redditi and the June F24 (saldo + 1° acconto)
// from 20 May to 30 June (the precompilata can be sent from about 20 May);
// the other F24s from 60 days before the deadline.
function taxDeadlineWindow(d) {
    const fmt = (iso) => iso.split('-').reverse().join('/');
    const y = d.date.slice(0, 4);
    const may20 = d.lines === null || d.key.endsWith('-06');
    const from = may20 ? `${y}-05-20` : formatLocalDate(new Date(new Date(d.date + 'T12:00:00').getTime() - 60 * 86400000));
    const to = may20 ? `${y}-06-30` : d.date;
    return { from, to, text: `${fmt(from)} – ${fmt(to)}` };
}
// Card colour once its time has come: green = the window is open, red = the
// last 7 days, past the deadline, or (Modello Redditi) past the recommended
// 20/05–30/06 window. Not started yet or done: no colour.
const TAX_TONE = {
    green: 'background:var(--success-soft); border-left:5px solid var(--success);',
    red: 'background:var(--danger-soft); border-left:5px solid var(--danger);'
};
// «30/06/2027 — F24: …» → the date as a big headline, the rest under it
function taxDeadlineHeadHtml(d, badge) {
    const [date, ...rest] = d.title.split(' — ');
    return `<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
            <div><div style="font-size:1.35em; font-weight:800; line-height:1.2;">${date}</div><div style="font-weight:700; font-size:0.95em; margin-top:2px;">${rest.join(' — ')}</div></div>
            ${badge}
        </div>`;
}
function taxDeadlineCardHtml(d, expanded) {
    if (d.bollo) return bolloDeadlineCardHtml(d.bollo);
    const today = formatLocalDate(new Date());
    const win = taxDeadlineWindow(d);
    const notYet = today < win.from;
    const whenBadge = notYet
        ? `<span class="badge badge-neutral">Do it between ${win.text}</span>`
        : `<span class="badge badge-warning">To do — by ${win.text.split(' – ')[1]}</span>`;
    const done = taxF24ForDeadline(d.key);
    const overdue = !done && d.date < today;
    if (d.lines === null) {
        // Modello Redditi deadline (no F24): recommended 20/05–30/06, legal deadline 31/10
        const sent = taxYears[Number(d.key.slice(0, 4)) - 1]?.dichiarazione_protocollo;
        const late = !sent && today > win.to;
        const tone = sent || notYet ? '' : late ? TAX_TONE.red : TAX_TONE.green;
        const badge = sent ? `<span class="badge badge-success">Sent (protocollo ${escapeHtml(sent)})</span>`
            : d.date < today ? '<span class="badge badge-danger">Overdue?</span>'
            : late ? `<span class="badge badge-danger">Late on your plan — legal deadline ${d.title.split(' — ')[0]}</span>`
            : whenBadge;
        return `<div class="card" style="padding:12px 16px; font-size:0.88em; ${sent ? 'opacity:0.75;' : ''}${tone}">
            ${taxDeadlineHeadHtml(d, badge)}
            ${sent ? '' : `<div style="margin-top:8px; padding:8px 12px; border-radius:var(--radius-sm); background:var(--surface); border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                <span><b>How:</b> go to the 3rd tab <b>«Redditi checklist»</b> and follow the instructions there, step by step.${notYet ? ` Recommended: between <b>${win.text}</b>, together with the June F24.` : ''}</span>
                <button class="btn btn-primary btn-sm" onclick="setTaxView('check'); window.scrollTo({ top: 0, behavior: 'smooth' });">Open Redditi checklist</button>
            </div>`}
        </div>`;
    }
    if (!d.lines.length) {
        return `<div class="card" style="padding:12px 16px; font-size:0.88em; opacity:0.75;">${taxDeadlineHeadHtml(d, '<span class="badge badge-neutral">Nothing to pay</span>')}</div>`;
    }
    const lastWeek = !done && today >= formatLocalDate(new Date(new Date(d.date + 'T12:00:00').getTime() - 7 * 86400000));
    const tone = done || notYet ? '' : overdue || lastWeek ? TAX_TONE.red : TAX_TONE.green;
    const hasCredit = (done ? done.righe || [] : taxApplyCredits(d.lines).all).some((l) => Number(l.credito || 0) > 0);
    const draft = done ? { all: done.righe || [], totale: Number(done.totale), debit: r2((done.righe || []).reduce((s, l) => s + Number(l.debito || 0), 0)) } : taxApplyCredits(d.lines);
    const badge = done ? `<span class="badge badge-success">Done on ${formatShortDate(done.data)}</span>`
        : overdue ? '<span class="badge badge-danger">Overdue — check «Versamenti F24» in the Cassetto fiscale</span>'
        : whenBadge;
    const P = Number(d.key.slice(0, 4));
    const rateSel = !done && d.key.endsWith('-06') && draft.totale > 0
        ? `<div style="margin-top:8px; font-size:0.85em;">Pay in instalments (rateizzazione): <select onchange="this.nextElementSibling.innerHTML = taxInstalmentsHtml(${draft.totale}, Number(this.value), ${P})">${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}">${n}</option>`).join('')}</select><div></div></div>`
        : '';
    return `<div class="card" style="padding:12px 16px;${tone}">
        ${taxDeadlineHeadHtml(d, badge)}
        ${!done && d.key.endsWith('-06') ? `<div style="font-size:0.82em; color:var(--ink-soft); margin-top:4px;">Late option: by <b>30/07/${d.date.slice(0, 4)}</b> with <b>+0,40%</b> («maggiorazione»).</div>` : ''}
        ${!done && !expanded ? '<div style="font-size:0.82em; color:var(--ink-faint); margin-top:4px;">Estimate from your fatture so far — it changes as you add fatture. Nothing to do now.</div>' : ''}
        <details ${done || !expanded ? '' : 'open'} style="margin-top:8px;">
            <summary style="cursor:pointer; font-size:0.85em; color:var(--ink-soft);">F24 lines — what to type (click an amount to copy it)</summary>
            <div style="margin-top:6px;">${taxRenderF24Lines(draft.all)}</div>
        </details>
        ${done ? '' : `<div style="margin-top:8px; font-size:0.84em; color:var(--ink-soft);"><b>Where to send it:</b> nothing is sent automatically. ${expanded ? 'Now' : `By ${d.title.split(' — ')[0]}`} you open <a href="https://telematici.agenziaentrate.gov.it/Main/F24web.jsp" target="_blank" rel="noopener">«F24 web»</a> (log in with SPID/CIE) and type these lines there${draft.totale > 0 && !hasCredit ? ', or give them to your bank («F24 ordinario» in home banking)' : ''}. Step by step: <a href="#" onclick="document.getElementById('taxHelpF24').open = true; document.getElementById('taxHelpF24').scrollIntoView({behavior:'smooth'}); return false;">How to send an F24</a> (in Help, at the bottom).</div>`}
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px; font-size:0.9em;">
            <span>Debit ${eur(draft.debit)} − credits = <b>F24 total («saldo finale») ${eur(draft.totale)}</b></span>
            ${done ? `<button class="btn btn-outline btn-sm" onclick="deleteTaxF24(${done.id})">Undo «done»</button>`
                : expanded ? `<button class="btn btn-success btn-sm" onclick="openMarkTaxDone('${d.key}')">Mark as sent / paid</button>` : ''}
        </div>
        ${draft.totale === 0 && !done && expanded ? `<div style="margin-top:8px; padding:8px 10px; background:var(--warning-soft); border-radius:var(--radius-sm); font-size:0.84em;"><b>«F24 a saldo zero»: it must still be sent</b>, with <b>«F24 web»</b> in the AdE «Area riservata» — not through your bank. Otherwise the credit offset (compensazione) doesn't count.</div>` : ''}
        ${!done && draft.totale > 0 ? (hasCredit
            ? '<div style="margin-top:6px; font-size:0.82em; color:var(--ink-faint);">It uses a credit, so send it with «F24 web» (not the bank app), even if the total is above 0.</div>'
            : '<div style="margin-top:6px; font-size:0.82em; color:var(--ink-faint);">Pay with your home banking («F24 ordinario») or with «F24 web».</div>') : ''}
        ${rateSel}
    </div>`;
}
function taxInstalmentsHtml(total, n, P) {
    if (n <= 1) return '';
    return '<table style="font-size:0.95em; margin-top:6px;">' + taxInstalments(total, n, P).map((r, i) =>
        `<tr><td style="padding:2px 10px 2px 0;">rata ${i + 1} — ${r.date}</td><td style="text-align:right;">${eur(r.amount)}</td><td style="padding-left:10px; color:var(--ink-faint);">+ interessi ${eur(r.interest)}</td><td style="padding-left:10px;"><b>${eur(r.total)}</b></td></tr>`).join('')
        + '</table><div style="color:var(--ink-faint);">Interest is approximate: check that year\'s rate. With instalments: tax → interest with codice tributo <b>1668</b>; INPS → causale <b>PXXR</b> for each rata and <b>DPPI</b> for the interest. All rate must be paid by 16 December.</div>';
}

function taxGuidesHtml() {
    const box = (title, inner, last, id) => `
        <details class="card" ${id ? `id="${id}"` : ''} style="padding:10px 16px; margin-bottom:${last ? 18 : 8}px;">
            <summary style="cursor:pointer; font-weight:600; font-size:0.88em;">${title}</summary>
            <div style="font-size:0.86em; color:var(--ink-soft); line-height:1.65; margin-top:8px;">${inner}</div>
        </details>`;
    const ol = (items) => `<ol style="margin:0 0 0 18px; padding:0;">${items.map((x) => `<li style="margin-bottom:4px;">${x}</li>`).join('')}</ol>`;
    const a = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    const AREA = 'https://www.agenziaentrate.gov.it/portale/area-riservata';
    const CASSETTO = 'https://portale.agenziaentrate.gov.it/PortaleWeb/home?to=CASSET';
    const F24WEB = 'https://telematici.agenziaentrate.gov.it/Main/F24web.jsp';
    const note = '<div style="color:var(--ink-faint); margin-top:6px;">Words in «…» are written exactly as on the Italian websites, so you can find the same button or menu. Menu names can change slightly over time.</div>';
    return `
        ${box('How to send an F24 with «F24 web» (also «a saldo zero»)', ol([
            `Open ${a(AREA, '«Area riservata»')} and log in with SPID/CIE.`,
            `Open the service ${a(F24WEB, '«F24 web»')} (also in the menu of services, under «Versamenti» / «Pagamenti»).`,
            '<b>«Contribuente»</b>: your codice fiscale and personal data are usually filled in already.',
            'In this app, on the deadline card at the top of the page, click <b>▶ F24 lines</b> to open them: those are the lines to copy.',
            '<b>«Sezione Erario»</b>: for each ERARIO line of the card type <b>«codice tributo»</b>, <b>«anno di riferimento»</b> and the amount in <b>«importi a debito versati»</b>. A credit goes on its own line in <b>«importi a credito compensati»</b> (e.g. 4001, anno 2025).',
            '<b>«Sezione INPS»</b>: <b>«codice sede»</b>, <b>«causale contributo» PXX</b>, <b>«matricola INPS / codice INPS / filiale azienda»</b> = your codice fiscale, <b>«periodo di riferimento» da mm/aaaa a mm/aaaa</b>, and the amount.',
            'Check that <b>«saldo finale»</b> is the same as this app\'s <b>F24 total</b>. If it is <b>0,00</b>, that\'s fine: it still has to be sent.',
            'If there is something to pay: give the <b>IBAN</b> to be charged and the <b>«data di versamento»</b>.',
            'Any F24 with a <b>credit line</b> («importi a credito compensati») must be sent with <b>F24 web</b>, even if the total is above 0: not from the bank app.',
            'Send, then download the <b>«ricevuta» / «quietanza»</b> only when its state shows <b>«acquisito»</b>, and attach it here with <b>Mark as sent / paid</b>.'
        ]) + note, false, 'taxHelpF24')}

        ${box('How to send the Modello Redditi PF (by 31 October)', ol([
            `Open ${a(AREA, '«Area riservata»')}, log in, then <b>«Dichiarazione precompilata»</b> → <b>«Redditi PF»</b> (also called <b>«Redditi Web»</b>).`,
            'Open the dichiarazione for the right year and choose to <b>«Modifica»</b> it: forfettario income is not pre-filled.',
            '<b>«Quadro LM»</b> sezione III: «codice attività» <b>855201</b>, «coefficiente di redditività» <b>78%</b>, «componenti positivi» = your ricavi, then reddito and «imposta sostitutiva» — numbers are in <b>Calculation for tax year</b> below.',
            '<b>«Quadro RR» sezione II</b> (Gestione separata): «reddito», «aliquota», «contributo dovuto», «acconto versato».',
            '<b>«Quadro RX»</b>: check credits and debts, and choose to keep credits <b>«da utilizzare in compensazione»</b>.',
            'If you also had a job (employee income), its <b>CU</b> is already in <b>«Quadro RC»</b> — check it matches.',
            '<b>«Invia»</b>, then save the <b>«ricevuta»</b> once it shows <b>«acquisita»</b>, and enter the <b>protocollo</b> in <b>Enter dichiarazione figures</b> (or in <b>Redditi checklist</b>).'
        ]) + note)}

        ${box('Official links to study (F24, codici tributo, rules)', '<div style="font-weight:700; margin-top:8px;">Agenzia delle Entrate</div><ul style="margin:4px 0 0 18px; padding:0;"><li><a href="https://www1.agenziaentrate.gov.it/servizi/codici/ricerca/index.php" target="_blank" rel="noopener">«Ricerca codici tributo» — look up any codice tributo (1790, 1791, 1792, 4001, 1668…)</a></li><li><a href="https://www.agenziaentrate.gov.it/portale/strumenti/codici-attivita-e-tributo/f24-codici-tributo-per-i-versamenti" target="_blank" rel="noopener">«F24 - Codici tributo per i versamenti» — all code tables</a></li><li><a href="https://www.agenziaentrate.gov.it/portale/web/guest/schede/pagamenti/f24/come-effettuare-versamenti-f24" target="_blank" rel="noopener">«F24 - Come effettuare i versamenti» — incl. F24 a saldo zero</a></li><li><a href="https://www.agenziaentrate.gov.it/portale/web/guest/schede/pagamenti/f24/compilazione-invio-f24-via-web" target="_blank" rel="noopener">«F24 - Compilazione e invio via web»</a></li><li><a href="https://telematici.agenziaentrate.gov.it/Main/F24web.jsp" target="_blank" rel="noopener">«F24 web» service (log in with SPID/CIE)</a></li><li><a href="https://www.agenziaentrate.gov.it/portale/regime-forfetario-le-regole-2020-/infogen-regime-forfetario-le-regole-2020-" target="_blank" rel="noopener">«Regime forfetario» — the rules</a></li><li><a href="https://www.agenziaentrate.gov.it/portale/modello-redditi-persone-fisiche-2026/modello-e-istruzioni" target="_blank" rel="noopener">«Modello Redditi Persone fisiche 2026 - Modello e istruzioni» (fascicolo 3 = quadro LM)</a></li><li><a href="https://infoprecompilata.agenziaentrate.gov.it/portale/quadro-lm" target="_blank" rel="noopener">«Quadro LM» — guide on the precompilata site</a></li></ul><div style="font-weight:700; margin-top:8px;">INPS</div><ul style="margin:4px 0 0 18px; padding:0;"><li><a href="https://www.inps.it/it/it/dettaglio-approfondimento.schede-informative.49920.F24-per-professionisti-iscritti-alla-Gestione-Separata.html" target="_blank" rel="noopener">«F24 per professionisti iscritti alla Gestione Separata» — causale PXX, deadlines, rate</a></li><li><a href="https://www.inps.it/it/it/inps-comunica/notizie/dettaglio-news-page.news.2026.02.gestione-separata-le-aliquote-contributive-per-il-2026.html" target="_blank" rel="noopener">«Gestione Separata: le aliquote contributive per il 2026» (26,07%)</a></li><li><a href="https://www.inps.it/content/dam/inps-site/it/scorporati/circolari-e-messaggi/2026/02/Circolare_15153/Allegati/16573_Circolare-numero-8-del-03-02-2026.pdf" target="_blank" rel="noopener">«Circolare n. 8 del 03/02/2026» (PDF)</a></li></ul><div style="color:var(--ink-faint); margin-top:6px;">Official sites change now and then: if a link stops working, search its Italian title on the AdE or INPS site. Always check the «Ultimo aggiornamento» date.</div>')}

        ${box('What to do every year (scadenze)', ol([
            '<b>All year</b>: make your fatture in this app — they are your ricavi. Forfettario limit: €85.000 a year.',
            '<b>By 16 March</b>: the <b>CU</b> of every job arrives (also in the precompilata). Enter it in <b>Job income (CU)</b> and check it shows ✅.',
            '<b>From about 20 May</b>: the precompilata can be sent. Prepare the <b>Modello Redditi</b> (<b>Redditi checklist</b>) and the June <b>F24</b> together.',
            '<b>Every May</b>: check on the AdE site whether the deadlines were extended («proroga»).',
            '<b>Bollo on fatture</b> (€2 above €77,47): <b>31/05</b> (Jan–Mar, code 2521), <b>30/09</b> (Apr–Jun, 2522), <b>30/11</b> (Jul–Sep, 2523), <b>28/02</b> of the next year (Oct–Dec, 2524).',
            '<b>By 30 June</b> (or 30 July with +0,40% «maggiorazione»): F24 with the <b>saldo</b> of last year (imposta <b>1792</b> + INPS <b>PXX</b>) and the <b>1° acconto</b> (<b>1790</b> + INPS). If credits make it zero, send it with «F24 web».',
            '<b>By 31 October</b>: send the <b>Modello Redditi PF</b> (see «How to send the Modello Redditi PF»).',
            '<b>By 30 November</b>: F24 with the <b>2° acconto</b> (<b>1791</b> + INPS).',
            '<b>Every time</b>: after sending, press <b>Mark as sent / paid</b> here and attach the «quietanza».',
            'The <b>5% rate</b> applies for your first 5 years (2025–2029), then <b>15%</b>. Dates and rules can change: check the AdE site each year.'
        ]), true)}`;
}

// ---------- modals ----------
function taxModal(title, bodyHtml, footerHtml) {
    document.getElementById('taxGenModalTitle').textContent = title;
    document.getElementById('taxGenModalBody').innerHTML = bodyHtml;
    document.getElementById('taxGenModalFooter').innerHTML = footerHtml;
    document.getElementById('taxGenericModal').style.display = 'flex';
}
function closeTaxModal2() { document.getElementById('taxGenericModal').style.display = 'none'; }
const taxField = (id, label, value, type = 'text', extra = '') =>
    `<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${escapeHtml(value == null ? '' : String(value))}" ${extra}></div>`;

function openTaxCreditModal(id) {
    const c = id ? taxCredits.find((x) => x.id === id) : null;
    taxModal(c ? 'Edit credit' : 'New credit',
        `<p style="font-size:0.84em; color:var(--ink-soft); margin-top:0;">Copy the data from <b>«Quadro RX»</b> of the dichiarazione (column «Credito da utilizzare in compensazione»).</p>
        ${taxField('tcOrigine', 'Description', c ? c.origine : 'IRPEF a credito — Redditi ' + new Date().getFullYear() + ' (RX1)')}
        <div style="display:flex; gap:10px;">${taxField('tcCodice', 'Codice tributo (4001 = IRPEF, 1792 = imposta sostitutiva)', c ? c.codice_tributo : '4001')}${taxField('tcAnno', 'Anno di riferimento (year)', c ? c.anno_riferimento : new Date().getFullYear() - 1, 'number')}</div>
        ${taxField('tcImporto', 'Amount (€)', c ? c.importo : '', 'number', 'step="0.01" min="0"')}
        ${taxField('tcNote', 'Notes', c ? c.note : '')}`,
        `${c ? `<button class="btn btn-danger" onclick="deleteTaxCredit(${c.id})">${icon('trash', 15)}</button>` : ''}
        <div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Cancel</button><button class="btn btn-primary" onclick="saveTaxCredit(${c ? c.id : 'null'})">Save</button></div>`);
}
async function saveTaxCredit(id) {
    const v = (k) => document.getElementById(k).value.trim();
    const row = { origine: v('tcOrigine'), codice_tributo: v('tcCodice'), anno_riferimento: Number(v('tcAnno')), importo: Number(v('tcImporto')), note: v('tcNote') || null };
    if (!row.origine || !row.codice_tributo || !row.anno_riferimento || !(row.importo > 0)) { alert('Fill in description, codice tributo, year and amount.'); return; }
    const { error } = id ? await supabaseClient.from('tax_credits').update(row).eq('id', id) : await supabaseClient.from('tax_credits').insert(row);
    if (error) { alert('Could not save: ' + error.message); return; }
    closeTaxModal2(); await loadTaxData(); renderTaxTab();
}
async function deleteTaxCredit(id) {
    if (taxCreditUsed(id) > 0 && !confirm('This credit was already used in a recorded F24. Delete it anyway?')) return;
    if (!confirm('Delete this credit?')) return;
    await supabaseClient.from('tax_credits').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    closeTaxModal2(); await loadTaxData(); renderTaxTab();
}

function openTaxYearModal(anno) {
    const o = taxYears[anno] || {};
    const fy = taxYearFigures(anno);
    taxModal(`Dichiarazione figures — income ${anno} (Modello Redditi ${anno + 1})`,
        `<p style="font-size:0.84em; color:var(--ink-soft); margin-top:0;">Copy the numbers from the dichiarazione that was sent. Leave empty what you don't have: the app calculates it.</p>
        <div style="display:flex; gap:10px;">${taxField('tyRicavi', 'Ricavi — «componenti positivi» (LM22 col. 3)', o.ricavi ?? '', 'number', `step="0.01" placeholder="${fy.ricaviCalc}"`)}${taxField('tyReddito', '«Reddito lordo» (LM34)', o.reddito ?? '', 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('tyImposta', '«Imposta sostitutiva» (LM39)', o.imposta ?? '', 'number', 'step="0.01"')}${taxField('tyInps', 'INPS «contributo dovuto» (RR5 col. 15)', o.inps ?? '', 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('tyA1i', `1° acconto imposta ${anno + 1} — 5% tax (empty if none)`, o.acconto1_imposta ?? '', 'number', 'step="0.01"')}${taxField('tyA2i', `2° acconto imposta ${anno + 1} — 5% tax (empty if none)`, o.acconto2_imposta ?? '', 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('tyA1p', `1° acconto INPS ${anno + 1} — pension`, o.acconto1_inps ?? '', 'number', 'step="0.01"')}${taxField('tyA2p', `2° acconto INPS ${anno + 1} — pension`, o.acconto2_inps ?? '', 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('tyProt', '«Protocollo» (from the ricevuta)', o.dichiarazione_protocollo ?? '')}${taxField('tyData', 'Date sent', o.dichiarazione_data ?? '', 'date')}</div>
        <div class="field"><label>Dichiarazione PDF (Modello Redditi ${anno + 1})</label>
            ${o.dichiarazione_pdf_path ? `<div style="margin-bottom:6px;"><button type="button" class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(o.dichiarazione_pdf_path)}')">Open current PDF</button> <span style="font-size:0.8em; color:var(--ink-faint);">choose a file below only to replace it</span></div>` : ''}
            <input id="tyPdf" type="file" accept="application/pdf"></div>`,
        `${taxYears[anno] ? `<button class="btn btn-danger" onclick="deleteTaxYear(${anno})">${icon('trash', 15)}</button>` : ''}
        <div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Cancel</button><button class="btn btn-primary" onclick="saveTaxYear(${anno})">Save</button></div>`);
}
async function saveTaxYear(anno) {
    const n = (k) => { const v = document.getElementById(k).value; return v === '' ? null : Number(v); };
    const row = {
        anno, ricavi: n('tyRicavi'), reddito: n('tyReddito'), imposta: n('tyImposta'), inps: n('tyInps'),
        acconto1_imposta: n('tyA1i'), acconto2_imposta: n('tyA2i'), acconto1_inps: n('tyA1p'), acconto2_inps: n('tyA2p'),
        dichiarazione_protocollo: document.getElementById('tyProt').value.trim() || null,
        dichiarazione_data: document.getElementById('tyData').value || null,
        updated_at: new Date().toISOString()
    };
    const pdf = document.getElementById('tyPdf')?.files?.[0];
    if (pdf) {
        const path = `tasse/redditi_${anno + 1}_${Date.now()}.pdf`;
        const { error: upErr } = await supabaseClient.storage.from(TAX_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: false });
        if (upErr) { alert('PDF not uploaded: ' + upErr.message); return; }
        row.dichiarazione_pdf_path = path;
    }
    const { error } = await supabaseClient.from('tax_years').upsert(row, { onConflict: 'anno' });
    if (error) { alert('Could not save: ' + error.message); return; }
    closeTaxModal2(); await loadTaxData(); renderTaxTab();
}
async function deleteTaxYear(anno) {
    if (!confirm(`Remove the official ${anno} figures? The app will go back to estimating them from your fatture.`)) return;
    await supabaseClient.from('tax_years').delete().eq('anno', anno);
    closeTaxModal2(); await loadTaxData(); renderTaxTab();
}

function openMarkTaxDone(key) {
    const P = Number(key.slice(0, 4));
    const d = taxDeadlinesFor(P).find((x) => x.key === key);
    if (!d) return;
    const draft = taxApplyCredits(d.lines);
    taxMarkDraft = draft.all.map((l) => ({ ...l }));
    const rows = taxMarkDraft.map((l, i) => {
        const what = l.sezione === 'INPS' ? `INPS PXX · ${escapeHtml(l.periodo || '')}` : `ERARIO ${escapeHtml(l.codice)} · ${l.anno}`;
        const isCr = l.tipo === 'credito';
        return `<tr><td style="padding:4px 8px 4px 0;">${what} <span style="color:var(--ink-faint);">(${isCr ? 'credit' : 'debit'})</span></td>
            <td style="padding:4px 0; text-align:right;"><input id="tfAmt${i}" type="number" step="0.01" min="0" value="${r2(isCr ? l.credito : l.debito).toFixed(2)}" style="width:110px; text-align:right;" oninput="taxMarkTotal()"></td></tr>`;
    }).join('');
    taxModal('Mark F24 as sent / paid',
        `<p style="font-size:0.86em; margin-top:0;">${d.title}</p>
        <div style="font-size:0.82em; color:var(--ink-soft); margin-bottom:6px;">Check each amount against your real F24 (in the «Cassetto fiscale» → «Consultazioni» → «Versamenti» → «F24») and change it if it is different.</div>
        <table style="width:100%; font-size:0.86em; border-collapse:collapse; margin-bottom:6px;">${rows}</table>
        <div style="font-size:0.82em; margin-bottom:6px;">Extra ERARIO row on your F24 (only if there is one more):
            <select id="tfXCod" onchange="taxMarkTotal()"><option value="">— none —</option><option value="1790">1790 (1° acconto)</option><option value="1791">1791 (2° acconto / unica soluzione)</option><option value="1792">1792 (saldo)</option></select>
            anno <input id="tfXAnno" type="number" value="${P}" style="width:70px;">
            € <input id="tfXAmt" type="number" step="0.01" min="0" value="0" style="width:90px; text-align:right;" oninput="taxMarkTotal()"></div>
        <p style="font-size:0.86em;">F24 total: <b id="tfTotal">${eur(draft.totale)}</b></p>
        ${taxField('tfData', 'Date sent / paid («data di versamento»)', formatLocalDate(new Date()), 'date')}
        <div class="field"><label>F24 receipt — «quietanza» (PDF, optional)</label><input id="tfReceipt" type="file" accept="application/pdf,image/*"></div>
        <div style="font-size:0.8em; color:var(--ink-faint);">Credits used will be subtracted from what's left.</div>`,
        `<div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Cancel</button><button class="btn btn-success" onclick="saveTaxDone('${key}')">Confirm</button></div>`);
}
let taxMarkDraft = [];
function taxMarkTotal() {
    const t = taxMarkDraft.reduce((s, l, i) => {
        const v = Number(document.getElementById('tfAmt' + i).value || 0);
        return s + (l.tipo === 'credito' ? -v : v);
    }, 0) + (document.getElementById('tfXCod').value ? Number(document.getElementById('tfXAmt').value || 0) : 0);
    document.getElementById('tfTotal').textContent = eur(r2(t));
}
async function saveTaxDone(key) {
    const P = Number(key.slice(0, 4));
    const d = taxDeadlinesFor(P).find((x) => x.key === key);
    const all = taxMarkDraft.map((l, i) => {
        const v = r2(Number(document.getElementById('tfAmt' + i).value || 0));
        return l.tipo === 'credito' ? { ...l, credito: v } : { ...l, debito: v };
    }).filter((l) => (l.tipo === 'credito' ? l.credito : l.debito) > 0);
    const xCod = document.getElementById('tfXCod').value;
    const xAmt = r2(Number(document.getElementById('tfXAmt').value || 0));
    if (xCod && xAmt > 0) {
        all.unshift({ sezione: 'ERARIO', codice: xCod, anno: Number(document.getElementById('tfXAnno').value), tipo: { 1790: 'acconto1', 1791: 'acconto2', 1792: 'saldo' }[xCod], debito: xAmt, credito: 0 });
    }
    const totale = r2(all.reduce((s, l) => s + Number(l.debito || 0) - Number(l.credito || 0), 0));
    const draft = { all, totale };
    const data = document.getElementById('tfData').value;
    if (!data) { alert('Choose the date.'); return; }
    let receipt_path = null;
    const file = document.getElementById('tfReceipt').files[0];
    if (file) {
        const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'pdf';
        const path = `tasse/f24_${key}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabaseClient.storage.from(TAX_BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
        if (upErr) { alert('Receipt not uploaded: ' + upErr.message); return; }
        receipt_path = path;
    }
    const { error } = await supabaseClient.from('tax_f24').insert({ data, scadenza: key, descrizione: d.title, righe: draft.all, totale: draft.totale, receipt_path });
    if (error) { alert('Could not save: ' + error.message); return; }
    closeTaxModal2(); await loadTaxData(); renderTaxTab(); renderTaxReminder();
}
async function deleteTaxF24(id) {
    if (!confirm('Remove this F24 from the record? (Nothing changes at AdE; its credits become available again here.)')) return;
    await supabaseClient.from('tax_f24').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await loadTaxData(); renderTaxTab(); renderTaxReminder();
}

function openTaxSettings() {
    if (taxMissing) { alert('Run tax_tab.sql in Supabase first.'); return; }
    const s = taxSettings || {};
    taxModal('Tax settings',
        `<div style="display:flex; gap:10px;">${taxField('tsAliq', 'Start-up rate % («aliquota agevolata»)', s.aliquota_agevolata ?? 5, 'number', 'step="0.01"')}${taxField('tsAliqOrd', 'Standard rate % («aliquota ordinaria»)', s.aliquota_ordinaria ?? 15, 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('tsInizio', 'Year the activity started', s.anno_inizio ?? 2025, 'number')}${taxField('tsAnni', 'Years at the start-up rate', s.anni_agevolati ?? 5, 'number')}</div>
        <div style="display:flex; gap:10px;">${taxField('tsCoeff', '«Coefficiente di redditività» % (ATECO 85.52.01 = 78)', s.coefficiente ?? 78, 'number', 'step="0.01"')}${taxField('tsInps', 'INPS Gestione Separata rate %', s.inps_aliquota ?? 26.07, 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('tsSede', 'INPS «codice sede» (for the F24)', s.inps_sede ?? '')}${taxField('tsInt', 'Monthly interest on rate %', s.interesse_mensile ?? 0.33, 'number', 'step="0.01"')}</div>
        <div style="font-size:0.8em; color:var(--ink-faint);">Find the INPS «codice sede» in the INPS «Cassetto previdenziale» or on an earlier F24 (Sezione INPS) in «Versamenti F24». «Matricola» = your codice fiscale (from the fattura settings).</div>`,
        `<div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Cancel</button><button class="btn btn-primary" onclick="saveTaxSettings()">Save</button></div>`);
}
async function saveTaxSettings() {
    const n = (k) => Number(document.getElementById(k).value);
    const row = {
        id: 1, aliquota_agevolata: n('tsAliq'), aliquota_ordinaria: n('tsAliqOrd'), anno_inizio: n('tsInizio'), anni_agevolati: n('tsAnni'),
        coefficiente: n('tsCoeff'), inps_aliquota: n('tsInps'), inps_sede: document.getElementById('tsSede').value.trim() || null,
        interesse_mensile: n('tsInt'), updated_at: new Date().toISOString()
    };
    const { error } = await supabaseClient.from('tax_settings').upsert(row, { onConflict: 'id' });
    if (error) { alert('Could not save: ' + error.message); return; }
    closeTaxModal2(); await loadTaxData(); renderTaxTab();
}

// Students-tab reminder: the next F24 deadline within 30 days, not done yet.
// ---------- Imposta di bollo (€2 on fatture above €77.47) ----------
// Every quarter AdE lists the fatture with the bollo (Elenco A: declared in the
// XML) and the ones that should have had it (Elenco B, e.g. older ones made
// without it). Paid from «Fatture e Corrispettivi» or by F24 2521–2524.
const BOLLO_QUARTERS = {
    1: { code: '2521', months: 'Jan–Mar', due: (y) => `${y}-05-31` },
    2: { code: '2522', months: 'Apr–Jun', due: (y) => `${y}-09-30` },
    3: { code: '2523', months: 'Jul–Sep', due: (y) => `${y}-11-30` },
    4: { code: '2524', months: 'Oct–Dec', due: (y) => `${y + 1}-02-${(y + 1) % 4 === 0 ? '29' : '28'}` }
};
function bolloAddDays(iso, n) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
}
// AdE can't debit on Saturday/Sunday: the next weekday from a date.
function bolloWeekday(iso) {
    let d = iso;
    while ([0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay())) d = bolloAddDays(d, 1);
    return d;
}
function bolloSuggestedDate(x) {
    const today = formatLocalDate(new Date());
    return bolloWeekday(today > x.from ? today : x.from);
}
function bolloQuarters() {
    if (typeof fattureList === 'undefined') return [];
    const map = new Map();
    fattureList.filter((f) => f.status !== 'rejected' && Number(f.importo) > 77.47).forEach((f) => {
        const d = String(f.data_fattura).slice(0, 10);
        const y = Number(d.slice(0, 4)), q = Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1;
        const key = `bollo-${y}-Q${q}`;
        if (!map.has(key)) map.set(key, { key, y, q, ...BOLLO_QUARTERS[q], due: BOLLO_QUARTERS[q].due(y), fatture: [] });
        map.get(key).fatture.push(f);
    });
    return [...map.values()].map((x) => {
        const endMonth = x.q * 3;                                   // 3, 6, 9, 12
        const fromY = endMonth === 12 ? x.y + 1 : x.y;
        const fromM = endMonth === 12 ? 1 : endMonth + 1;
        const from = `${fromY}-${String(fromM).padStart(2, '0')}-15`; // AdE list ready
        const target = bolloAddDays(from, 14);                       // pay within 2 weeks
        return { ...x, from, target, amount: 2 * x.fatture.length, paid: taxF24ForDeadline(x.key) };
    })
        .sort((a, b) => a.due.localeCompare(b.due));
}
// Bollo quarters as deadline cards, in the same lists as the F24s (Next
// deadline / Later / Done). Headline = the planned pay-by date (two weeks
// after AdE's list is ready); the legal deadline is shown too.
function bolloDeadlines() {
    return bolloQuarters().map((x) => {
        const fmt = (iso) => iso.split('-').reverse().join('/');
        return { key: x.key, date: x.target, title: `${fmt(x.target)} — Imposta di bollo Q${x.q} ${x.y} (${x.months})`, bollo: x };
    });
}
function bolloDeadlineCardHtml(x) {
    const today = formatLocalDate(new Date());
    const fmt = (iso) => iso.split('-').reverse().join('/');
    const notYet = !x.paid && today < x.from;
    const overdue = !x.paid && x.due < today;
    const late = !x.paid && !overdue && today > x.target;
    const tone = x.paid || notYet ? '' : overdue || late ? TAX_TONE.red : TAX_TONE.green;
    const badge = x.paid ? `<span class="badge badge-success">Paid ${formatShortDate(x.paid.data)}</span>`
        : overdue ? `<span class="badge badge-danger">Overdue — legal deadline was ${fmt(x.due)}</span>`
        : late ? `<span class="badge badge-danger">Late on your plan — legal deadline ${fmt(x.due)}</span>`
        : notYet ? `<span class="badge badge-neutral">Pay between ${fmt(x.from)} – ${fmt(x.target)}</span>`
        : `<span class="badge badge-warning">To do — by ${fmt(x.target)}</span>`;
    const chips = x.fatture.map((f) => {
        const st = (typeof students !== 'undefined' && students.find((s) => s.id === f.student_id)) || null;
        const inXml = String(f.xml || '').includes('<DatiBollo>');
        return `<span class="badge ${inXml ? 'badge-neutral' : 'badge-warning'}" title="${inXml ? 'Bollo in the XML: AdE lists it in Elenco A' : 'Made without bollo: AdE lists it in Elenco B, confirm it there'}">${f.numero}/${String(f.anno).slice(-2)} · ${escapeHtml(st ? st.name : (f.recipient_cognome || ''))} · €${Number(f.importo).toFixed(2).replace('.', ',')}${inXml ? '' : ' · Elenco B'}</span>`;
    }).join(' ');
    const d = { title: `${fmt(x.target)} — Imposta di bollo Q${x.q} ${x.y} (${x.months})` };
    return `<div class="card" style="padding:12px 16px; font-size:0.88em;${x.paid ? ' opacity:0.75;' : ''}${tone}">
        ${taxDeadlineHeadHtml(d, badge)}
        <div style="margin-top:6px;">${x.fatture.length} fattur${x.fatture.length === 1 ? 'a' : 'e'} over €77,47 · <b>${eur(x.amount)}</b> · code <b>${x.code}</b> <span style="color:var(--ink-faint);">· legal deadline ${fmt(x.due)}</span></div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;">${chips}</div>
        ${x.paid ? `<div style="margin-top:8px;"><button class="btn btn-outline btn-sm" onclick="deleteTaxF24(${x.paid.id})">Undo «paid»</button></div>`
            : notYet ? `<div style="margin-top:8px; font-size:0.85em; color:var(--ink-faint);">AdE prepares the list by <b>${fmt(x.from)}</b>: it can't be paid before. Nothing to do now.</div>`
            : `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-top:8px;">
                <span>Suggested date («data versamento», a weekday): <b>${fmt(bolloSuggestedDate(x))}</b></span>
                <button class="btn btn-success btn-sm" onclick="markBolloPaid('${x.key}')">Mark paid</button>
            </div>
            <details open style="font-size:0.9em; color:var(--ink-soft); margin-top:8px;">
                <summary style="cursor:pointer; font-weight:600;">How to pay (step by step)</summary>
                <ol style="margin:8px 0 0 18px; padding:0; line-height:1.6;">
                    <li>Open <a href="https://ivaservizi.agenziaentrate.gov.it/portale/" target="_blank" rel="noopener">«Fatture e Corrispettivi»</a> and log in with SPID/CIE.</li>
                    <li><b>«Fatture elettroniche e altri dati IVA»</b> → <b>«Pagamento imposta di bollo»</b>.</li>
                    <li>Choose year <b>${x.y}</b> and quarter («trimestre») <b>${x.q}</b>.</li>
                    <li><b>Elenco A</b>: fatture with the bollo in the XML. <b>Elenco B</b>: fatture that should have it (marked «Elenco B» above) → <b>select them and confirm</b>.</li>
                    <li><b>«Procedi al pagamento»</b> → your <b>IBAN</b> (account in your name) → <b>«Data versamento»</b>: the suggested date → tick both boxes → <b>«Inoltra pagamento»</b>. (Or an F24: code ${x.code}, year ${x.y}.)</li>
                    <li>Come back here → <b>Mark paid</b>.</li>
                </ol>
            </details>`}
    </div>`;
}
async function markBolloPaid(key) {
    const x = bolloQuarters().find((q) => q.key === key);
    if (!x) return;
    if (!confirm(`Mark the bollo of Q${x.q} ${x.y} (${eur(x.amount)}, code ${x.code}) as paid today?`)) return;
    const { error } = await supabaseClient.from('tax_f24').insert({
        data: formatLocalDate(new Date()), scadenza: key, descrizione: `Imposta di bollo Q${x.q} ${x.y}`,
        righe: [{ sezione: 'ERARIO', codice: x.code, anno: x.y, tipo: 'bollo', debito: x.amount, credito: 0 }], totale: x.amount
    });
    if (error) { alert('Could not save: ' + error.message); return; }
    await loadTaxData(); renderTaxTab(); renderTaxReminder();
}

function renderTaxReminder() {
    const card = document.getElementById('taxReminderCard');
    if (!card) return;
    if (taxMissing || !taxSettings) { card.classList.add('hidden'); return; }
    const today = formatLocalDate(new Date());
    const limit = addDaysToDate(today, 30);
    const nowY = new Date().getFullYear();
    const all = [...taxDeadlinesFor(nowY), ...taxDeadlinesFor(nowY + 1)];
    const next = all
        .filter((d) => d.lines && d.lines.length && !taxF24ForDeadline(d.key) && d.date >= addDaysToDate(today, -60)
            && (d.key.endsWith('-06') ? today >= taxDeadlineWindow(d).from : d.date <= limit))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
    // Modello Redditi: from 20 May until it's sent (protocollo saved)
    const redditi = all.find((d) => d.lines === null && today >= taxDeadlineWindow(d).from && d.date >= today
        && !taxYears[Number(d.key.slice(0, 4)) - 1]?.dichiarazione_protocollo);
    const bollo = bolloQuarters().filter((x) => !x.paid && today >= x.from)[0];
    card.classList.toggle('hidden', !next && !bollo && !redditi);
    if (!next && !bollo && !redditi) return;
    const lines = [];
    if (redditi) lines.push(`<b>Modello Redditi ${Number(redditi.key.slice(0, 4)) - 1}:</b> do it between <b>${taxDeadlineWindow(redditi).text}</b>, together with the F24 saldo + 1° acconto (legal deadline ${redditi.date.split('-').reverse().join('/')}). Go to Taxes → <a href="#" onclick="switchTab('tasse'); setTaxView('check'); return false;">«Redditi checklist»</a> and follow the instructions.`);
    if (next) {
        const draft = taxApplyCredits(next.lines);
        lines.push(`<b>Tax deadline:</b> ${next.title} · F24 total <b>${eur(draft.totale)}</b>${draft.totale === 0 ? ' («F24 a saldo zero» — still to send)' : ''}`);
    }
    if (bollo) lines.push(`<b>Imposta di bollo</b> Q${bollo.q} ${bollo.y}: <b>${eur(bollo.amount)}</b> (${bollo.fatture.length} fattur${bollo.fatture.length === 1 ? 'a' : 'e'}) · pay on <b>${bolloSuggestedDate(bollo).split('-').reverse().join('/')}</b> (weekday)${today > bollo.target ? ' · <b style="color:var(--danger);">please pay now</b>' : ''}`);
    card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-size:0.9em; line-height:1.6;">${lines.join('<br>')}</span>
        <button class="btn btn-primary btn-sm" onclick="switchTab('tasse')">Open Taxes</button></div>`;
}
