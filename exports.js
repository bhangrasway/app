// Exports for offices (CAF, permesso di soggiorno, ricongiungimento):
// Income & Expense period → «Riepilogo incassi e spese», Fatture year →
// «Registro fatture», each as PDF (jsPDF) and Excel (XLSX). Italian text.
// Header is the owner's own data from the fattura Settings — fatture are
// issued in their name, so no studio brand or logo appears on these.

const EXP_METHOD = { cash: 'Contanti', bonifico: 'Bonifico', bank: 'Banca' };
const EXP_STATO = { created: 'Da inviare', uploaded: 'Inviata', accepted: 'Accettata', rejected: 'Scartata' };

// jsPDF's built-in fonts only print Latin-1: map the few common others.
function expLatin(s) {
    return String(s ?? '').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/€/g, 'EUR').replace(/…/g, '...')
        .split('').map((ch) => (ch.charCodeAt(0) <= 255 ? ch : ' ')).join('');
}
function expMoney(v) { return (Math.round(Number(v || 0) * 100) / 100).toFixed(2).replace('.', ','); }
function expDate(d) { const [y, m, dd] = String(d || '').slice(0, 10).split('-'); return y ? `${dd}/${m}/${y}` : ''; }
function expTitleCase(s) { return String(s || '').toLowerCase().replace(/(^|[\s'-])\S/g, (c) => c.toUpperCase()); }

function expOwner() {
    const st = (typeof fatturaSettings !== 'undefined' && fatturaSettings) || {};
    if (!st.codice_fiscale || !st.partita_iva) return null;
    const name = st.denominazione ? String(st.denominazione) : expTitleCase(`${st.cognome || ''} ${st.nome || ''}`.trim());
    const addr = `${st.indirizzo || ''}${st.numero_civico ? ', ' + st.numero_civico : ''} - ${st.cap || ''} ${st.comune || ''}${st.provincia ? ' (' + st.provincia + ')' : ''}`;
    const regime = { RF19: 'Regime forfettario', RF01: 'Regime ordinario', RF02: 'Regime dei contribuenti minimi' }[st.regime_fiscale || 'RF19'] || '';
    const fiscal = [regime, st.codice_ateco ? `ATECO ${st.codice_ateco}` : ''].filter(Boolean).join('  ·  ');
    return { name, addr, cf: String(st.codice_fiscale).toUpperCase(), piva: st.partita_iva, fiscal };
}
function expOwnerOrWarn() {
    const o = expOwner();
    if (!o) alert('First complete the fattura Settings (name, address, Codice Fiscale, Partita IVA): the exports use them as header.');
    return o;
}

// ---------- PDF building blocks ----------
function expNewPdf(landscape) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
    return { doc, W: doc.internal.pageSize.getWidth(), H: doc.internal.pageSize.getHeight(), L: 12 };
}
// Header of the first page: «Corso di Danza (Name)», address, C.F./P.IVA, title.
function expHeader(p, owner, title, subtitle) {
    const { doc, W, L } = p;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text(expLatin(`Corso di Danza (${owner.name})`), L, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(80);
    doc.text(expLatin(owner.addr), L, 24);
    doc.text(expLatin(`C.F. ${owner.cf}  ·  P.IVA ${owner.piva}`), L, 29);
    let y = 29;
    if (owner.fiscal) { y += 5; doc.text(expLatin(owner.fiscal), L, y); }
    doc.setTextColor(0); doc.setDrawColor(180); doc.setLineWidth(0.4); doc.line(L, y + 4, W - L, y + 4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
    doc.text(expLatin(title), L, y + 12);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    doc.text(expLatin(subtitle), L, y + 18);
    return y + 26;
}
function expSection(p, y, text) {
    y = expRoom(p, y, 16);
    p.doc.setFont('helvetica', 'bold'); p.doc.setFontSize(11);
    p.doc.text(expLatin(text), p.L, y);
    return y + 9;
}
function expRoom(p, y, need) {
    if (y + need <= p.H - 16) return y;
    p.doc.addPage();
    return 16;
}
// Simple table: cols [{label, w, align}], rows [{cells, bold, fill}].
// The header row repeats on every new page; long text is cut to fit.
function expTable(p, y, cols, rows) {
    const { doc, L } = p;
    const rowH = 6.2;
    const drawHead = () => {
        doc.setFillColor(238, 241, 246); doc.rect(L, y - 4.3, cols.reduce((s, c) => s + c.w, 0), rowH, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        let x = L;
        cols.forEach((c) => { doc.text(expLatin(c.label), c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; });
        y += rowH;
    };
    y = expRoom(p, y, rowH * 2); drawHead();
    rows.forEach((r) => {
        if (y + rowH > p.H - 16) { doc.addPage(); y = 16; drawHead(); }
        const totalW = cols.reduce((s, c) => s + c.w, 0);
        if (r.fill) { doc.setFillColor(r.fill[0], r.fill[1], r.fill[2]); doc.rect(L, y - 4.3, totalW, rowH, 'F'); }
        doc.setFont('helvetica', r.bold ? 'bold' : 'normal'); doc.setFontSize(8.5);
        let x = L;
        cols.forEach((c, i) => {
            let t = expLatin(r.cells[i] ?? '');
            let room = c.w;
            if (c.align !== 'right') for (let j = i + 1; j < cols.length && !String(r.cells[j] ?? ''); j++) room += cols[j].w;
            while (t && doc.getTextWidth(t) > room - 3) t = t.slice(0, -2) + '.';
            if (i === 0 && r.link && t) {
                // Blue underlined, opens the file next to this PDF (same folder)
                const tw = doc.getTextWidth(t);
                doc.setTextColor(26, 86, 219);
                doc.text(t, x + 1.5, y);
                doc.setDrawColor(26, 86, 219); doc.setLineWidth(0.2); doc.line(x + 1.5, y + 0.6, x + 1.5 + tw, y + 0.6);
                doc.link(x + 1.5, y - 3.2, tw, 4.2, { url: r.link });
                doc.setTextColor(0);
            } else doc.text(t, c.align === 'right' ? x + c.w - 1.5 : x + 1.5, y, { align: c.align === 'right' ? 'right' : 'left' });
            x += c.w;
        });
        doc.setDrawColor(225); doc.setLineWidth(0.15); doc.line(L, y + 1.9, L + totalW, y + 1.9);
        y += rowH;
    });
    return y + 4;
}
function expFooters(p) {
    const n = p.doc.getNumberOfPages();
    const today = expDate(formatLocalDate(new Date()));
    for (let i = 1; i <= n; i++) {
        p.doc.setPage(i);
        p.doc.setFont('helvetica', 'normal'); p.doc.setFontSize(8); p.doc.setTextColor(120);
        p.doc.text(expLatin(`Pagina ${i} di ${n}  ·  Generato il ${today}`), p.W - p.L, p.H - 8, { align: 'right' });
        p.doc.setTextColor(0);
    }
}
function expDeliver(blob, name) {
    const phone = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (phone && typeof openFileSmart === 'function') { openFileSmart({ name, getBlob: async () => blob }); return; }
    downloadBlob(blob, name);
}
// sh.links: [{ r, c, target }] — the cell opens that file (same folder)
function expXlsxBlob(sheets) {
    const wb = XLSX.utils.book_new();
    sheets.forEach((sh) => {
        const ws = XLSX.utils.aoa_to_sheet(sh.rows);
        if (sh.widths) ws['!cols'] = sh.widths.map((w) => ({ wch: w }));
        (sh.links || []).forEach((k) => { const cell = ws[XLSX.utils.encode_cell({ r: k.r, c: k.c })]; if (cell) cell.l = { Target: k.target }; });
        XLSX.utils.book_append_sheet(wb, ws, sh.name);
    });
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
function expXlsx(sheets, name) {
    if (typeof XLSX === 'undefined') { alert('Excel not available: reload the page and try again.'); return; }
    expDeliver(expXlsxBlob(sheets), name);
}

// ---------- 5.1 Collections: «Riepilogo incassi e spese» ----------
// Invoiced = a fattura sent to AdE (accepted / uploaded). Drafts and rejected ones don't count.
function expIsInvoiced(t) {
    const f = typeof fatturaForTransaction === 'function' ? fatturaForTransaction(t.id) : null;
    return !!f && (f.status === 'accepted' || f.status === 'uploaded');
}
function expFatturaText(t) {
    const f = typeof fatturaForTransaction === 'function' ? fatturaForTransaction(t.id) : null;
    if (!f) return 'non fatturato';
    return `${fmtNumeroFattura(f)} ${(EXP_STATO[f.status] || f.status).toLowerCase()}`;
}
// Same data as the Income & Expense boxes: the chosen period and location.
function collectionsExportData(onlyInvoiced) {
    const { from, to, label, all } = getFeesPeriodRange();
    const locId = getLocationIdFilter();
    const inRange = (d) => d >= from && d <= to;
    const stu = (sid) => students.find((x) => x.id === sid) || null;
    const inLoc = (sid) => locId === null || (stu(sid) || {}).locationId === locId;
    const incassi = [
        ...v2CreditTransactions.filter((t) => t.type === 'recharge' && !t.deleted_at && inRange(String(t.created_at).slice(0, 10)) && inLoc(t.student_id))
            .map((t) => ({ date: String(t.created_at).slice(0, 10), allievo: (stu(t.student_id) || {}).name || `Allievo #${t.student_id}`, importo: Number(t.amount || 0), metodo: t.payment_method, fattura: expFatturaText(t), invoiced: expIsInvoiced(t) })),
        ...manualFattureForCollections().filter((f) => inRange(String(f.data_fattura).slice(0, 10)) && (locId === null || inLoc(f.student_id)))
            .map((f) => ({ date: String(f.data_fattura).slice(0, 10), allievo: (stu(f.student_id) || {}).name || `${f.recipient_cognome || ''} ${f.recipient_nome || ''}`.trim(), importo: Number(f.importo || 0), metodo: f.payment_method, fattura: `${fmtNumeroFattura(f)} (inserita a mano)`, invoiced: true }))
    ].filter((r) => !onlyInvoiced || r.invoiced)
        .sort((a, b) => a.date.localeCompare(b.date) || a.allievo.localeCompare(b.allievo));
    const spese = expenses.filter((e) => e.expenseDate && e.expenseDate >= CUTOVER_DATE && inRange(e.expenseDate) && (locId === null || e.location_id === locId))
        .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate))
        .map((e) => ({ date: e.expenseDate, descrizione: e.description, importo: Number(e.amount || 0), metodo: e.payment_method }));
    const versamenti = cashDeposits.filter((d) => inRange(String(d.data).slice(0, 10)))
        .sort((a, b) => String(a.data).localeCompare(String(b.data)))
        .map((d) => ({ date: String(d.data).slice(0, 10), importo: Number(d.importo || 0), nota: d.note || '' }));
    const sum = (rows, m) => rows.filter((r) => (m === undefined ? true : m ? r.metodo === m : !r.metodo)).reduce((s, r) => s + r.importo, 0);
    const totals = {
        inCash: sum(incassi, 'cash'), inBon: sum(incassi, 'bonifico'), inNone: sum(incassi, null), inTot: sum(incassi),
        outCash: sum(spese, 'cash'), outBank: sum(spese, 'bank'), outNone: sum(spese, null), outTot: sum(spese),
        dep: versamenti.reduce((s, d) => s + d.importo, 0), now: cashRegisterTotals()
    };
    const period = all ? 'Tutto il periodo' : `Periodo: ${expDate(from)} - ${expDate(to)}`;
    const sede = locId === null ? '' : `  ·  Sede: ${getLocationName(locId)}`;
    const fileTag = all ? 'tutto' : `${from}_${to}`;
    return { incassi, spese, versamenti, totals, subtitle: period + sede + (onlyInvoiced ? '  ·  Solo incassi fatturati' : ''), fileTag: fileTag + (onlyInvoiced ? '_fatturato' : ''), label, onlyInvoiced };
}
// Day groups with a subtotal row: «Totale 15/10/2026 — 150,00 contanti + 40,00 bonifico».
function expIncassiByDay(incassi) {
    const days = [];
    incassi.forEach((r) => { if (!days.length || days[days.length - 1].date !== r.date) days.push({ date: r.date, rows: [] }); days[days.length - 1].rows.push(r); });
    return days.map((d) => {
        const part = (m) => d.rows.filter((r) => (m ? r.metodo === m : !r.metodo)).reduce((s, r) => s + r.importo, 0);
        const split = [[part('cash'), 'contanti'], [part('bonifico'), 'bonifico'], [part(null), 'metodo ?']].filter(([v]) => v).map(([v, l]) => `${expMoney(v)} ${l}`).join(' + ');
        return { ...d, total: d.rows.reduce((s, r) => s + r.importo, 0), split };
    });
}
function exportCollections(kind) {
    const owner = expOwnerOrWarn();
    if (!owner) return;
    const x = collectionsExportData(!!document.getElementById('feesExportInvoicedOnly')?.checked);
    const t = x.totals;
    const title = x.onlyInvoiced ? 'Riepilogo incassi fatturati e spese' : 'Riepilogo incassi e spese';
    const days = expIncassiByDay(x.incassi);
    const name = `Riepilogo_incassi_${x.fileTag}`;
    if (kind === 'xlsx') {
        const riepilogo = [
            ['Corso di Danza (' + owner.name + ')'], [owner.addr], [`C.F. ${owner.cf} · P.IVA ${owner.piva}`], ...(owner.fiscal ? [[owner.fiscal]] : []), [], [title], [x.subtitle], [],
            ['Voce', 'Contanti', 'Bonifico / Banca', 'Metodo ?', 'Totale'],
            ['Entrate', t.inCash, t.inBon, t.inNone, t.inTot],
            ['Spese', t.outCash, t.outBank, t.outNone, t.outTot],
            ['Netto (entrate - spese)', '', '', '', t.inTot - t.outTot], [],
            ['Versamenti in banca nel periodo', '', '', '', t.dep],
            // Cash/bank balances mix in not-invoiced money: left out of the «only invoiced» version.
            ...(x.onlyInvoiced ? [] : [['Cassa contanti attuale', '', '', '', t.now.cash], ['Banca (studio) attuale - solo movimenti registrati', '', '', '', t.now.bank]])
        ];
        const incassi = [['Data', 'Allievo', 'Importo (EUR)', 'Metodo', 'Fattura']];
        days.forEach((d) => {
            d.rows.forEach((r) => incassi.push([expDate(r.date), r.allievo, r.importo, EXP_METHOD[r.metodo] || '-', r.fattura]));
            incassi.push([`Totale ${expDate(d.date)}`, d.split, d.total, '', '']);
        });
        incassi.push(['TOTALE', '', t.inTot, '', '']);
        const spese = [['Data', 'Descrizione', 'Importo (EUR)', 'Metodo'], ...x.spese.map((r) => [expDate(r.date), r.descrizione, r.importo, EXP_METHOD[r.metodo] || '-']), ['TOTALE', '', t.outTot, '']];
        const vers = [['Data', 'Importo (EUR)', 'Nota'], ...x.versamenti.map((r) => [expDate(r.date), r.importo, r.nota]), ['TOTALE', t.dep, '']];
        expXlsx([
            { name: 'Riepilogo', rows: riepilogo, widths: [46, 14, 16, 12, 14] },
            { name: 'Incassi', rows: incassi, widths: [20, 40, 14, 12, 26] },
            { name: 'Spese', rows: spese, widths: [12, 40, 14, 12] },
            { name: 'Versamenti', rows: vers, widths: [12, 14, 40] }
        ], name + '.xlsx');
        return;
    }
    const p = expNewPdf(false);
    let y = expHeader(p, owner, title, x.subtitle);
    y = expSection(p, y, 'Riepilogo');
    const showNone = t.inNone || t.outNone;
    const sumCols = [{ label: 'Voce', w: showNone ? 76 : 94 }, { label: 'Contanti', w: 30, align: 'right' }, { label: 'Bonifico / Banca', w: 32, align: 'right' }]
        .concat(showNone ? [{ label: 'Metodo ?', w: 18, align: 'right' }] : [], [{ label: 'Totale', w: 30, align: 'right' }]);
    const mk = (label, a, b, c, tot, bold) => ({ cells: [label, a === '' ? '' : expMoney(a), b === '' ? '' : expMoney(b)].concat(showNone ? [c === '' ? '' : expMoney(c)] : [], [expMoney(tot)]), bold });
    y = expTable(p, y, sumCols, [
        mk('Entrate', t.inCash, t.inBon, t.inNone, t.inTot),
        mk('Spese', t.outCash, t.outBank, t.outNone, t.outTot),
        { ...mk('Netto (entrate - spese)', '', '', '', t.inTot - t.outTot, true), fill: [232, 240, 254] }
    ]);
    y = expTable(p, y, [{ label: 'Situazione', w: 146 }, { label: 'Importo (EUR)', w: 40, align: 'right' }], [
        { cells: ['Versamenti di contanti in banca nel periodo', expMoney(t.dep)] }
    ].concat(x.onlyInvoiced ? [] : [
        { cells: ['Cassa contanti attuale (tutti i giorni)', expMoney(t.now.cash)] },
        { cells: ['Banca attuale - solo i movimenti registrati qui', expMoney(t.now.bank)] }
    ]));
    y = expSection(p, y, `Incassi (${x.incassi.length})`);
    const inRows = [];
    days.forEach((d) => {
        d.rows.forEach((r) => inRows.push({ cells: [expDate(r.date), r.allievo, expMoney(r.importo), EXP_METHOD[r.metodo] || '-', r.fattura] }));
        inRows.push({ cells: ['', `Totale ${expDate(d.date)}`, expMoney(d.total), d.split, ''], bold: true, fill: [246, 248, 250] });
    });
    inRows.push({ cells: ['', 'TOTALE INCASSI', expMoney(t.inTot), '', ''], bold: true, fill: [226, 245, 233] });
    y = expTable(p, y, [{ label: 'Data', w: 22 }, { label: 'Allievo', w: 74 }, { label: 'Importo (EUR)', w: 26, align: 'right' }, { label: 'Metodo', w: 22 }, { label: 'Fattura', w: 42 }],
        x.incassi.length ? inRows : [{ cells: ['', 'Nessun incasso nel periodo', '', '', ''] }]);
    y = expSection(p, y, `Spese (${x.spese.length})`);
    y = expTable(p, y, [{ label: 'Data', w: 22 }, { label: 'Descrizione', w: 112 }, { label: 'Importo (EUR)', w: 26, align: 'right' }, { label: 'Metodo', w: 26 }],
        (x.spese.length ? x.spese.map((r) => ({ cells: [expDate(r.date), r.descrizione, expMoney(r.importo), EXP_METHOD[r.metodo] || '-'] })) : [{ cells: ['', 'Nessuna spesa nel periodo', '', ''] }])
            .concat([{ cells: ['', 'TOTALE SPESE', expMoney(t.outTot), ''], bold: true, fill: [253, 236, 236] }]));
    if (x.versamenti.length) {
        y = expSection(p, y, `Versamenti in banca (${x.versamenti.length})`);
        y = expTable(p, y, [{ label: 'Data', w: 22 }, { label: 'Importo (EUR)', w: 30, align: 'right' }, { label: 'Nota', w: 134 }],
            x.versamenti.map((r) => ({ cells: [expDate(r.date), expMoney(r.importo), r.nota] })));
    }
    expFooters(p);
    expDeliver(p.doc.output('blob'), name + '.pdf');
}

// ---------- 5.2 Fatture: «Registro fatture <anno>» ----------
// Bollo as it is on the fattura itself: the app's XML says it; a fattura
// added by hand only carries it from 24/10/2026 (the automatic bollo).
function expFatturaBollo(f) {
    if (f.xml) return String(f.xml).includes('<DatiBollo>') ? 2 : 0;
    return typeof fatturaNeedsBollo === 'function' && fatturaNeedsBollo(f) && String(f.data_fattura) >= '2026-10-24' ? 2 : 0;
}
function expFatturaFile(f) {
    if (f.tipo_documento === 'TD04') return `NotaCredito_${String(f.numero).padStart(3, '0')}-${String(f.anno).slice(-2)}.pdf`;
    return `Fattura_${String(f.numero).padStart(3, '0')}-${String(f.anno).slice(-2)}.pdf`;
}
function fattureExportRows(year) {
    // fatture first, then the note di credito (numbered apart)
    return fattureList.filter((f) => f.anno === year).sort((a, b) => (a.tipo_documento === 'TD04') - (b.tipo_documento === 'TD04') || a.numero - b.numero).map((f) => {
        const s = f.student_id ? students.find((x) => x.id === f.student_id) : null;
        return {
            numero: (f.tipo_documento === 'TD04' ? 'NC ' : '') + fmtNumeroFattura(f), data: expDate(f.data_fattura),
            intestatario: `${f.recipient_cognome || ''} ${f.recipient_nome || ''}`.trim(), cf: f.recipient_cf || '',
            allievo: s ? s.name : '', importo: (f.tipo_documento === 'TD04' ? -1 : 1) * Number(f.importo || 0), bollo: expFatturaBollo(f),
            stato: (EXP_STATO[f.status] || f.status) + (f.annullata_da ? ' (stornata)' : ''),
            origine: f.tipo_documento === 'TD04' ? (() => { const o = fattureList.find((x) => x.id === f.collegata_id); return o ? `Nota di credito (storno ${fmtNumeroFattura(o)})` : 'Nota di credito'; })() : f.source === 'manual' ? 'Inserita a mano' : 'App',
            file: f.status === 'rejected' ? null : expFatturaFile(f)
        };
    });
}
function registroData(year) {
    const rows = fattureExportRows(year);
    const valid = rows.filter((r) => !r.stato.startsWith('Scartata'));
    const totImp = valid.reduce((s, r) => s + r.importo, 0);
    const totBollo = valid.reduce((s, r) => s + r.bollo, 0);
    const summary = `${rows.length} fatture  ·  Totale ${expMoney(totImp)} EUR  ·  Bolli ${expMoney(totBollo)} EUR${rows.length > valid.length ? `  ·  ${rows.length - valid.length === 1 ? '1 scartata esclusa' : `${rows.length - valid.length} scartate escluse`} dai totali` : ''}`;
    return { rows, totImp, totBollo, summary };
}
// withLinks: only for the copy inside the ZIP, where each fattura PDF sits
// next to it, so the Numero opens that PDF.
function registroPdfBlob(owner, year, d, withLinks) {
    const p = expNewPdf(true);
    const y = expHeader(p, owner, `Registro fatture ${year}`, d.summary);
    expTable(p, y, [
        { label: 'Numero', w: 18 }, { label: 'Data', w: 22 }, { label: 'Intestatario', w: 52 }, { label: 'C.F.', w: 40 },
        { label: 'Allievo', w: 46 }, { label: 'Importo (EUR)', w: 26, align: 'right' }, { label: 'Bollo', w: 16, align: 'right' },
        { label: 'Stato SdI', w: 24 }, { label: 'Origine', w: 29 }
    ], d.rows.map((r) => ({ cells: [r.numero, r.data, r.intestatario, r.cf, r.allievo, expMoney(r.importo), r.bollo ? expMoney(r.bollo) : '-', r.stato, r.origine], fill: r.stato === 'Scartata' ? [253, 236, 236] : null, link: withLinks ? r.file : null }))
        .concat([{ cells: ['', '', 'TOTALE', '', '', expMoney(d.totImp), expMoney(d.totBollo), '', ''], bold: true, fill: [232, 240, 254] }]));
    expFooters(p);
    return p.doc.output('blob');
}
// withLinks: as in registroPdfBlob, the Numero opens the fattura PDF in the ZIP
function registroSheet(owner, year, d, withLinks) {
    const head = [['Corso di Danza (' + owner.name + ')'], [owner.addr], [`C.F. ${owner.cf} · P.IVA ${owner.piva}`], ...(owner.fiscal ? [[owner.fiscal]] : []), [], [`Registro fatture ${year}`], [d.summary], [],
        ['Numero', 'Data', 'Intestatario', 'C.F.', 'Allievo', 'Importo (EUR)', 'Bollo (EUR)', 'Stato SdI', 'Origine']];
    return {
        name: `Fatture ${year}`,
        widths: [10, 12, 28, 20, 24, 14, 10, 13, 16],
        rows: [...head, ...d.rows.map((r) => [r.numero, r.data, r.intestatario, r.cf, r.allievo, r.importo, r.bollo || '', r.stato, r.origine]),
            ['TOTALE', '', '', '', '', d.totImp, d.totBollo, '', '']],
        links: withLinks ? d.rows.map((r, i) => (r.file ? { r: head.length + i, c: 0, target: r.file } : null)).filter(Boolean) : []
    };
}
function exportFatture(kind) {
    const owner = expOwnerOrWarn();
    if (!owner) return;
    const year = Number(document.getElementById('fattureYear')?.value) || new Date().getFullYear();
    const d = registroData(year);
    if (!d.rows.length) { alert(`No fatture in ${year}.`); return; }
    const name = `Registro_fatture_${year}`;
    if (kind === 'xlsx') { expXlsx([registroSheet(owner, year, d, false)], name + '.xlsx'); return; }
    expDeliver(registroPdfBlob(owner, year, d), name + '.pdf');
}

// ---------- All fatture of the year in one ZIP (for an office) ----------
// Built in the browser and downloaded straight to this device: nothing is
// saved to the website or the database. Each PDF is the same one «PDF»
// opens (the uploaded file for one added by hand, otherwise built from the
// data), plus the Registro on top as PDF and Excel, where each Numero opens
// its PDF. Rejected fatture are left out (not valid).
async function exportFatturePdfZip(btn) {
    const owner = expOwnerOrWarn();
    if (!owner) return;
    if (typeof JSZip === 'undefined') { alert('ZIP not available: reload the page and try again.'); return; }
    const year = Number(document.getElementById('fattureYear')?.value) || new Date().getFullYear();
    const list = fattureList.filter((f) => f.anno === year && f.status !== 'rejected').sort((a, b) => a.numero - b.numero);
    if (!list.length) { alert(`No fatture in ${year}.`); return; }
    const label = btn ? btn.textContent : '';
    const zip = new JSZip();
    const failed = [];
    try {
        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            if (btn) { btn.disabled = true; btn.textContent = `PDF ${i + 1}/${list.length}…`; }
            let blob = null;
            if (f.manual_pdf_path) {
                const { data, error } = await supabaseClient.storage.from(TAX_BUCKET).download(f.manual_pdf_path);
                if (!error && data) blob = data; else failed.push(fmtNumeroFattura(f));
            }
            if (!blob) blob = buildFatturaPdf(fatturaSettings, f).output('blob');
            zip.file(expFatturaFile(f), blob);
        }
        const d = registroData(year);
        zip.file(`000_Registro_fatture_${year}.pdf`, registroPdfBlob(owner, year, d, true));
        if (typeof XLSX !== 'undefined') zip.file(`000_Registro_fatture_${year}.xlsx`, expXlsxBlob([registroSheet(owner, year, d, true)]));
        if (btn) btn.textContent = 'ZIP…';
        const out = await zip.generateAsync({ type: 'blob' });
        expDeliver(out, `Fatture_${year}.zip`);
        if (failed.length) alert(`ZIP ready. The uploaded PDF of ${failed.join(', ')} couldn't be read, so a PDF built from the data was put in instead.`);
    } catch (e) {
        alert('Could not make the ZIP: ' + (e?.message || e));
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = label; }
    }
}
