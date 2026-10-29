// ============================================================================
// jobincome.js — admin.html only (job_income.sql). Two parts of the Tasse tab:
//
//   «Job income (CU)»   every job / tirocinio of a year with its monthly buste
//                       paga (running total = the CU to expect), the CU itself
//                       when it arrives in March (✅/⚠️ against the buste paga),
//                       and a month-by-month table of ALL income (studio +
//                       job) for the user's own overview.
//   «Redditi checklist» the checks to do before sending the Modello Redditi,
//                       with the figures the app already knows next to each.
//
// Nothing is sent anywhere. Relies on tasse.js / admin.html / fatture.js
// globals at call time (taxModal, taxField, eur, r2, viewTaxPdf…).
// ============================================================================

let jobSources = [];
let jobPayslips = [];
let redditiChecklist = {};   // { [anno]: row }
let jobMissing = false;

const JOB_TIPO = { dipendente: 'Lavoro dipendente', tirocinio: 'Tirocinio (reddito assimilato)', altro: 'Altro' };
const JOB_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

async function loadJobData() {
    try {
        const [s, p, c] = await Promise.all([
            supabaseClient.from('job_sources').select('*').is('deleted_at', null).order('dal', { ascending: true }),
            supabaseClient.from('job_payslips').select('*').is('deleted_at', null).order('mese', { ascending: true }),
            supabaseClient.from('redditi_checklist').select('*')
        ]);
        const err = s.error || p.error || c.error;
        if (err) throw err;
        jobSources = s.data || [];
        jobPayslips = p.data || [];
        redditiChecklist = {};
        (c.data || []).forEach((r) => { redditiChecklist[r.anno] = r; });
        jobMissing = false;
    } catch (e) {
        console.error('Job income not available (has job_income.sql been run?):', e);
        jobMissing = true;
    }
}

// ---------- view switch (top of the Tasse tab) ----------
function taxCurrentView() {
    try { return localStorage.getItem('taxView') || 'studio'; } catch (e) { return 'studio'; }
}
function setTaxView(v) {
    try { localStorage.setItem('taxView', v); } catch (e) { /* only a convenience */ }
    renderTaxTab();
}
function taxViewPills() {
    const v = taxCurrentView();
    const pill = (key, label) => `<button class="tax-pill${v === key ? ' active' : ''}" onclick="setTaxView('${key}')">${label}</button>`;
    return `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;">
        ${pill('studio', 'Studio (forfettario)')}${pill('job', 'Job income (CU)')}${pill('check', 'Redditi checklist')}</div>`;
}
const jobMissingCard = () => `<div class="placeholder-card">${icon('warning', 26)}<h3>Not set up yet</h3><div style="color:var(--ink-soft); font-size:0.88em;">Run job_income.sql in Supabase, then refresh the page.</div></div>`;

// ---------- figures ----------
const jobNum = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
function jobSourcesOf(anno) { return jobSources.filter((s) => s.anno === anno); }
function jobPayslipsOf(sourceId) { return jobPayslips.filter((p) => p.source_id === sourceId).sort((a, b) => String(a.mese).localeCompare(String(b.mese))); }
function jobExpectedCu(sourceId) {
    const ps = jobPayslipsOf(sourceId);
    const sum = (k) => r2(ps.reduce((s, p) => s + Number(p[k] || 0), 0));
    return { mesi: ps.length, lordo: sum('lordo'), imponibile: sum('imponibile'), irpef: sum('irpef'), netto: sum('netto') };
}
// CU against the buste paga: income = imponibile, ritenute = IRPEF. Within €1 = ✅.
function jobCuCheck(src) {
    if (jobNum(src.cu_reddito) === null && jobNum(src.cu_ritenute) === null) return null;
    const exp = jobExpectedCu(src.id);
    const one = (cu, mine) => (cu === null ? null : { cu, mine, diff: r2(cu - mine), ok: Math.abs(cu - mine) <= 1 });
    return { reddito: one(jobNum(src.cu_reddito), exp.imponibile), ritenute: one(jobNum(src.cu_ritenute), exp.irpef) };
}
const jobCuReceived = (src) => !!(src.cu_pdf_path || jobNum(src.cu_reddito) !== null);

// Studio income per month = the Studio view's «App estimate»: the fatture
// register (not rejected) by fattura date, so the year adds up to the same
// ricavi (taxRicaviFromFatture). Expenses are NOT taken off.
function studioRicaviByMonth(anno) {
    const out = Array(12).fill(0);
    (typeof fattureList !== 'undefined' ? fattureList : []).filter((f) => f.anno === anno && f.status !== 'rejected').forEach((f) => {
        const m = Number(String(f.data_fattura || '').slice(5, 7));
        if (m >= 1 && m <= 12) out[m - 1] += fatturaSign(f) * Number(f.importo || 0);
    });
    return out.map(r2);
}
function jobByMonth(anno) {
    const netto = Array(12).fill(0), lordo = Array(12).fill(0);
    const ids = new Set(jobSources.map((s) => s.id));
    jobPayslips.filter((p) => ids.has(p.source_id) && String(p.mese).slice(0, 4) === String(anno)).forEach((p) => {
        const m = Number(String(p.mese).slice(5, 7)) - 1;
        netto[m] += Number(p.netto || 0); lordo[m] += Number(p.lordo || 0);
    });
    return { netto: netto.map(r2), lordo: lordo.map(r2) };
}

// Forfettario ricavi by PAYMENT date (principio di cassa): each fattura counts
// on the date of the payment(s) it covers; one added by hand on its own date.
function ricaviByPaymentDate(anno) {
    if (typeof fattureList === 'undefined') return 0;
    let tot = 0;
    fattureList.filter((f) => f.status !== 'rejected').forEach((f) => {
        // A nota di credito counts as minus on its fattura's payment date(s);
        // a cancelled fattura keeps its payment in orig_transaction_id.
        const sign = fatturaSign(f);
        const base = sign < 0 ? fattureList.find((o) => o.id === f.collegata_id) || f : f;
        const ids = [base.transaction_id || base.orig_transaction_id, ...(base.transaction_id ? (typeof fatturaExtraIds === 'function' ? fatturaExtraIds(base) : []) : (base.orig_extra_transaction_ids || []).map(Number))].filter(Boolean);
        const txs = ids.map((id) => v2CreditTransactions.find((t) => t.id === id)).filter(Boolean);
        const imp = sign * Number(f.importo || 0);
        const txSum = txs.reduce((s, t) => s + Number(t.amount || 0), 0);
        if (!txs.length || !(txSum > 0)) { if (String(base.data_fattura).slice(0, 4) === String(anno)) tot += imp; return; }
        // A fattura covering several payments: split its amount by each payment
        txs.forEach((t) => { if (String(t.created_at).slice(0, 4) === String(anno)) tot += imp * Number(t.amount || 0) / txSum; });
    });
    return r2(tot);
}

// ---------- «Job income (CU)» ----------
function jobSelectedYear() {
    return Number(document.getElementById('jobYearSelect')?.value) || new Date().getFullYear();
}
function jobYearSelectHtml(id, sel, onchange) {
    const nowY = new Date().getFullYear();
    const years = [...new Set([nowY - 1, nowY, ...jobSources.map((s) => s.anno)])].sort((a, b) => b - a);
    return `<select id="${id}" onchange="${onchange}" style="padding:4px 8px; border-radius:var(--radius-sm); border:1px solid var(--border);">${years.map((y) => `<option value="${y}" ${y === sel ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
}
function renderJobIncome(el) {
    if (jobMissing) { el.innerHTML = taxViewPills() + jobMissingCard(); return; }
    const anno = jobSelectedYear();
    const srcs = jobSourcesOf(anno);
    const got = srcs.filter(jobCuReceived).length;
    const studio = studioRicaviByMonth(anno);
    const job = jobByMonth(anno);
    const sum = (a) => r2(a.reduce((s, x) => s + x, 0));
    const cell = (v, bold) => `<td style="padding:5px 8px; text-align:right;${bold ? ' font-weight:700;' : ''}">${v ? eur(v) : '<span style="color:var(--ink-faint);">–</span>'}</td>`;
    const th = (t, right) => `<th style="padding:6px 8px; text-align:${right ? 'right' : 'left'}; font-size:0.85em; color:var(--ink-soft);">${t}</th>`;
    const rows = JOB_MESI.map((m, i) => `<tr style="border-bottom:1px solid var(--border-soft);"><td style="padding:5px 8px;">${m}</td>${cell(studio[i])}${cell(job.netto[i])}${cell(r2(studio[i] + job.netto[i]), true)}${cell(job.lordo[i])}</tr>`).join('');
    const totalTable = `
        <div class="section-label" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">Total income ${jobYearSelectHtml('jobYearSelect', anno, 'renderTaxTab()')}
            <div style="position:relative; display:inline-block; margin-left:auto;">
                <button class="btn btn-outline btn-sm" onclick="toggleWaMenu('jobExportMenu', event)">Export ▾</button>
                <div class="wa-menu" id="jobExportMenu" style="display:none; position:absolute; top:100%; margin-top:4px; right:0; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); box-shadow:var(--shadow-md); z-index:60; min-width:220px; overflow:hidden;">
                    <button onclick="toggleWaMenu('jobExportMenu'); exportRedditiSummary('pdf');" title="Income of the year for the Questura (permesso, ricongiungimento), in Italian" style="display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:9px 12px; border:none; background:none; color:var(--ink); cursor:pointer; font-size:0.86em;">Riepilogo redditi (PDF)</button>
                    <button onclick="toggleWaMenu('jobExportMenu'); exportRedditiSummary('xlsx');" title="Income of the year for the Questura (permesso, ricongiungimento), in Italian" style="display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:9px 12px; border:none; background:none; color:var(--ink); cursor:pointer; font-size:0.86em; border-top:1px solid var(--border-soft);">Riepilogo redditi (Excel)</button>
                </div>
            </div></div>
        <div class="card" style="padding:10px 12px; margin-bottom:22px; overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.87em; min-width:480px;">
                <thead><tr>${th('Month')}${th('Studio', 1)}${th('Job (netto)', 1)}${th('Total received', 1)}${th('Job (lordo)', 1)}</tr></thead>
                <tbody>${rows}
                    <tr style="background:var(--surface-2, rgba(0,0,0,0.03));"><td style="padding:6px 8px; font-weight:700;">${anno}</td>${cell(sum(studio), 1)}${cell(sum(job.netto), 1)}${cell(r2(sum(studio) + sum(job.netto)), 1)}${cell(sum(job.lordo), 1)}</tr>
                </tbody>
            </table>
            <div style="font-size:0.8em; color:var(--ink-faint); margin-top:8px;">For your own overview. Studio = your fatture (same as the Studio «App estimate»), expenses not taken off. Job = from the buste paga entered below. Tax figures are in «Redditi checklist».</div>
        </div>`;
    const cuLine = srcs.length
        ? `<div class="card" style="padding:12px 16px; margin-bottom:14px; font-size:0.88em;">
            <b>${srcs.length} source${srcs.length > 1 ? 's' : ''} → ${got} CU received</b>
            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:6px;">${srcs.map((s) => `<span>${jobCuReceived(s) ? '✅' : '⏳'} ${escapeHtml(s.nome)}</span>`).join('')}</div>
            ${got < srcs.length ? `<div style="font-size:0.85em; color:var(--ink-faint); margin-top:6px;">CUs arrive by 16 March ${anno + 1} (by email, on the employer's portal or in the precompilata).</div>` : ''}
          </div>` : '';
    el.innerHTML = `${taxViewPills()}
        ${taxAlertsHtml()}
        ${totalTable}
        <div class="section-label">Jobs ${anno} (CU)</div>
        ${cuLine}
        ${jobChecksHtml(anno)}
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:12px;">${srcs.map(jobSourceCardHtml).join('') || '<div class="card" style="padding:12px 16px; font-size:0.88em; color:var(--ink-faint);">No job added for this year.</div>'}</div>
        <button class="btn btn-primary btn-sm" onclick="openJobSourceModal()">+ Add job / tirocinio</button>`;
}
function jobSourceCardHtml(s) {
    const ps = jobPayslipsOf(s.id);
    const exp = jobExpectedCu(s.id);
    const chk = jobCuCheck(s);
    const period = [s.dal ? formatShortDate(s.dal) : '', s.al ? formatShortDate(s.al) : 'now'].filter(Boolean).join(' → ');
    const td = (v, right) => `<td style="padding:4px 6px;${right ? ' text-align:right;' : ''}">${v}</td>`;
    const money = (v) => (jobNum(v) === null ? '<span style="color:var(--ink-faint);">–</span>' : eur(v));
    const table = ps.length ? `
        <div style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; font-size:0.85em; min-width:460px; margin-top:8px;">
            <thead><tr style="color:var(--ink-soft);">${['Mese', 'Lordo', 'Imponibile', 'IRPEF', 'Netto', ''].map((h, i) => `<th style="padding:4px 6px; text-align:${i && i < 5 ? 'right' : 'left'};">${h}</th>`).join('')}</tr></thead>
            <tbody>${ps.map((p) => `<tr style="border-top:1px solid var(--border-soft);">
                ${td(JOB_MESI[Number(String(p.mese).slice(5, 7)) - 1] + ' ' + String(p.mese).slice(0, 4))}${td(money(p.lordo), 1)}${td(money(p.imponibile), 1)}${td(money(p.irpef), 1)}${td(money(p.netto), 1)}
                ${td(`<span style="display:flex; gap:4px; justify-content:flex-end;">${p.pdf_path ? `<button class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(p.pdf_path)}')">PDF</button>` : ''}<button class="btn btn-outline btn-sm" onclick="openJobPayslipModal(${s.id}, ${p.id})">Edit</button></span>`)}</tr>`).join('')}
                <tr style="border-top:2px solid var(--border); font-weight:700;">${td('Expected CU')}${td(eur(exp.lordo), 1)}${td(eur(exp.imponibile), 1)}${td(eur(exp.irpef), 1)}${td(eur(exp.netto), 1)}${td('')}</tr>
            </tbody></table></div>` : '<div style="font-size:0.85em; color:var(--ink-faint); margin-top:8px;">No busta paga yet.</div>';
    const mark = (c) => (!c ? '' : c.ok ? '✅' : `⚠️ <span style="color:var(--danger);">${c.diff > 0 ? '+' : ''}${eur(c.diff)}</span>`);
    const cuBox = jobCuReceived(s) ? `
        <div style="margin-top:10px; padding:8px 10px; border-radius:var(--radius-sm); background:var(--bg); font-size:0.85em;">
            <b>CU received</b>${s.cu_ricevuta ? ` · ${formatShortDate(s.cu_ricevuta)}` : ''}
            <div style="display:flex; gap:16px; flex-wrap:wrap; margin-top:4px;">
                ${jobNum(s.cu_reddito) !== null ? `<span>Reddito ${eur(s.cu_reddito)} ${mark(chk && chk.reddito)}</span>` : ''}
                ${jobNum(s.cu_ritenute) !== null ? `<span>Ritenute IRPEF ${eur(s.cu_ritenute)} ${mark(chk && chk.ritenute)}</span>` : ''}
                ${jobNum(s.cu_add_regionale) !== null ? `<span>Add. regionale ${eur(s.cu_add_regionale)}</span>` : ''}
                ${jobNum(s.cu_add_comunale) !== null ? `<span>Add. comunale ${eur(s.cu_add_comunale)}</span>` : ''}
                ${jobNum(s.cu_giorni) !== null ? `<span>Giorni ${s.cu_giorni}</span>` : ''}
            </div>
            ${chk && ((chk.reddito && !chk.reddito.ok) || (chk.ritenute && !chk.ritenute.ok)) ? '<div style="color:var(--ink-faint); margin-top:4px;">⚠️ = the CU and your buste paga differ: check for a missing busta paga, a typo, or a conguaglio (tax adjustment) in the last month.</div>' : ''}
        </div>` : '';
    return `<div class="card" style="padding:12px 16px;">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; align-items:flex-start;">
            <div><b>${escapeHtml(s.nome)}</b>${s.cf_piva ? ` <span style="color:var(--ink-faint); font-size:0.85em;">· ${escapeHtml(s.cf_piva)}</span>` : ''}
                <div style="font-size:0.84em; color:var(--ink-soft);">${JOB_TIPO[s.tipo] || s.tipo}${period ? ' · ' + period : ''}</div></div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                <button class="btn btn-primary btn-sm" onclick="openJobPayslipModal(${s.id})">+ Busta paga</button>
                <button class="btn btn-outline btn-sm" onclick="openJobCuModal(${s.id})">${jobCuReceived(s) ? 'Edit CU' : 'Enter CU'}</button>
                ${s.cu_pdf_path ? `<button class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(s.cu_pdf_path)}')">CU PDF</button>` : ''}
                <button class="btn btn-outline btn-sm" onclick="openJobSourceModal(${s.id})">Edit</button>
            </div>
        </div>
        ${table}${cuBox}
    </div>`;
}

// ---------- modals ----------
async function jobUpload(file, name) {
    const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'pdf';
    const path = `lavoro/${name}_${Date.now()}.${ext}`;
    const { error } = await supabaseClient.storage.from(TAX_BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false });
    if (error) { alert('File not uploaded: ' + error.message); return null; }
    return path;
}
const jobFileField = (id, label, path) => `<div class="field"><label>${label}</label>
    ${path ? `<div style="margin-bottom:6px;"><button type="button" class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(path)}')">Open current file</button> <span style="font-size:0.8em; color:var(--ink-faint);">choose a file below only to replace it</span></div>` : ''}
    <input id="${id}" type="file" accept="application/pdf,image/*"></div>`;
const jobModalFooter = (delBtn, saveCall) => `${delBtn}<div style="display:flex; gap:8px; margin-left:auto;"><button class="btn btn-outline" onclick="closeTaxModal2()">Cancel</button><button class="btn btn-primary" onclick="${saveCall}">Save</button></div>`;
async function jobAfterSave() { closeTaxModal2(); await loadJobData(); renderTaxTab(); }

function openJobSourceModal(id) {
    const s = id ? jobSources.find((x) => x.id === id) : null;
    const anno = s ? s.anno : jobSelectedYear();
    taxModal(s ? 'Edit job' : `New job / tirocinio — ${anno}`,
        `${taxField('jsNome', 'Employer / ente (name on the busta paga)', s ? s.nome : '')}
        <div style="display:flex; gap:10px;">${taxField('jsCf', 'Employer P.IVA / C.F.', s ? s.cf_piva : '')}
            <div class="field"><label>Type</label><select id="jsTipo">${Object.entries(JOB_TIPO).map(([k, l]) => `<option value="${k}" ${(s ? s.tipo : 'dipendente') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div style="display:flex; gap:10px;">${taxField('jsDal', 'From', s ? s.dal : '', 'date')}${taxField('jsAl', 'To (empty = still working)', s ? s.al : '', 'date')}</div>
        ${taxField('jsAnno', 'Tax year (the CU of this year)', anno, 'number')}
        ${taxField('jsNote', 'Notes', s ? s.note : '')}`,
        jobModalFooter(s ? `<button class="btn btn-danger" onclick="deleteJobSource(${s.id})">${icon('trash', 15)}</button>` : '', `saveJobSource(${s ? s.id : 'null'})`));
}
async function saveJobSource(id) {
    const v = (k) => document.getElementById(k).value.trim();
    const row = { nome: v('jsNome'), cf_piva: v('jsCf') || null, tipo: v('jsTipo'), dal: v('jsDal') || null, al: v('jsAl') || null, anno: Number(v('jsAnno')), note: v('jsNote') || null };
    if (!row.nome || !row.anno) { alert('Fill in the name and the year.'); return; }
    const { error } = id ? await supabaseClient.from('job_sources').update(row).eq('id', id) : await supabaseClient.from('job_sources').insert(row);
    if (error) { alert('Could not save: ' + error.message); return; }
    await jobAfterSave();
}
async function deleteJobSource(id) {
    if (!confirm('Delete this job with all its buste paga and CU?')) return;
    const now = new Date().toISOString();
    await supabaseClient.from('job_payslips').update({ deleted_at: now }).eq('source_id', id).is('deleted_at', null);
    await supabaseClient.from('job_sources').update({ deleted_at: now }).eq('id', id);
    await jobAfterSave();
}

function openJobPayslipModal(sourceId, id) {
    const s = jobSources.find((x) => x.id === sourceId);
    const p = id ? jobPayslips.find((x) => x.id === id) : null;
    // New one: the month after the last entered (or the job's first month)
    let mese = p ? String(p.mese).slice(0, 7) : '';
    if (!p) {
        const last = jobPayslipsOf(sourceId).pop();
        if (last) { const d = new Date(String(last.mese).slice(0, 10) + 'T12:00:00'); d.setMonth(d.getMonth() + 1); mese = d.toISOString().slice(0, 7); }
        else mese = s && s.dal ? String(s.dal).slice(0, 7) : `${s ? s.anno : new Date().getFullYear()}-01`;
    }
    taxModal(`${p ? 'Edit' : 'New'} busta paga — ${s ? s.nome : ''}`,
        `${taxField('jpMese', 'Month', mese, 'month')}
        <div style="display:flex; gap:10px;">${taxField('jpLordo', '«Lordo» — gross (€)', p ? p.lordo : '', 'number', 'step="0.01" min="0"')}${taxField('jpImp', '«Imponibile IRPEF» (€)', p ? p.imponibile : '', 'number', 'step="0.01" min="0"')}</div>
        <div style="display:flex; gap:10px;">${taxField('jpIrpef', '«IRPEF» trattenuta — withheld (€)', p ? p.irpef : '', 'number', 'step="0.01"')}${taxField('jpNetto', '«Netto» — paid to you (€)', p ? p.netto : '', 'number', 'step="0.01"')}</div>
        <div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:8px;">«Imponibile IRPEF» is the income after INPS is taken off: it is what the CU shows. IRPEF can be negative in a month with a refund (conguaglio).</div>
        ${jobFileField('jpPdf', 'Busta paga PDF (optional)', p && p.pdf_path)}`,
        jobModalFooter(p ? `<button class="btn btn-danger" onclick="deleteJobPayslip(${p.id})">${icon('trash', 15)}</button>` : '', `saveJobPayslip(${sourceId}, ${p ? p.id : 'null'})`));
}
async function saveJobPayslip(sourceId, id) {
    const n = (k) => { const v = document.getElementById(k).value; return v === '' ? null : Number(v); };
    const mese = document.getElementById('jpMese').value;
    if (!mese) { alert('Choose the month.'); return; }
    const row = { source_id: sourceId, mese: mese + '-01', lordo: n('jpLordo'), imponibile: n('jpImp'), irpef: n('jpIrpef'), netto: n('jpNetto') };
    if (row.lordo === null && row.netto === null) { alert('Fill in at least the lordo or the netto.'); return; }
    if (jobPayslips.some((p) => p.source_id === sourceId && String(p.mese).slice(0, 7) === mese && p.id !== id)) { alert('This month is already entered for this job: edit that one instead.'); return; }
    const file = document.getElementById('jpPdf').files[0];
    if (file) { const path = await jobUpload(file, `busta_${sourceId}_${mese}`); if (!path) return; row.pdf_path = path; }
    const { error } = id ? await supabaseClient.from('job_payslips').update(row).eq('id', id) : await supabaseClient.from('job_payslips').insert(row);
    if (error) { alert('Could not save: ' + error.message); return; }
    await jobAfterSave();
}
async function deleteJobPayslip(id) {
    if (!confirm('Delete this busta paga?')) return;
    await supabaseClient.from('job_payslips').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    await jobAfterSave();
}

function openJobCuModal(sourceId) {
    const s = jobSources.find((x) => x.id === sourceId);
    if (!s) return;
    const exp = jobExpectedCu(sourceId);
    taxModal(`CU ${s.anno + 1} — ${s.nome}`,
        `<p style="font-size:0.84em; color:var(--ink-soft); margin-top:0;">Copy from the CU (income ${s.anno}). Your buste paga say: imponibile <b>${eur(exp.imponibile)}</b>, IRPEF <b>${eur(exp.irpef)}</b> (${exp.mesi} month${exp.mesi === 1 ? '' : 's'}).</p>
        <div style="display:flex; gap:10px;">${taxField('jcReddito', 'Reddito — «punto 1» or «punto 2»', s.cu_reddito ?? '', 'number', 'step="0.01"')}${taxField('jcRit', '«Ritenute IRPEF» — punto 21', s.cu_ritenute ?? '', 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('jcReg', '«Addizionale regionale» — punto 22', s.cu_add_regionale ?? '', 'number', 'step="0.01"')}${taxField('jcCom', '«Addizionale comunale» (saldo + acconto)', s.cu_add_comunale ?? '', 'number', 'step="0.01"')}</div>
        <div style="display:flex; gap:10px;">${taxField('jcGiorni', 'Days worked — «giorni»', s.cu_giorni ?? '', 'number', 'step="1" min="0"')}${taxField('jcData', 'Date received', s.cu_ricevuta ?? formatLocalDate(new Date()), 'date')}</div>
        <div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:8px;">Point numbers can move a little from year to year: check the label on your CU.</div>
        ${jobFileField('jcPdf', 'CU PDF', s.cu_pdf_path)}`,
        jobModalFooter(jobCuReceived(s) ? `<button class="btn btn-danger" title="Remove the CU data" onclick="clearJobCu(${s.id})">${icon('trash', 15)}</button>` : '', `saveJobCu(${s.id})`));
}
async function saveJobCu(id) {
    const n = (k) => { const v = document.getElementById(k).value; return v === '' ? null : Number(v); };
    const row = { cu_reddito: n('jcReddito'), cu_ritenute: n('jcRit'), cu_add_regionale: n('jcReg'), cu_add_comunale: n('jcCom'), cu_giorni: n('jcGiorni'), cu_ricevuta: document.getElementById('jcData').value || null };
    const file = document.getElementById('jcPdf').files[0];
    if (file) { const path = await jobUpload(file, `cu_${id}`); if (!path) return; row.cu_pdf_path = path; }
    const { error } = await supabaseClient.from('job_sources').update(row).eq('id', id);
    if (error) { alert('Could not save: ' + error.message); return; }
    await jobAfterSave();
}
async function clearJobCu(id) {
    if (!confirm('Remove the CU data of this job? (The buste paga stay.)')) return;
    await supabaseClient.from('job_sources').update({ cu_pdf_path: null, cu_reddito: null, cu_ritenute: null, cu_add_regionale: null, cu_add_comunale: null, cu_giorni: null, cu_ricevuta: null }).eq('id', id);
    await jobAfterSave();
}

// ---------- «Redditi checklist» ----------
// Income year: the last one whose Redditi isn't marked as sent yet.
function redditiDefaultYear() {
    const nowY = new Date().getFullYear();
    return taxYears[nowY - 1]?.dichiarazione_protocollo ? nowY : nowY - 1;
}
function renderRedditiChecklist(el) {
    if (jobMissing) { el.innerHTML = taxViewPills() + jobMissingCard(); return; }
    const anno = Number(document.getElementById('redditiYearSelect')?.value) || redditiDefaultYear();
    const ticks = (redditiChecklist[anno] || {}).ticks || {};
    const off = taxYears[anno] || {};
    const prev = taxYears[anno - 1] || {};
    const fy = taxYearFigures(anno);
    const st = taxSettings || {};
    const srcs = jobSourcesOf(anno);
    const cus = srcs.filter(jobCuReceived);
    const cuSum = (k) => r2(cus.reduce((s, x) => s + Number(x[k] || 0), 0));
    const byPay = ricaviByPaymentDate(anno);
    const byFatt = taxRicaviFromFatture(anno);
    const ateco = (typeof fatturaSettings !== 'undefined' && fatturaSettings && fatturaSettings.codice_ateco) || '';
    const creditLeft = r2(taxCredits.reduce((s, c) => s + Number(c.importo) - taxCreditUsed(c.id), 0));
    const pdfBtn = (path, label) => (path ? `<button class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(path)}')">${label}</button>` : '');
    const ricevuta = (redditiChecklist[anno] || {}).ricevuta_pdf_path;
    const AREA = 'https://www.agenziaentrate.gov.it/portale/area-riservata';
    const link = (url, text) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    // [key, title, what the app knows, steps to do]
    const items = [
        ['open', 'Open your Modello Redditi PF', '',
            [`Open ${link(AREA, '«Area riservata»')} and log in with SPID / CIE.`,
             '<b>«Dichiarazione precompilata»</b> → year ' + (anno + 1) + ' → choose <b>«Redditi PF»</b> (not the 730: with a Partita IVA you must use Redditi PF).',
             'Choose <b>«Modifica»</b>: the forfettario part is not filled in for you. Keep this checklist open next to it and go down the list.']],
        ['rc', 'Quadro RC — employee income (your CUs)',
            `CUs in the app: <b>${cus.length} of ${srcs.length}</b> jobs${cus.length < srcs.length ? ' ⚠️ a CU is missing' : srcs.length ? ' ✅' : ''} · reddito <b>${eur(cuSum('cu_reddito'))}</b> · ritenute <b>${eur(cuSum('cu_ritenute'))}</b>`,
            ['Open <b>«Quadro RC»</b> («Redditi di lavoro dipendente e assimilati»). Each CU is one row.',
             'For each job, check that <b>reddito</b>, <b>giorni</b> and <b>ritenute IRPEF</b> are the same as in <b>Job income (CU)</b>.',
             'A CU missing? Press <b>«Aggiungi»</b> / <b>«Inserisci»</b> and copy it from the CU PDF.',
             'Two jobs at the same time: the days are counted once, not added.']],
        ['lm', 'Quadro LM — your dance course (forfettario)',
            `Ricavi <b>${eur(byPay)}</b> (by payment date)${r2(byPay) !== r2(byFatt) ? ` <span style="color:var(--ink-faint);">· by fattura date ${eur(byFatt)}</span>` : ''} · ATECO <b>${escapeHtml(ateco || '—')}</b> · coefficiente <b>${Number(st.coefficiente ?? 78)}%</b> · aliquota <b>${fy.aliquota}%</b> · imposta ≈ <b>${eur(fy.imposta)}</b>`,
            ['Open <b>«Quadro LM»</b>, the <b>«Regime forfetario»</b> section.',
             `«Codice attività» <b>${escapeHtml(String(ateco || '85.52.01').replace(/\./g, ''))}</b>, «coefficiente di redditività» <b>${Number(st.coefficiente ?? 78)}</b>, «componenti positivi» = <b>${eur(byPay)}</b>.`,
             `Choose the <b>${fy.aliquota}%</b> rate${fy.aliquota < 15 ? ' (start-up, «nuova attività»)' : ''}. Put the INPS paid in ${anno} (<b>${eur(taxInpsPaidDuring(anno))}</b>) as «contributi previdenziali».`,
             `The imposta the program shows should be close to <b>${eur(fy.imposta)}</b>.`]],
        ['rs', 'Quadro RS — forfettario information',
            prev.dichiarazione_pdf_path ? '' : `No Redditi ${anno} PDF saved in the app (add it in Studio → «Enter dichiarazione figures» for ${anno - 1}).`,
            [`Open last year's Modello ${prev.dichiarazione_pdf_path ? pdfBtn(prev.dichiarazione_pdf_path, `Open Redditi ${anno}`) : ''} and find <b>«Quadro RS»</b>.`,
             'Fill in the same forfettario lines as last year, with this year\'s numbers (the lines the commercialista filled in).']],
        ['rr', 'Quadro RR — INPS Gestione Separata',
            `INPS due ≈ <b>${eur(fy.inps)}</b> · acconti paid for ${anno}: <b>${eur(fy.accInpsPaid)}</b> · INPS paid during ${anno}: <b>${eur(taxInpsPaidDuring(anno))}</b>`,
            ['Open <b>«Quadro RR»</b>, <b>«Sezione II»</b> (Gestione separata, «professionisti»).',
             `«Reddito» = the forfettario reddito of LM, «aliquota» <b>${Number(st.inps_aliquota ?? 26.07)}%</b>.`,
             `«Acconti versati» = <b>${eur(fy.accInpsPaid)}</b> (from your F24 record). The rest is the saldo INPS.`]],
        ['rx', 'Quadro RX — credits',
            `Credits left in the app: <b>${eur(creditLeft)}</b>`,
            ['Open <b>«Quadro RX»</b>: it shows each credit and debt of the year.',
             'For every credit choose <b>«da utilizzare in compensazione»</b> (to use in your next F24s), not «rimborso».',
             'After sending, add the new credits in Studio → <b>Credits</b> («+ Add credit»).']],
        ['coniuge', 'Coniuge a carico (dependent spouse)', '',
            ['Spouse still abroad with no codice fiscale? <b>Skip this step</b> for now (nothing wrong, you just do not get the deduction). If the Modello shows IRPEF to pay, getting their codice fiscale (form AA4/8 at an AdE office, free) plus the marriage certificate and proof of no income can be worth it.',
             'Your spouse can be «a carico» only if their <b>total income of the year is €2.840,51 or less</b>.',
             'Where: the <b>«Familiari a carico»</b> part of the Modello: «C» (coniuge), their <b>codice fiscale</b>, months a carico.',
             'It lowers IRPEF only if you have IRPEF to pay; with a low income it may change nothing.']],
        ['saldo', 'Check the result',
            `App estimate of the saldo: tax <b>${eur(fy.saldoImposta)}</b> · INPS <b>${eur(fy.saldoInps)}</b>`,
            ['Open the summary page (<b>«Riepilogo»</b> / <b>«Prospetto di liquidazione»</b>).',
             'The saldo should be close to the app estimate. A big difference: go back and check LM, RR and RC.']],
        ['sent', 'Send it and save the ricevuta',
            off.dichiarazione_protocollo ? `✅ Sent · protocollo <b>${escapeHtml(off.dichiarazione_protocollo)}</b>${off.dichiarazione_data ? ' · ' + formatShortDate(off.dichiarazione_data) : ''}` : '⏳ not sent yet (no protocollo in the app)',
            [`Press <b>«Invia»</b> (by <b>31 October ${anno + 1}</b>).`,
             'Go to <b>«Ricevute»</b> and wait until the state is <b>«acquisita»</b> (minutes or a day). Then download the <b>ricevuta</b> PDF and the <b>dichiarazione</b> PDF.',
             'Copy the <b>protocollo</b> number from the ricevuta, then use the buttons below: protocollo + dichiarazione PDF, and the ricevuta.',
             'If the saldo is to pay: the F24 is due by <b>30 June</b>; the app shows it in Studio → Next deadline.']]
    ];
    const done = items.filter(([k]) => ticks[k]).length;
    const sentButtons = `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn btn-primary btn-sm" onclick="openTaxYearModal(${anno})">Protocollo + dichiarazione PDF</button>
            ${pdfBtn(off.dichiarazione_pdf_path, 'Open dichiarazione')}
            ${pdfBtn(ricevuta, 'Open ricevuta')}
            <label class="btn btn-primary btn-sm" style="cursor:pointer;">${ricevuta ? 'Replace ricevuta' : 'Upload ricevuta'}<input type="file" accept="application/pdf,image/*" style="display:none;" onchange="uploadRedditiRicevuta(${anno}, this)"></label>
        </div>`;
    el.innerHTML = `${taxViewPills()}
        <div class="section-label" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">Before sending Redditi ${anno + 1} (income
            <select id="redditiYearSelect" onchange="renderTaxTab()" style="padding:4px 8px; border-radius:var(--radius-sm); border:1px solid var(--border);">${[...new Set([new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), anno])].sort((a, b) => b - a).map((y) => `<option value="${y}" ${y === anno ? 'selected' : ''}>${y}</option>`).join('')}</select>)
            <span style="margin-left:auto; font-weight:600; color:${done === items.length ? 'var(--success)' : 'var(--ink-soft)'};">${done}/${items.length} done</span></div>
        <div class="card" style="padding:12px 16px; margin-bottom:12px; font-size:0.88em; background:var(--accent-soft); border-color:var(--accent);">
            <b>What you send:</b> one thing only, the <b>Modello Redditi PF ${anno + 1}</b> (your income of ${anno}), online on the Agenzia delle Entrate site, by <b>31 October ${anno + 1}</b>. Nothing goes on paper.
            <div style="margin-top:4px;">Do the steps in order, inside the Modello; tick each one when done.</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;">
            ${items.map(([k, title, known, steps], i) => `
                <div class="card" style="padding:12px 16px; font-size:0.87em;${ticks[k] ? ' opacity:0.6;' : ''}">
                    <label style="display:flex; gap:10px; align-items:center; cursor:pointer;">
                        <input type="checkbox" ${ticks[k] ? 'checked' : ''} onchange="toggleRedditiTick(${anno}, '${k}', this.checked)" style="width:18px; height:18px; flex:none; cursor:pointer;">
                        <b style="font-size:1.05em;">${i + 1}. ${title}</b>
                    </label>
                    ${known ? `<div style="color:var(--ink-soft); margin:6px 0 0 28px;">${known}</div>` : ''}
                    ${ticks[k] ? '' : `<div style="margin:8px 0 0 28px; padding:8px 12px; border-radius:var(--radius-sm); background:var(--warning-soft); border-left:4px solid var(--warning, #d97706); color:var(--ink);">
                        <div style="font-weight:700; font-size:0.85em; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:4px;">What to do</div>
                        <ol style="margin:0 0 0 18px; padding:0; line-height:1.6;">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
                    </div>`}
                    ${k === 'sent' ? `<div style="margin-left:28px;">${sentButtons}</div>` : ''}
                </div>`).join('')}
        </div>
        <div style="font-size:0.8em; color:var(--ink-faint);">The figures come from this app. Names of quadri, lines and buttons can change a little each year: check that year's «istruzioni» (Studio → Help has the links).</div>`;
}
async function toggleRedditiTick(anno, key, on) {
    const cur = redditiChecklist[anno] || { anno, ticks: {} };
    const ticks = { ...(cur.ticks || {}), [key]: on };
    const { error } = await supabaseClient.from('redditi_checklist').upsert({ anno, ticks, updated_at: new Date().toISOString() }, { onConflict: 'anno' });
    if (error) { alert('Could not save: ' + error.message); renderTaxTab(); return; }
    redditiChecklist[anno] = { ...cur, ticks };
    renderTaxTab();
}
async function uploadRedditiRicevuta(anno, input) {
    const file = input.files[0];
    if (!file) return;
    const path = await jobUpload(file, `ricevuta_redditi_${anno + 1}`);
    if (!path) return;
    const { error } = await supabaseClient.from('redditi_checklist').upsert({ anno, ricevuta_pdf_path: path, updated_at: new Date().toISOString() }, { onConflict: 'anno' });
    if (error) { alert('Could not save: ' + error.message); return; }
    await loadJobData(); renderTaxTab();
}

// ---------- limits + alerts ----------
// Official figures that change by law: re-check them each year (see the
// «Help» links). Forfettario: ricavi over €85.000 → out from the next year,
// over €100.000 → out at once. Job income (dipendente + assimilati) of the
// previous year over the limit → no forfettario that year.
const FORF_LIMIT = 85000;
const FORF_LIMIT_NOW = 100000;
function jobLimitFor(regimeYear) {
    // €35.000 for 2025 and 2026 (legge 199/2025, art. 1 c. 27), else €30.000
    return regimeYear === 2025 || regimeYear === 2026 ? 35000 : 30000;
}
// Assegno sociale a year (INPS, each December) = the permesso income;
// ricongiungimento = +50% for each family member.
const ASSEGNO_SOCIALE = { 2025: 7002.97, 2026: 7101.12 };
function assegnoSociale(anno) {
    const known = Object.keys(ASSEGNO_SOCIALE).map(Number).sort((a, b) => a - b);
    const y = known.filter((k) => k <= anno).pop() ?? known[0];
    return { anno: y, importo: ASSEGNO_SOCIALE[y] };
}
// Job income of a year: the CU reddito when entered, else the buste paga imponibile.
function jobIncomeRows(anno) {
    return jobSourcesOf(anno).map((s) => {
        const fromCu = jobNum(s.cu_reddito) !== null;
        return { src: s, reddito: fromCu ? Number(s.cu_reddito) : jobExpectedCu(s.id).imponibile, fromCu };
    });
}
const jobIncomeTotal = (anno) => r2(jobIncomeRows(anno).reduce((s, r) => s + r.reddito, 0));
function taxAlertsHtml() {
    if (typeof taxRicaviFromFatture !== 'function') return '';
    const nowY = new Date().getFullYear();
    const card = (danger, html) => `<div class="card" style="padding:10px 14px; margin-bottom:10px; font-size:0.86em; border-left:4px solid ${danger ? 'var(--danger)' : 'var(--warning, #d97706)'};">${danger ? '🔴' : '🟡'} ${html}</div>`;
    const out = [];
    const ric = taxRicaviFromFatture(nowY);
    if (ric > FORF_LIMIT_NOW) out.push(card(true, `Ricavi ${nowY} are <b>${eur(ric)}</b>, over ${eur(FORF_LIMIT_NOW)}: the forfettario ends <b>this year</b>. Talk to a commercialista now.`));
    else if (ric > FORF_LIMIT) out.push(card(true, `Ricavi ${nowY} are <b>${eur(ric)}</b>, over ${eur(FORF_LIMIT)}: no forfettario from <b>${nowY + 1}</b>.`));
    else if (ric >= FORF_LIMIT * 0.8) out.push(card(false, `Ricavi ${nowY} are <b>${eur(ric)}</b>: close to the forfettario limit of ${eur(FORF_LIMIT)}.`));
    if (!jobMissing) {
        const prev = jobIncomeTotal(nowY - 1), limPrev = jobLimitFor(nowY);
        if (prev > limPrev) out.push(card(true, `Job income ${nowY - 1} is <b>${eur(prev)}</b>, over ${eur(limPrev)}: the forfettario is <b>not allowed in ${nowY}</b> — unless that job ended in ${nowY - 1} and you had no other job income. Check with a CAF.`));
        const cur = jobIncomeTotal(nowY), limNext = jobLimitFor(nowY + 1);
        const tail = ` The rule doesn't apply if the job ends by 31/12 and you have no other job income. The limit can change by law each year.`;
        if (cur > limNext) out.push(card(true, `Job income ${nowY} is already <b>${eur(cur)}</b>, over ${eur(limNext)}: <b>no forfettario in ${nowY + 1}</b>.${tail}`));
        else if (cur >= limNext * 0.8) out.push(card(false, `Job income ${nowY} is <b>${eur(cur)}</b>: over ${eur(limNext)} means no forfettario in ${nowY + 1}.${tail}`));
    }
    return out.join('');
}

// ---------- checks on the year's jobs (shown under the CU line) ----------
function jobChecksHtml(anno) {
    const srcs = jobSourcesOf(anno);
    const out = [];
    const box = (html) => `<div class="card" style="padding:10px 14px; margin-bottom:10px; font-size:0.85em; border-left:4px solid var(--warning, #d97706);">${html}</div>`;
    if (srcs.length >= 2) out.push(box(`<b>${srcs.length} jobs in ${anno}.</b> Each employer withheld IRPEF as if it were your only job, so at Redditi you may have <b>IRPEF to pay back</b> (and part of the «trattamento integrativo» may be asked back). Keep some money aside; the precompilata or a CAF gives the exact amount.`));
    const days = srcs.filter((s) => jobNum(s.cu_giorni) !== null).reduce((x, s) => x + Number(s.cu_giorni), 0);
    const yearDays = (anno % 4 === 0 && anno % 100 !== 0) || anno % 400 === 0 ? 366 : 365;
    if (days > yearDays) out.push(box(`<b>CU days add up to ${days}</b> (more than ${yearDays}). In «Quadro RC» each day counts once: the days of jobs at the same time must not be added. Check the «giorni» in RC.`));
    const end = (s) => String(s.al || `${anno}-12-31`).slice(0, 10);
    for (let i = 0; i < srcs.length; i++) for (let j = i + 1; j < srcs.length; j++) {
        const a = srcs[i], b = srcs[j];
        if (!a.dal || !b.dal) continue;
        const from = [String(a.dal), String(b.dal)].sort()[1].slice(0, 10), to = [end(a), end(b)].sort()[0];
        if (from <= to) out.push(box(`<b>${escapeHtml(a.nome)}</b> and <b>${escapeHtml(b.nome)}</b> overlap (${formatShortDate(from)} → ${formatShortDate(to)}). Fine if you really had both; check the dates, and in RC those days count once.`));
    }
    return out.join('');
}

// ---------- «Riepilogo redditi» PDF / Excel (Questura: permesso, ricongiungimento) ----------
function redditiSummaryData(anno) {
    const jobs = jobIncomeRows(anno);
    const jobTot = r2(jobs.reduce((s, r) => s + r.reddito, 0));
    const fy = taxYearFigures(anno);
    const forf = fy.imponibile;
    const tot = r2(jobTot + forf);
    const as = assegnoSociale(new Date().getFullYear());
    const studio = studioRicaviByMonth(anno), jm = jobByMonth(anno);
    return { anno, jobs, jobTot, fy, forf, tot, as, ricong1: r2(as.importo * 1.5), studio, jm };
}
function exportRedditiSummary(kind) {
    const owner = typeof expOwnerOrWarn === 'function' ? expOwnerOrWarn() : null;
    if (!owner) return;
    const anno = jobSelectedYear();
    const d = redditiSummaryData(anno);
    const period = (s) => [s.dal ? expDate(s.dal) : '', s.al ? expDate(s.al) : ''].filter(Boolean).join(' - ');
    const esito = (soglia) => (d.tot >= soglia ? 'Raggiunta' : 'Non raggiunta');
    const forfLabel = d.fy.official ? 'dichiarazione' : 'stima dalle fatture';
    const sum = (a) => r2(a.reduce((x, v) => x + v, 0));
    const name = `Riepilogo_redditi_${anno}`;
    if (kind === 'xlsx') {
        expXlsx([{
            name: 'Riepilogo', widths: [38, 22, 26, 24, 16, 18],
            rows: [['Corso di Danza (' + owner.name + ')'], [owner.addr], [`C.F. ${owner.cf} · P.IVA ${owner.piva}`], [], [`Riepilogo redditi ${anno}`], [],
                ['Redditi di lavoro dipendente e assimilati'], ['Datore di lavoro', 'C.F. / P.IVA', 'Tipo', 'Periodo', 'Reddito (EUR)', 'Fonte'],
                ...d.jobs.map((r) => [r.src.nome, r.src.cf_piva || '', JOB_TIPO[r.src.tipo] || r.src.tipo, period(r.src), r.reddito, r.fromCu ? 'CU' : 'Buste paga']),
                ['Totale lavoro dipendente', '', '', '', d.jobTot, ''], [],
                [`Reddito forfettario (quadro LM, ${forfLabel})`],
                ['Ricavi', '', '', '', d.fy.ricavi, ''], [`Reddito lordo (coefficiente ${d.fy.coeff}%)`, '', '', '', d.fy.reddito, ''],
                ['Contributi INPS dedotti', '', '', '', d.fy.deducibili, ''], ['Reddito forfettario', '', '', '', d.forf, ''], [],
                ['TOTALE REDDITO', '', '', '', d.tot, ''], [],
                [`Confronto con le soglie ${d.as.anno}`], ['Assegno sociale (permesso di soggiorno)', '', '', '', d.as.importo, esito(d.as.importo)],
                ['Ricongiungimento, 1 familiare', '', '', '', d.ricong1, esito(d.ricong1)]]
        }, {
            name: 'Mesi', widths: [12, 24, 18, 18],
            rows: [['Mese', 'Corso di danza (fatture)', 'Lavoro (lordo)', 'Lavoro (netto)'],
                ...JOB_MESI.map((m, i) => [`${m} ${anno}`, d.studio[i], d.jm.lordo[i], d.jm.netto[i]]),
                ['Totale', sum(d.studio), sum(d.jm.lordo), sum(d.jm.netto)]]
        }], name + '.xlsx');
        return;
    }
    const p = expNewPdf(false);
    let y = expHeader(p, owner, `Riepilogo redditi ${anno}`, `Totale reddito ${expMoney(d.tot)} EUR`);
    y = expSection(p, y, 'Redditi di lavoro dipendente e assimilati');
    y = expTable(p, y, [{ label: 'Datore di lavoro', w: 50 }, { label: 'Tipo', w: 44 }, { label: 'Periodo', w: 42 }, { label: 'Reddito (EUR)', w: 28, align: 'right' }, { label: 'Fonte', w: 22 }],
        (d.jobs.length ? d.jobs.map((r) => ({ cells: [r.src.nome, JOB_TIPO[r.src.tipo] || r.src.tipo, period(r.src), expMoney(r.reddito), r.fromCu ? 'CU' : 'Buste paga'] })) : [{ cells: ['Nessuno', '', '', '', ''] }])
            .concat([{ cells: ['Totale', '', '', expMoney(d.jobTot), ''], bold: true, fill: [232, 240, 254] }]));
    y = expSection(p, y, `Reddito forfettario - quadro LM (${forfLabel})`);
    y = expTable(p, y, [{ label: 'Voce', w: 158 }, { label: 'Importo (EUR)', w: 28, align: 'right' }], [
        { cells: ['Ricavi', expMoney(d.fy.ricavi)] }, { cells: [`Reddito lordo (coefficiente ${d.fy.coeff}%)`, expMoney(d.fy.reddito)] },
        { cells: ['Contributi INPS dedotti', expMoney(d.fy.deducibili)] }, { cells: ['Reddito forfettario', expMoney(d.forf)], bold: true, fill: [232, 240, 254] }]);
    y = expSection(p, y, 'Totale');
    y = expTable(p, y, [{ label: 'Voce', w: 136 }, { label: 'Importo (EUR)', w: 28, align: 'right' }, { label: 'Esito', w: 22 }], [
        { cells: ['TOTALE REDDITO', expMoney(d.tot), ''], bold: true, fill: [232, 240, 254] },
        { cells: [`Soglia permesso di soggiorno (assegno sociale ${d.as.anno})`, expMoney(d.as.importo), esito(d.as.importo)] },
        { cells: [`Soglia ricongiungimento, 1 familiare (${d.as.anno})`, expMoney(d.ricong1), esito(d.ricong1)] }]);
    // Keep the 12 months + total on one page (≈ 14 rows + title)
    y = expRoom(p, y, 14 * 6.2 + 14);
    y = expSection(p, y, 'Incassi mese per mese');
    expTable(p, y, [{ label: 'Mese', w: 40 }, { label: 'Corso di danza (fatture)', w: 50, align: 'right' }, { label: 'Lavoro (lordo)', w: 48, align: 'right' }, { label: 'Lavoro (netto)', w: 48, align: 'right' }],
        JOB_MESI.map((m, i) => ({ cells: [`${m} ${anno}`, expMoney(d.studio[i]), expMoney(d.jm.lordo[i]), expMoney(d.jm.netto[i])] }))
            .concat([{ cells: ['Totale', expMoney(sum(d.studio)), expMoney(sum(d.jm.lordo)), expMoney(sum(d.jm.netto))], bold: true, fill: [232, 240, 254] }]));
    expFooters(p);
    expDeliver(p.doc.output('blob'), name + '.pdf');
}
