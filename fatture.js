// ============================================================================
// fatture.js — admin.html only (fatture_xml.sql).
//
// Builds the FatturaPA XML (FPR12, privato, CodiceDestinatario 0000000) for
// a recharge, with exactly the structure of the studio's own fattura that
// AdE accepted (8/26): RF19, one line, Natura N2.2, no DatiBollo, no
// DatiPagamento, Causale only if switched on in settings. Plus the studio's
// own PDF (jsPDF, laid out like AdE's PDF), and the register (Fatture tab).
//
// Nothing is sent to AdE: the user downloads the XML and uploads it in
// "Fatture e Corrispettivi", then marks the result here. The student sees
// the PDF in member.html only once it's marked Accettata.
//
// Relies on admin.html globals at call time (never at load time):
// supabaseClient, students, v2CreditTransactions, escapeHtml, icon,
// iconLabel, getStudentAnagrafica, publishMemberDoc, MEMBER_DOCS_BUCKET,
// TAX_BUCKET, formatLocalDate, isStudentActive, writeStudentWithSchemaFallback,
// currentViewingStudentId, renderStudentViewModal, and window.Anagrafica.
// ============================================================================

let fattureList = [];
let fatturaSettings = null;
let fattureMissing = false;

const FATTURA_STATUS = {
    created: { label: 'Created', badge: 'badge-neutral', hint: 'XML created, not uploaded to AdE yet' },
    uploaded: { label: 'Uploaded to AdE', badge: 'badge-warning', hint: 'Uploaded in «Fatture e Corrispettivi», waiting for the outcome' },
    accepted: { label: 'Accepted', badge: 'badge-success', hint: 'AdE outcome: «Consegnata», or «Mancata consegna» / «Impossibilità di recapito» (normal for private persons: the fattura is valid)' },
    rejected: { label: 'Rejected', badge: 'badge-danger', hint: 'AdE outcome: «Scartata». Correct it and resend with the same number and date' }
};
const REGIME_LABELS = {
    RF19: 'Regime forfettario (art.1, c.54-89, L. 190/2014)',
    RF01: 'Ordinario',
    RF02: 'Contribuenti minimi (art.1, c.96-117, L. 244/07)',
    RF18: 'Altro'
};
const NATURA_LABELS = {
    'N1': 'Escluse ex art. 15 del DPR 633/72',
    'N2.1': 'Non soggette ad IVA ai sensi degli artt. da 7 a 7-septies del DPR 633/72',
    'N2.2': 'Non soggette - altri casi',
    'N3.6': 'Non imponibili - altre operazioni',
    'N4': 'Esenti',
    'N5': 'Regime del margine / IVA non esposta in fattura',
    'N7': 'IVA assolta in altro stato UE'
};

// ---------- loading ----------
async function loadFattureData() {
    try {
        const [{ data: st, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
            supabaseClient.from('fattura_settings').select('*').eq('id', 1).maybeSingle(),
            supabaseClient.from('fatture').select('*').is('deleted_at', null).order('anno', { ascending: false }).order('numero', { ascending: false })
        ]);
        if (e1 || e2) throw (e1 || e2);
        fatturaSettings = st || {};
        fattureList = rows || [];
        fattureMissing = false;
        // fatture_todo.sql: «Non serve» payments. Missing table = feature off.
        const { data: skips, error: e3 } = await supabaseClient.from('fattura_skips').select('transaction_id');
        fatturaTodoReady = !e3;
        fatturaSkipIds = new Set((skips || []).map((r) => r.transaction_id));
    } catch (e) {
        console.error('Fatture not available (has fatture_xml.sql been run?):', e);
        fattureMissing = true;
        fattureList = [];
        fatturaSettings = null;
    }
}

let fatturaTodoReady = false;     // fatture_todo.sql run
let fatturaSkipIds = new Set();    // recharges marked «Non serve»
let fattureTodoView = 'todo';      // 'todo' | 'done' | 'skipped'
const FATTURE_FROM_DEFAULT = '2025-09-29'; // P.IVA start; editable in Impostazioni

// ---------- small helpers ----------
function fmtNumeroFattura(f) { return `${f.numero}/${String(f.anno).slice(-2)}`; }
function money2(n) { return (Math.round(Number(n || 0) * 100) / 100).toFixed(2); }
function moneyIt(n) { return money2(n).replace('.', ','); }
function plainIt(n) { // 30 -> "30", 30.5 -> "30,5" (AdE PDF shows the unit price like this)
    const v = Math.round(Number(n || 0) * 100) / 100;
    return String(v).replace('.', ',');
}
function dateIt(d) { const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}.${m}.${y}`; }
function fatturaForTransaction(txId) { return fattureList.find((f) => f.transaction_id === txId) || null; }
function fattureOfStudent(studentId) { return fattureList.filter((f) => f.student_id === studentId); }

function nextFatturaNumber(anno) {
    const nums = fattureList.filter((f) => f.anno === anno).map((f) => f.numero);
    const fromSettings = fatturaSettings && Number(fatturaSettings.start_year) === anno ? Number(fatturaSettings.start_number) || 1 : 1;
    return Math.max(fromSettings, nums.length ? Math.max(...nums) + 1 : 1);
}
function lastFatturaDate(anno, exceptId) {
    const ds = fattureList.filter((f) => f.anno === anno && f.id !== exceptId).map((f) => String(f.data_fattura).slice(0, 10));
    return ds.length ? ds.sort().pop() : null;
}
// 5-char progressivo for the file name / ProgressivoInvio. Encodes year,
// number and revision, so a corrected resend of a rejected fattura gets a
// new file name (AdE refuses a file name it has already received).
function fatturaProgressivo(f) {
    const n = (f.anno % 100) * 500000 + f.numero * 10 + ((f.revision || 0) % 10);
    return n.toString(36).toUpperCase().padStart(5, '0');
}
function fatturaFileName(st, f) { return `IT${st.partita_iva || st.codice_fiscale}_${fatturaProgressivo(f)}.xml`; }

function validatePartitaIva(piva) {
    const p = String(piva || '').replace(/\s/g, '');
    if (!/^\d{11}$/.test(p)) return false;
    let sum = 0;
    for (let i = 0; i < 11; i += 1) {
        let d = Number(p[i]);
        if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
        sum += d;
    }
    return sum % 10 === 0;
}

// Latin-1 only (what SdI accepts), XML-escaped.
function xmlText(s) {
    const latin = String(s ?? '').normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
        .split('').map((ch) => (ch.charCodeAt(0) <= 255 ? ch : (ch.normalize('NFD')[0].charCodeAt(0) <= 255 ? ch.normalize('NFD')[0] : ''))).join('');
    return latin.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// ---------- validation ----------
function fatturaSettingsProblems(st) {
    const A = window.Anagrafica;
    const p = [];
    if (!st) return ['fattura settings missing'];
    if (!st.denominazione && (!st.nome || !st.cognome)) p.push("studio's first and last name (or company name)");
    if (!validatePartitaIva(st.partita_iva)) p.push("studio's partita IVA");
    if (!A.validateCodiceFiscale(st.codice_fiscale).valid && !validatePartitaIva(st.codice_fiscale)) p.push("studio's codice fiscale");
    if (!st.indirizzo) p.push("studio's street");
    if (!/^\d{5}$/.test(String(st.cap || ''))) p.push("studio's CAP (postcode)");
    if (!st.comune) p.push("studio's comune (town)");
    if (!/^[A-Z]{2}$/.test(String(st.provincia || ''))) p.push("studio's provincia");
    if (!st.natura) p.push('natura IVA');
    return p;
}
// { problems (block), warnings (confirm) } for a fattura's own data.
function fatturaDataChecks(f, { manual } = {}) {
    const A = window.Anagrafica;
    const problems = [];
    const warnings = [];
    if (!f.recipient_nome || !f.recipient_cognome) problems.push("The recipient's first and last name are required.");
    const cfv = A.validateCodiceFiscale(f.recipient_cf);
    if (!cfv.valid) problems.push("Recipient's codice fiscale: " + cfv.reason + '.');
    else if (A.cfMatchesName(f.recipient_cf, f.recipient_nome, f.recipient_cognome) === false) {
        warnings.push(A.cfMatchesName(f.recipient_cf, f.recipient_cognome, f.recipient_nome)
            ? 'First and last name look swapped compared to the codice fiscale.'
            : "The codice fiscale doesn't match the first and last name.");
    }
    if (!manual || [f.recipient_via, f.recipient_cap, f.recipient_comune].some(Boolean)) {
        const av = A.validateAddress({ via: f.recipient_via, civico: f.recipient_civico, cap: f.recipient_cap, comune: f.recipient_comune, provincia: f.recipient_provincia });
        av.problems.forEach((x) => problems.push('Address: ' + x + '.'));
        av.warnings.forEach((x) => warnings.push('Address: ' + x + '.'));
    }
    if (!(Number(f.importo) > 0)) problems.push('The amount must be more than zero.');
    if (!f.descrizione) problems.push('The description is required.');
    if (!f.data_fattura) problems.push('The date is required.');
    else if (f.data_fattura > formatLocalDate(new Date())) problems.push("The date can't be in the future.");
    if (!(f.numero >= 1)) problems.push('Invalid fattura number.');
    return { problems, warnings };
}

// ---------- XML ----------
function buildFatturaXml(st, f) {
    const cedenteAnagrafica = st.denominazione
        ? `<Denominazione>${xmlText(st.denominazione)}</Denominazione>`
        : `<Nome>${xmlText(st.nome)}</Nome><Cognome>${xmlText(st.cognome)}</Cognome>`;
    const idTrasmittente = String(st.codice_fiscale || st.partita_iva).toUpperCase();
    const sede = (via, civico, cap, comune, prov) =>
        `<Sede><Indirizzo>${xmlText(via)}</Indirizzo>${civico ? `<NumeroCivico>${xmlText(civico)}</NumeroCivico>` : ''}<CAP>${xmlText(cap)}</CAP><Comune>${xmlText(comune)}</Comune>${prov ? `<Provincia>${xmlText(prov)}</Provincia>` : ''}<Nazione>IT</Nazione></Sede>`;
    const importo = money2(f.importo);
    const causale = st.include_causale && st.causale ? `<Causale>${xmlText(String(st.causale).slice(0, 200))}</Causale>` : '';
    const rifNorm = st.riferimento_normativo ? `<RiferimentoNormativo>${xmlText(String(st.riferimento_normativo).slice(0, 100))}</RiferimentoNormativo>` : '';
    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<ns2:FatturaElettronica xmlns:ns2="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" versione="FPR12">'
        + '<FatturaElettronicaHeader>'
        + '<DatiTrasmissione>'
        + `<IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>${xmlText(idTrasmittente)}</IdCodice></IdTrasmittente>`
        + `<ProgressivoInvio>${fatturaProgressivo(f)}</ProgressivoInvio>`
        + '<FormatoTrasmissione>FPR12</FormatoTrasmissione>'
        + '<CodiceDestinatario>0000000</CodiceDestinatario>'
        + '</DatiTrasmissione>'
        + '<CedentePrestatore><DatiAnagrafici>'
        + `<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${xmlText(st.partita_iva)}</IdCodice></IdFiscaleIVA>`
        + `<CodiceFiscale>${xmlText(String(st.codice_fiscale).toUpperCase())}</CodiceFiscale>`
        + `<Anagrafica>${cedenteAnagrafica}</Anagrafica>`
        + `<RegimeFiscale>${xmlText(st.regime_fiscale || 'RF19')}</RegimeFiscale>`
        + '</DatiAnagrafici>'
        + sede(st.indirizzo, st.numero_civico, st.cap, st.comune, st.provincia)
        + '</CedentePrestatore>'
        + '<CessionarioCommittente><DatiAnagrafici>'
        + `<CodiceFiscale>${xmlText(String(f.recipient_cf).toUpperCase())}</CodiceFiscale>`
        + `<Anagrafica><Nome>${xmlText(f.recipient_nome)}</Nome><Cognome>${xmlText(f.recipient_cognome)}</Cognome></Anagrafica>`
        + '</DatiAnagrafici>'
        + sede(f.recipient_via, f.recipient_civico, f.recipient_cap, f.recipient_comune, f.recipient_provincia)
        + '</CessionarioCommittente>'
        + '</FatturaElettronicaHeader>'
        + '<FatturaElettronicaBody>'
        + '<DatiGenerali><DatiGeneraliDocumento>'
        + '<TipoDocumento>TD01</TipoDocumento><Divisa>EUR</Divisa>'
        + `<Data>${String(f.data_fattura).slice(0, 10)}</Data>`
        + `<Numero>${fmtNumeroFattura(f)}</Numero>`
        + `<ImportoTotaleDocumento>${importo}</ImportoTotaleDocumento>`
        + causale
        + '</DatiGeneraliDocumento></DatiGenerali>'
        + '<DatiBeniServizi>'
        + '<DettaglioLinee><NumeroLinea>1</NumeroLinea>'
        + `<Descrizione>${xmlText(String(f.descrizione).slice(0, 1000))}</Descrizione>`
        + `<PrezzoUnitario>${importo}</PrezzoUnitario><PrezzoTotale>${importo}</PrezzoTotale>`
        + `<AliquotaIVA>0.00</AliquotaIVA><Natura>${xmlText(st.natura || 'N2.2')}</Natura>`
        + '</DettaglioLinee>'
        + `<DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><Natura>${xmlText(st.natura || 'N2.2')}</Natura>`
        + `<ImponibileImporto>${importo}</ImponibileImporto><Imposta>0.00</Imposta>${rifNorm}</DatiRiepilogo>`
        + '</DatiBeniServizi>'
        + '</FatturaElettronicaBody>'
        + '</ns2:FatturaElettronica>';
}

// ---------- PDF (laid out like AdE's own PDF of the same fattura) ----------
function buildFatturaPdf(st, f) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const L = 10, R = 200;
    const latin = (s) => String(s ?? '').split('').map((ch) => (ch.charCodeAt(0) <= 255 ? ch : ' ')).join('');
    const font = (style, size) => { doc.setFont('courier', style); doc.setFontSize(size); };
    const line = (y, w) => { doc.setLineWidth(w || 0.5); doc.line(L, y, R, y); };

    // Cedente (top right)
    const cedenteName = st.denominazione ? String(st.denominazione).toUpperCase() : `${String(st.cognome || '').toUpperCase()}, ${String(st.nome || '').toUpperCase()}`;
    font('bold', 10);
    let y = 16;
    const head = doc.splitTextToSize(latin(`${cedenteName} - C.F. ${String(st.codice_fiscale || '').toUpperCase()} - P.IVA ${st.partita_iva || ''} (IT)`), 140);
    doc.text(head, 60, y); y += head.length * 4.5 + 1.5;
    font('bold', 7); doc.text('Regime fiscale:', 60, y);
    font('normal', 7); doc.text(latin(REGIME_LABELS[st.regime_fiscale] || st.regime_fiscale || ''), 84, y); y += 5;
    font('bold', 8); doc.text('Sede:', 60, y);
    font('normal', 8);
    doc.text(latin(`${st.indirizzo || ''}${st.numero_civico ? ', ' + st.numero_civico : ''} - ${st.cap || ''} ${st.comune || ''} (${st.provincia || ''} - IT)`), 70, y);
    y += 7;
    doc.setLineDashPattern([0.5, 0.8], 0); doc.setLineWidth(0.3); doc.line(60, y, R, y); doc.setLineDashPattern([], 0);
    y += 7; line(y, 0.6);

    // Fattura / numero / data (left) + cessionario (right)
    const top = y;
    font('bolditalic', 14);
    doc.text('Fattura', 40, top + 10, { align: 'center' });
    doc.text(`Numero: ${fmtNumeroFattura(f)}`, 40, top + 16, { align: 'center' });
    doc.text(dateIt(f.data_fattura), 40, top + 22, { align: 'center' });
    font('bolditalic', 9); doc.text('Cessionario/committente', 88, top + 7);
    font('bold', 10);
    const cess = doc.splitTextToSize(latin(`${f.recipient_cognome}, ${f.recipient_nome} - C.F. ${String(f.recipient_cf).toUpperCase()}`), 112);
    doc.text(cess, 88, top + 11.5);
    let cy = top + 11.5 + cess.length * 4.5 + 2;
    font('bold', 8); doc.text('Sede:', 88, cy);
    font('normal', 8);
    const sedeTxt = doc.splitTextToSize(latin(`${f.recipient_via || ''}${f.recipient_civico ? ', ' + f.recipient_civico : ''} - ${f.recipient_cap || ''} ${f.recipient_comune || ''} (${f.recipient_provincia || ''} - IT)`), 102);
    doc.text(sedeTxt, 98, cy);
    cy += sedeTxt.length * 3.6;
    y = Math.max(top + 28, cy + 4);
    line(y, 0.6);

    // Line table
    y += 7;
    font('bolditalic', 6.5);
    doc.text('Descrizione', 14, y);
    doc.text('Quantità', 96, y);
    doc.text('Prezzo', 126, y - 1.5, { align: 'right' }); doc.text('unitario', 126, y + 1, { align: 'right' });
    doc.text('Sconto/Magg.', 130, y);
    doc.text('Ritenuta', 150, y);
    doc.text('I.V.A.', 168, y);
    doc.text('Importo', R, y, { align: 'right' });
    y += 8;
    font('bold', 9);
    doc.text('1', L, y);
    const descr = doc.splitTextToSize(latin(f.descrizione), 82);
    doc.text(descr, 13, y);
    font('normal', 8.5);
    doc.text(plainIt(f.importo), 126, y, { align: 'right' });
    doc.text('0,00%', 176, y, { align: 'right' });
    doc.text(moneyIt(f.importo), R, y, { align: 'right' });
    y += descr.length * 4 + 0.5;
    font('bolditalic', 6.5); doc.text('Natura:', 14, y);
    font('normal', 6.5); doc.text(latin(NATURA_LABELS[st.natura] || st.natura || ''), 24, y);
    y += 14; line(y, 0.6);

    // Dati di riepilogo
    y += 10;
    font('bolditalic', 9); doc.text('Dati di riepilogo', L, y);
    y += 9;
    font('bolditalic', 6.5);
    doc.text('Aliquota', L, y);
    doc.text('Natura', 70, y, { align: 'right' });
    doc.text('Esigibilità', 92, y - 1.5, { align: 'right' }); doc.text('IVA', 92, y + 1, { align: 'right' });
    doc.text('Spese accessorie', 104, y);
    doc.text('Arrotondamento', 136, y);
    doc.text('Imponibile', 172, y, { align: 'right' });
    doc.text('Imposta', R, y, { align: 'right' });
    y += 8;
    font('bold', 8); doc.text('0,00%', L, y);
    font('normal', 8);
    const natTxt = doc.splitTextToSize(latin(NATURA_LABELS[st.natura] || st.natura || ''), 42);
    doc.text(natTxt, 70, y - 1, { align: 'right' });
    doc.text(moneyIt(f.importo), 172, y, { align: 'right' });
    doc.text('0,00', R, y, { align: 'right' });
    y += Math.max(natTxt.length * 3.5, 4) + 10;

    if (st.include_causale && st.causale) {
        line(y, 0.6);
        y += 8;
        font('bolditalic', 9); doc.text('Causale', L, y);
        font('normal', 8);
        const caus = doc.splitTextToSize(latin(st.causale), 130);
        doc.text(caus, 40, y + 2);
        y += caus.length * 3.6 + 8;
    }
    doc.setLineWidth(0.5); doc.line(L, y, R, y); doc.line(L, y + 1, R, y + 1);

    // TOTALE box
    y += 9;
    doc.setLineWidth(0.4); doc.rect(105, y, 95, 15);
    font('bolditalic', 9); doc.text('TOTALE', 128, y + 7);
    font('bolditalic', 12); doc.text(moneyIt(f.importo), 182, y + 7.3, { align: 'right' });
    font('bolditalic', 6.5); doc.text('(EUR)', 183, y + 7.3);

    if (st.pdf_footer) {
        font('italic', 7);
        doc.text(doc.splitTextToSize(latin(st.pdf_footer), 180), 105, 287, { align: 'center' });
    }
    return doc;
}

function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function downloadFatturaXml(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f || !f.xml) { alert('This fattura has no XML file (added by hand).'); return; }
    downloadBlob(new Blob([f.xml], { type: 'application/xml' }), f.file_name || `fattura_${f.numero}_${f.anno}.xml`);
}
async function downloadFatturaPdf(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f) return;
    const name = `Fattura_${f.numero}-${String(f.anno).slice(-2)}_${f.recipient_cognome || ''}.pdf`.replace(/\s+/g, '_');
    if (f.manual_pdf_path) {
        const { data, error } = await supabaseClient.storage.from(TAX_BUCKET).download(f.manual_pdf_path);
        if (error) { alert('Could not download the PDF: ' + error.message); return; }
        downloadBlob(data, name);
        return;
    }
    downloadBlob(buildFatturaPdf(fatturaSettings, f).output('blob'), name);
}

// Opens the PDF in a new tab (the list's quick "PDF" button) instead of
// downloading it: the uploaded AdE PDF when there is one, else ours.
async function openFatturaPdf(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f) return;
    openFileSmart({ // pdfview.js: new tab on the computer, Apri/Condividi/Scarica on the phone
        name: `Fattura_${f.numero}-${String(f.anno).slice(-2)}_${f.recipient_cognome || ''}.pdf`.replace(/\s+/g, '_'),
        getBlob: async () => {
            if (f.manual_pdf_path) {
                const { data, error } = await supabaseClient.storage.from(TAX_BUCKET).download(f.manual_pdf_path);
                if (error) throw error;
                return new Blob([data], { type: 'application/pdf' });
            }
            return buildFatturaPdf(fatturaSettings, f).output('blob');
        }
    });
}

// ---------- student PDF publishing (only while Accettata) ----------
async function publishFatturaPdf(f) {
    if (!f.student_id) return null; // no student = no member portal to show it in
    let blob;
    if (f.manual_pdf_path) {
        const { data, error } = await supabaseClient.storage.from(TAX_BUCKET).download(f.manual_pdf_path);
        if (error) throw error;
        blob = data;
    } else {
        blob = buildFatturaPdf(fatturaSettings, f).output('blob');
    }
    return publishMemberDoc(blob, 'pdf');
}
async function unpublishFatturaPdf(f) {
    if (!f.pdf_token) return;
    await supabaseClient.storage.from(MEMBER_DOCS_BUCKET).remove([f.pdf_token]);
}

// quick = the one-tap "Caricata su AdE ✓" (no confirm): every uploaded XML so
// far has been accepted, so uploading = Accettata. If AdE ever says "Scartata",
// switch it to Scartata from the fattura and correct it.
async function setFatturaStatus(id, status, quick) {
    const f = fattureList.find((x) => x.id === id);
    if (!f || f.status === status) return;
    if (status === 'accepted' && !quick && !confirm(`Mark fattura ${fmtNumeroFattura(f)} as ACCEPTED?\n\nOnly if AdE shows «Consegnata», or «Mancata consegna» / «Impossibilità di recapito» (normal for private persons: the fattura is valid).\nThe student will see the PDF in their portal.`)) return;
    if (status === 'rejected' && !confirm(`Mark fattura ${fmtNumeroFattura(f)} as REJECTED («Scartata»)?\n\nThen you can correct it and download the new XML with the same number and date.`)) return;
    const update = { status, status_updated_at: new Date().toISOString() };
    try {
        if (status === 'accepted') {
            update.pdf_token = await publishFatturaPdf(f);
        } else if (f.status === 'accepted' && f.pdf_token) {
            await unpublishFatturaPdf(f);
            update.pdf_token = null;
        }
    } catch (e) {
        alert("Could not prepare the student's PDF: " + (e?.message || e));
        return;
    }
    const { error } = await supabaseClient.from('fatture').update(update).eq('id', id);
    if (error) { alert('Could not save the status: ' + error.message); return; }
    Object.assign(f, update);
    refreshFattureViews();
    if (!quick || document.getElementById('fatturaModal')?.style.display === 'flex') openFatturaView(id);
}

// ---------- old fatture from the removed Reports tab (tax_records) ----------
// Each old entry (date + "Tax File No" + PDF) is imported into the register
// one by one: prefilled from the student, the admin checks it against the
// PDF and types the amount. legacy_payment_id (fatture_import.sql) prevents
// a second import of the same entry.
function legacyFattureToImport(studentId) {
    if (typeof taxRecordsCache === 'undefined') return [];
    const imported = new Set(fattureList.map((f) => f.legacy_payment_id).filter(Boolean));
    const out = [];
    Object.keys(taxRecordsCache).forEach((sid) => {
        if (studentId && Number(sid) !== studentId) return;
        const s = students.find((x) => x.id === Number(sid));
        (taxRecordsCache[sid].payments || []).forEach((p) => {
            if (!p || !p.id || imported.has(p.id)) return;
            out.push({ student: s || null, studentId: Number(sid), payment: p });
        });
    });
    return out.sort((a, b) => String(b.payment.date || '').localeCompare(String(a.payment.date || '')));
}
// "9/26", "n. 9/2026", "9-26", "9" -> { numero, anno }
function parseLegacyNumero(taxFileNo, date) {
    const t = String(taxFileNo || '');
    const m = t.match(/(\d{1,5})\s*[\/\-]\s*(\d{2,4})/);
    const yearFromDate = Number(String(date || '').slice(0, 4)) || new Date().getFullYear();
    if (m) {
        const y = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
        return { numero: Number(m[1]), anno: y };
    }
    const n = t.match(/\d{1,5}/);
    return { numero: n ? Number(n[0]) : null, anno: yearFromDate };
}
function openLegacyImport(studentId, paymentId) {
    if (!fatturaFeatureReady()) return;
    const item = legacyFattureToImport(studentId).find((x) => x.payment.id === paymentId);
    if (!item) return;
    const p = item.payment;
    const date = String(p.date || formatLocalDate(new Date())).slice(0, 10);
    const parsed = parseLegacyNumero(p.taxFileNo, date);
    const base = item.student ? fatturaRecipientFor(item.student, date) : {
        recipient_type: 'student', recipient_nome: '', recipient_cognome: '', recipient_cf: '',
        recipient_via: '', recipient_civico: '', recipient_cap: '', recipient_comune: '', recipient_provincia: '',
        descrizione: (fatturaSettings && fatturaSettings.descrizione_adulti) || 'corso di danza'
    };
    fatturaDraft = {
        mode: 'manual', student_id: item.student ? item.student.id : null, transaction_id: null, source: 'manual',
        data_fattura: date, anno: parsed.anno || Number(date.slice(0, 4)), numero: parsed.numero || '', importo: '', revision: 0,
        ...base,
        legacy: { paymentId: p.id, pdfPath: p.pdfPath || '', publicToken: p.publicToken || '', taxFileNo: p.taxFileNo || '' }
    };
    openFatturaModalShell('Import fattura from the old archive', `${item.student ? item.student.name : 'Unknown student'} · ${dateIt(date)} · Tax File No: ${p.taxFileNo || '—'}`);
    renderFatturaForm();
}

// Permanently delete an old Tax Records entry the admin doesn't want in the
// register (wrong details): the record, its PDF, and the copy the student
// could see in their portal.
async function deleteLegacyFattura(studentId, paymentId) {
    const rec = getTaxRecord(studentId);
    const p = (rec.payments || []).find((x) => x.id === paymentId);
    if (!p) return;
    const s = students.find((x) => x.id === studentId);
    if (!confirm(`Permanently delete the old fattura ${p.taxFileNo || ''} of ${p.date ? dateIt(p.date) : '—'}${s ? ' (' + s.name + ')' : ''}?\n\nIts PDF and the copy the student can see are deleted too. This can't be undone.`)) return;
    try {
        if (p.pdfPath) await supabaseClient.storage.from(TAX_BUCKET).remove([p.pdfPath]);
        if (p.publicToken) await supabaseClient.storage.from(MEMBER_DOCS_BUCKET).remove([`${p.publicToken}.pdf`]);
    } catch (e) { console.error('Could not remove old fattura files:', e); }
    rec.payments = (rec.payments || []).filter((x) => x.id !== paymentId);
    taxRecordsCache[String(studentId)] = rec;
    await _upsertTaxRecord(studentId, rec);
    refreshFattureViews();
}

// ---------- the fattura modal ----------
let fatturaDraft = null; // { mode: 'create'|'manual'|'correct', ...row fields }

function openFatturaModalShell(title, subtitle) {
    document.getElementById('fatturaModalTitle').textContent = title;
    document.getElementById('fatturaModalSubtitle').textContent = subtitle || '';
    document.getElementById('fatturaModal').style.display = 'flex';
}
function closeFatturaModal() {
    document.getElementById('fatturaModal').style.display = 'none';
    fatturaDraft = null;
}
function fatturaFeatureReady() {
    if (fattureMissing) { alert('Fatture are not active yet: run fatture_xml.sql in Supabase, then refresh the page.'); return false; }
    return true;
}

// Recipient fields for a student on a date: the parent for a minor (age
// from the codice fiscale), the student otherwise.
function fatturaRecipientFor(s, onDate, forceType) {
    const A = window.Anagrafica;
    const an = getStudentAnagrafica(s);
    const minor = A.isMinorOnDate(an.cf, s.age, onDate);
    const type = forceType || (minor ? 'parent' : 'student');
    const st = fatturaSettings || {};
    const childName = `${an.nome} ${an.cognome}`.trim();
    return {
        minor,
        recipient_type: type,
        recipient_nome: type === 'parent' ? an.parentNome : an.nome,
        recipient_cognome: type === 'parent' ? an.parentCognome : an.cognome,
        recipient_cf: type === 'parent' ? an.parentCf : an.cf,
        recipient_via: an.addr.via, recipient_civico: an.addr.civico, recipient_cap: an.addr.cap,
        recipient_comune: an.addr.comune, recipient_provincia: an.addr.provincia,
        descrizione: type === 'parent'
            ? String(st.descrizione_minori || 'corso di danza (per bambini - {allievo})').replace('{allievo}', childName)
            : String(st.descrizione_adulti || 'corso di danza')
    };
}

function openFatturaFromTransaction(txId) {
    if (!fatturaFeatureReady()) return;
    const existing = fatturaForTransaction(txId);
    if (existing) { openFatturaView(existing.id); return; }
    const tx = v2CreditTransactions.find((t) => t.id === txId);
    const s = tx && students.find((x) => x.id === tx.student_id);
    if (!tx || !s) return;
    const settingsProblems = fatturaSettingsProblems(fatturaSettings);
    if (settingsProblems.length) {
        alert('First complete the fattura Settings:\n- ' + settingsProblems.join('\n- '));
        openFatturaSettings();
        return;
    }
    const today = formatLocalDate(new Date());
    const anno = Number(today.slice(0, 4));
    fatturaDraft = {
        mode: 'create', student_id: s.id, transaction_id: tx.id, source: 'app',
        data_fattura: today, anno, numero: nextFatturaNumber(anno), importo: Number(tx.amount), revision: 0,
        ...fatturaRecipientFor(s, today)
    };
    openFatturaModalShell('New fattura', `${s.name} · payment €${tx.amount} of ${dateIt(String(tx.created_at).slice(0, 10))}`);
    renderFatturaForm();
}

function openManualFattura() {
    if (!fatturaFeatureReady()) return;
    const today = formatLocalDate(new Date());
    const anno = Number(today.slice(0, 4));
    fatturaDraft = {
        mode: 'manual', student_id: null, transaction_id: null, source: 'manual',
        data_fattura: today, anno, numero: nextFatturaNumber(anno), importo: '', revision: 0,
        recipient_type: 'student', recipient_nome: '', recipient_cognome: '', recipient_cf: '',
        recipient_via: '', recipient_civico: '', recipient_cap: '', recipient_comune: '', recipient_provincia: '',
        descrizione: (fatturaSettings && fatturaSettings.descrizione_adulti) || 'corso di danza'
    };
    openFatturaModalShell('Add a fattura already issued', 'For fatture made directly on the AdE website (e.g. up to 9/26). No XML is created.');
    renderFatturaForm();
}

// Edit a fattura added by hand / imported (source 'manual'): it's only a
// register entry (nothing was sent to AdE from here), so every field —
// date, importo, number, intestatario — can be fixed at any time.
function startManualFatturaEdit(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f || f.source !== 'manual') return;
    fatturaDraft = { ...f, mode: 'editManual' };
    openFatturaModalShell(`Edit fattura ${fmtNumeroFattura(f)}`, 'Added by hand: fix the data as in the PDF. Nothing changes on AdE.');
    renderFatturaForm();
}

function startFatturaCorrection(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f) return;
    fatturaDraft = { ...f, mode: 'correct' };
    openFatturaModalShell(`Correct fattura ${fmtNumeroFattura(f)}`, 'Same number and same date: AdE accepts the resend of a rejected fattura within 5 days.');
    renderFatturaForm();
}

function renderFatturaForm() {
    const d = fatturaDraft;
    const body = document.getElementById('fatturaModalBody');
    const footer = document.getElementById('fatturaModalFooter');
    const v = (x) => escapeHtml(x == null ? '' : String(x));
    const locked = d.mode === 'correct';
    const manualLike = d.mode === 'manual' || d.mode === 'editManual';
    const s = d.student_id ? students.find((x) => x.id === d.student_id) : null;
    const studentOptions = manualLike
        ? `<div class="field"><label>Student (to show them the PDF)</label>
            <select id="fmStudent" onchange="onFatturaStudentChange()">
                <option value="">— none —</option>
                ${students.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${x.id}" ${x.id === d.student_id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}
            </select></div>`
        : '';
    const minorNote = d.minor ? `<div style="font-size:0.8em; color:var(--warning); font-weight:600; margin:-4px 0 10px;">Student under 18: the fattura goes to the parent.</div>` : '';
    body.innerHTML = `
        ${studentOptions}
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>Number</label>
                <div style="display:flex; align-items:center; gap:4px;">
                    <input id="fmNumero" type="number" min="1" value="${v(d.numero)}" ${manualLike ? '' : 'readonly'} style="max-width:90px;">
                    <span style="font-weight:700;">/ <span id="fmAnnoLabel">${String(d.anno).slice(-2)}</span></span>
                </div>
            </div>
            <div class="field" style="flex:1;"><label>Date</label><input id="fmData" type="date" value="${v(d.data_fattura)}" ${locked ? 'readonly' : ''} onblur="onFatturaDateChange()" onkeydown="if (event.key === 'Enter') this.blur();"></div>
        </div>
        ${s ? `<div class="field"><label>Issued to</label>
            <select id="fmTipo" onchange="onFatturaTipoChange()" ${locked ? 'disabled' : ''}>
                <option value="student" ${d.recipient_type === 'student' ? 'selected' : ''}>Student</option>
                <option value="parent" ${d.recipient_type === 'parent' ? 'selected' : ''}>Parent</option>
            </select></div>` : ''}
        ${minorNote}
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>First name («Nome»)</label><input id="fmNome" value="${v(d.recipient_nome)}" oninput="updateFatturaFormChecks()"></div>
            <div class="field" style="flex:1;"><label>Last name («Cognome»)</label><input id="fmCognome" value="${v(d.recipient_cognome)}" oninput="updateFatturaFormChecks()"></div>
        </div>
        <div class="field"><label>Codice fiscale</label><input id="fmCf" maxlength="16" style="text-transform:uppercase;" value="${v(d.recipient_cf)}" oninput="updateFatturaFormChecks()"><div id="fmCfStatus" class="cf-status"></div></div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:3;"><label>Street («Via / Piazza»)</label><input id="fmVia" value="${v(d.recipient_via)}" oninput="updateFatturaFormChecks()"></div>
            <div class="field" style="flex:1;"><label>House no.</label><input id="fmCivico" value="${v(d.recipient_civico)}"></div>
        </div>
        <div class="field"><label>Town («Comune»)</label><input id="fmComune" placeholder="Type and pick from the list…"></div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>Provincia</label><input id="fmProvincia" maxlength="2"></div>
            <div class="field" style="flex:1;"><label>CAP (postcode)</label><input id="fmCap"></div>
        </div>
        <div id="fmAddrStatus" style="font-size:0.78em; font-weight:600; margin:-6px 0 10px;"></div>
        <div class="field"><label>Description (printed on the fattura, in Italian)</label><input id="fmDescrizione" maxlength="200" value="${v(d.descrizione)}"></div>
        <div class="field"><label>Amount (€)</label><input id="fmImporto" type="number" step="0.01" min="0" value="${v(d.importo)}"></div>
        ${d.mode === 'manual' && d.legacy
            ? `<div class="field"><label>Fattura PDF</label>${d.legacy.pdfPath
                ? `<div style="display:flex; align-items:center; gap:8px; font-size:0.86em;"><span style="color:var(--success); font-weight:700;">✓ Already uploaded</span><button type="button" class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(d.legacy.pdfPath).replace(/'/g, "\\'")}')">Open the PDF to check</button></div>`
                : '<div style="font-size:0.84em; color:var(--ink-faint);">No PDF in the old archive: it will be made from the data.</div>'}
                <div style="font-size:0.78em; color:var(--warning); margin-top:6px;">Check number, date, recipient, and type the amount as in the PDF.</div></div>`
            : d.mode === 'manual' ? `<div class="field"><label>Fattura PDF (optional, from AdE)</label><input id="fmPdf" type="file" accept="application/pdf,.pdf"></div>`
            : d.mode === 'editManual' ? `<div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:8px;">${d.manual_pdf_path ? 'The uploaded PDF stays the same.' : 'The PDF is made again with the corrected data.'}</div>` : ''}
        ${s && !manualLike ? `<div style="font-size:0.78em; color:var(--ink-faint);">The data comes from the student's record. If something is wrong, fix it in the record too.</div>` : ''}`;
    const A = window.Anagrafica;
    const comuneEl = document.getElementById('fmComune'), provEl = document.getElementById('fmProvincia'), capEl = document.getElementById('fmCap');
    A.attachComunePicker(comuneEl, provEl, capEl, updateFatturaFormChecks);
    A.setComuneValue(comuneEl, provEl, capEl, d.recipient_comune, d.recipient_provincia, d.recipient_cap);
    A.loadComuni().then(updateFatturaFormChecks).catch(() => {});
    updateFatturaFormChecks();
    const saveLabel = d.mode === 'create' ? 'Create and download XML' : d.mode === 'correct' ? 'Save and download corrected XML' : d.mode === 'editManual' ? 'Save changes' : 'Save to the register';
    footer.innerHTML = `
        <button class="btn btn-outline" onclick="${d.mode === 'correct' || d.mode === 'editManual' ? `openFatturaView(${d.id})` : 'closeFatturaModal()'}">Cancel</button>
        <button class="btn btn-primary" id="fmSaveBtn" onclick="saveFatturaForm()">${saveLabel}</button>`;
}

function readFatturaForm() {
    const d = fatturaDraft;
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const A = window.Anagrafica;
    d.data_fattura = val('fmData');
    d.anno = Number(d.data_fattura.slice(0, 4)) || d.anno;
    d.numero = Number(val('fmNumero'));
    d.recipient_nome = A.titleCase(val('fmNome'));
    d.recipient_cognome = A.titleCase(val('fmCognome'));
    d.recipient_cf = A.normalizeCf(val('fmCf'));
    d.recipient_via = val('fmVia');
    d.recipient_civico = val('fmCivico');
    d.recipient_comune = val('fmComune');
    d.recipient_provincia = val('fmProvincia').toUpperCase();
    d.recipient_cap = val('fmCap');
    d.descrizione = val('fmDescrizione');
    d.importo = Number(val('fmImporto'));
    return d;
}
function updateFatturaFormChecks() {
    const A = window.Anagrafica;
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const cfEl = document.getElementById('fmCfStatus');
    if (!cfEl) return;
    const cf = A.normalizeCf(val('fmCf'));
    if (!cf) { cfEl.className = 'cf-status bad'; cfEl.textContent = 'Required'; }
    else {
        const v = A.validateCodiceFiscale(cf);
        if (!v.valid) { cfEl.className = 'cf-status bad'; cfEl.textContent = '✗ Not valid: ' + v.reason; }
        else if (A.cfMatchesName(cf, val('fmNome'), val('fmCognome')) === false) {
            cfEl.className = 'cf-status warn';
            cfEl.textContent = A.cfMatchesName(cf, val('fmCognome'), val('fmNome')) ? '⚠ First and last name are swapped' : "⚠ Doesn't match first and last name";
        } else { cfEl.className = 'cf-status ok'; cfEl.textContent = '✓ Valid'; }
    }
    const st = document.getElementById('fmAddrStatus');
    const av = A.validateAddress({ via: val('fmVia'), civico: val('fmCivico'), cap: val('fmCap'), comune: val('fmComune'), provincia: val('fmProvincia') });
    const all = av.problems.concat(av.warnings);
    st.style.color = all.length ? 'var(--warning)' : 'var(--success)';
    st.textContent = all.length ? '⚠ Address: ' + all.join(', ') : '✓ Address complete';
}
function onFatturaDateChange() {
    const d = fatturaDraft;
    if (!d) return;
    const date = document.getElementById('fmData').value;
    const anno = Number(String(date).slice(0, 4));
    // Only once a full, real year is typed (not while typing "2", "20"…).
    if (!anno || anno < 2000 || anno === d.anno) return;
    readFatturaForm();
    d.anno = anno;
    if (d.mode !== 'correct' && d.mode !== 'editManual') d.numero = nextFatturaNumber(anno);
    renderFatturaForm();
}
function onFatturaTipoChange() {
    const d = fatturaDraft;
    readFatturaForm();
    const s = students.find((x) => x.id === d.student_id);
    if (!s) return;
    Object.assign(d, fatturaRecipientFor(s, d.data_fattura, document.getElementById('fmTipo').value));
    renderFatturaForm();
}
function onFatturaStudentChange() {
    const d = fatturaDraft;
    readFatturaForm();
    const id = Number(document.getElementById('fmStudent').value) || null;
    d.student_id = id;
    const s = id && students.find((x) => x.id === id);
    if (s) Object.assign(d, fatturaRecipientFor(s, d.data_fattura));
    renderFatturaForm();
}

// An address fixed in the fattura form also goes into the student's record, so
// the next fattura starts right. Fatture already made keep their own copy of the
// address (their PDF/XML never change); only future ones use the record.
async function writeBackFatturaAddress(s, d) {
    if (!s) return;
    const an = getStudentAnagrafica(s);
    const next = {
        via: d.recipient_via || '', civico: d.recipient_civico || '', cap: d.recipient_cap || '',
        comune: d.recipient_comune || '', provincia: d.recipient_provincia || ''
    };
    if (!Object.values(next).some(Boolean)) return;
    const same = !an.addrSuggested && Object.keys(next).every((k) => String(an.addr[k] || '') === next[k]);
    if (same) return;
    const back = {
        addr_via: next.via, addr_civico: next.civico, addr_cap: next.cap, addr_comune: next.comune, addr_provincia: next.provincia,
        address: [next.via, next.civico, next.cap, next.comune, next.provincia].join('|')
    };
    const { error } = await writeStudentWithSchemaFallback(back, s.id);
    if (!error) Object.assign(s, { addrVia: next.via, addrCivico: next.civico, addrCap: next.cap, addrComune: next.comune, addrProvincia: next.provincia, address: back.address });
}

let fatturaSaveInProgress = false;
async function saveFatturaForm() {
    if (fatturaSaveInProgress) return;
    const d = readFatturaForm();
    const manual = d.mode === 'manual' || d.mode === 'editManual';
    const { problems, warnings } = fatturaDataChecks(d, { manual });
    if (d.mode !== 'correct') {
        if (fattureList.some((f) => f.id !== d.id && f.anno === d.anno && f.numero === d.numero)) problems.push(`Number ${d.numero}/${String(d.anno).slice(-2)} is already used.`);
        const last = lastFatturaDate(d.anno);
        if (!manual && last && d.data_fattura < last) problems.push(`The date can't be before the year's last fattura (${dateIt(last)}): numbers and dates must go in order.`);
    }
    if (problems.length) { alert('Fix first:\n\n- ' + problems.join('\n- ')); return; }
    if (warnings.length && !confirm('Careful:\n\n- ' + warnings.join('\n- ') + '\n\nContinue anyway?')) return;

    const row = {
        anno: d.anno, numero: d.numero, data_fattura: d.data_fattura,
        student_id: d.student_id, transaction_id: d.transaction_id, source: d.source,
        recipient_type: d.recipient_type, recipient_nome: d.recipient_nome, recipient_cognome: d.recipient_cognome, recipient_cf: d.recipient_cf,
        recipient_via: d.recipient_via, recipient_civico: d.recipient_civico, recipient_cap: d.recipient_cap,
        recipient_comune: d.recipient_comune, recipient_provincia: d.recipient_provincia,
        importo: d.importo, descrizione: d.descrizione
    };
    fatturaSaveInProgress = true;
    const btn = document.getElementById('fmSaveBtn');
    if (btn) btn.disabled = true;
    try {
        if (d.mode === 'editManual') {
            const f = fattureList.find((x) => x.id === d.id);
            const update = { ...row, transaction_id: f.transaction_id, source: 'manual' };
            const { error } = await supabaseClient.from('fatture').update(update).eq('id', d.id);
            if (error) throw error;
            Object.assign(f, update);
            // A PDF made from the data (no uploaded one, not an imported
            // file) is out of date now — republish it if the student sees it.
            if (f.pdf_token && !f.manual_pdf_path && !f.legacy_payment_id && f.student_id) {
                try {
                    await unpublishFatturaPdf(f);
                    const token = await publishFatturaPdf(f);
                    await supabaseClient.from('fatture').update({ pdf_token: token }).eq('id', f.id);
                    f.pdf_token = token;
                } catch (e) { console.error('Could not refresh published PDF:', e); }
            }
            refreshFattureViews();
            openFatturaView(f.id);
            return;
        }

        if (d.mode === 'manual') {
            row.status = 'accepted';
            row.status_updated_at = new Date().toISOString();
            if (d.legacy) {
                row.legacy_payment_id = d.legacy.paymentId;
                if (d.legacy.pdfPath) row.manual_pdf_path = d.legacy.pdfPath;
            }
            const file = d.legacy ? null : document.getElementById('fmPdf')?.files?.[0];
            if (file) {
                const path = `fatture/${d.anno}-${d.numero}-${Date.now()}.pdf`;
                const { error: upErr } = await supabaseClient.storage.from(TAX_BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: false });
                if (upErr) throw upErr;
                row.manual_pdf_path = path;
            }
            const { data: inserted, error } = await supabaseClient.from('fatture').insert(row).select().single();
            if (error) throw error;
            fattureList.unshift(inserted);
            // An imported entry already has a published copy (the old Tax
            // Records publicToken) — reuse it instead of publishing twice.
            if (d.legacy && d.legacy.publicToken && inserted.student_id) {
                const token = `${d.legacy.publicToken}.pdf`;
                await supabaseClient.from('fatture').update({ pdf_token: token }).eq('id', inserted.id);
                inserted.pdf_token = token;
            } else if (inserted.student_id) {
                try {
                    const token = await publishFatturaPdf(inserted);
                    if (token) {
                        await supabaseClient.from('fatture').update({ pdf_token: token }).eq('id', inserted.id);
                        inserted.pdf_token = token;
                    }
                } catch (e) { console.error('Could not publish manual fattura PDF:', e); }
            }
            refreshFattureViews();
            openFatturaView(inserted.id);
            return;
        }

        if (d.mode === 'correct') {
            const revision = (d.revision || 0) + 1;
            const draft = { ...row, revision };
            const update = {
                ...row, revision, status: 'created', status_updated_at: new Date().toISOString(),
                xml: buildFatturaXml(fatturaSettings, draft), file_name: fatturaFileName(fatturaSettings, draft)
            };
            const { error } = await supabaseClient.from('fatture').update(update).eq('id', d.id);
            if (error) throw error;
            const f = fattureList.find((x) => x.id === d.id);
            Object.assign(f, update);
            await writeBackFatturaAddress(students.find((x) => x.id === d.student_id), d);
            downloadFatturaXml(f.id);
            refreshFattureViews();
            openFatturaView(f.id);
            return;
        }

        // create
        const draft = { ...row, revision: 0 };
        row.revision = 0;
        row.status = 'created';
        row.status_updated_at = new Date().toISOString();
        row.xml = buildFatturaXml(fatturaSettings, draft);
        row.file_name = fatturaFileName(fatturaSettings, draft);
        const { data: inserted, error } = await supabaseClient.from('fatture').insert(row).select().single();
        if (error) throw error;
        fattureList.unshift(inserted);
        // Fill missing parent details back into the student's record, so the
        // next fattura (and Controllo dati) already has them.
        const s = students.find((x) => x.id === d.student_id);
        if (s && d.recipient_type === 'parent' && (!s.parentNome || !s.parentCognome || !s.parentCodiceFiscale)) {
            const back = {
                parent_nome: s.parentNome || d.recipient_nome,
                parent_cognome: s.parentCognome || d.recipient_cognome,
                parent_codice_fiscale: s.parentCodiceFiscale || d.recipient_cf
            };
            back.parentName = `${back.parent_nome} ${back.parent_cognome}`.trim();
            const { error: backErr } = await writeStudentWithSchemaFallback(back, s.id);
            if (!backErr) { s.parentNome = back.parent_nome; s.parentCognome = back.parent_cognome; s.parentCodiceFiscale = back.parent_codice_fiscale; s.parentName = back.parentName; }
        }
        await writeBackFatturaAddress(s, d);
        downloadFatturaXml(inserted.id);
        refreshFattureViews();
        openFatturaView(inserted.id);
    } catch (e) {
        const msg = String(e?.message || e);
        alert(/duplicate|unique/i.test(msg)
            ? 'This number (or this payment) already has a fattura. Refresh the page and try again.'
            : 'Could not save the fattura: ' + msg);
    } finally {
        fatturaSaveInProgress = false;
        if (btn) btn.disabled = false;
    }
}

function openFatturaView(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f) return;
    fatturaDraft = null;
    const s = f.student_id ? students.find((x) => x.id === f.student_id) : null;
    openFatturaModalShell(`Fattura ${fmtNumeroFattura(f)}`, `${dateIt(f.data_fattura)} · €${moneyIt(f.importo)}${f.source === 'manual' ? ' · added by hand' : ''}`);
    const row = (label, value) => `<div class="details-row" style="display:flex; justify-content:space-between; gap:10px; padding:6px 0; border-bottom:1px solid var(--border-soft); font-size:0.87em;"><span style="color:var(--ink-faint);">${label}</span><span style="font-weight:600; text-align:right;">${escapeHtml(value || '—')}</span></div>`;
    const statusButtons = Object.keys(FATTURA_STATUS).map((k) => `
        <button class="btn btn-sm ${f.status === k ? 'btn-primary' : 'btn-outline'}" title="${escapeHtml(FATTURA_STATUS[k].hint)}" onclick="setFatturaStatus(${f.id}, '${k}')">${FATTURA_STATUS[k].label}</button>`).join('');
    const isLatest = nextFatturaNumber(f.anno) === f.numero + 1;
    document.getElementById('fatturaModalBody').innerHTML = `
        ${row('Issued to', `${f.recipient_cognome}, ${f.recipient_nome}${f.recipient_type === 'parent' ? ' (parent)' : ''}`)}
        ${row('Codice fiscale', f.recipient_cf)}
        ${row('Address', [f.recipient_via, f.recipient_civico].filter(Boolean).join(' ') + (f.recipient_comune ? ` - ${f.recipient_cap || ''} ${f.recipient_comune} (${f.recipient_provincia || ''})` : ''))}
        ${row('Description', f.descrizione)}
        ${row('Student', s ? s.name : '—')}
        ${f.file_name ? row('XML file', f.file_name) : ''}
        <div class="section-label">Status</div>
        ${f.status === 'created' || f.status === 'uploaded' ? `
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 12px; margin-bottom:10px; background:var(--success-soft); border:1px solid #bbf7d0; border-radius:var(--radius-sm);">
            <span style="flex:1; min-width:180px; font-size:0.85em;">Uploaded the XML to AdE? One tap and the fattura is <b>Accepted</b> (the student sees the PDF).</span>
            <button class="btn btn-success" onclick="setFatturaStatus(${f.id}, 'accepted', true)">${iconLabel('check-circle', 'Uploaded to AdE', 15)}</button>
        </div>` : ''}
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${statusButtons}</div>
        <div style="font-size:0.78em; color:var(--ink-soft); margin-top:8px; line-height:1.5;">
            ${escapeHtml(FATTURA_STATUS[f.status]?.hint || '')}<br>
            Check the outcome on AdE: «Fatture e Corrispettivi» → «Monitoraggio» → «Fatture emesse».
            ${f.status === 'accepted' ? (f.pdf_token ? '<br><strong style="color:var(--success);">The student sees the PDF in their portal.</strong>' : (f.student_id ? '' : '<br>No student linked: the PDF is not in a portal.')) : '<br>The student sees the PDF only once it is Accepted.'}
        </div>`;
    document.getElementById('fatturaModalFooter').innerHTML = `
        ${f.status === 'created' || f.source === 'manual' ? `<button class="btn btn-danger" onclick="deleteFattura(${f.id})" title="Delete from the register">${icon('trash', 15)}</button>` : ''}
        <div style="display:flex; gap:8px; margin-left:auto; flex-wrap:wrap;">
            ${f.status === 'rejected' ? `<button class="btn btn-outline" onclick="startFatturaCorrection(${f.id})">Correct</button>` : ''}
            ${f.source === 'manual' ? `<button class="btn btn-outline" onclick="startManualFatturaEdit(${f.id})">${iconLabel('edit', 'Edit', 14)}</button>` : ''}
            ${f.xml ? `<button class="btn btn-outline" onclick="downloadFatturaXml(${f.id})">${iconLabel('download', 'XML', 14)}</button>` : ''}
            <button class="btn btn-primary" onclick="openFatturaPdf(${f.id})">${iconLabel('file-text', 'PDF', 14)}</button>
        </div>`;
}

async function deleteFattura(id) {
    const f = fattureList.find((x) => x.id === id);
    if (!f || (f.status !== 'created' && f.source !== 'manual')) return;
    const isLatest = nextFatturaNumber(f.anno) === f.numero + 1;
    const msg = f.source === 'manual'
        ? `Remove fattura ${fmtNumeroFattura(f)} from the register?\n\nNothing changes on AdE.`
            + (f.legacy_payment_id ? '\nIt goes back to the «to import» list, so you can import it again with the right data.' : '')
        : `Delete fattura ${fmtNumeroFattura(f)}?\n\nOnly if you have NOT uploaded it to AdE.`
            + (isLatest ? '' : `\n\nCareful: it is not the year's last fattura, so number ${f.numero} will stay empty in the numbering.`);
    if (!confirm(msg)) return;
    // Its own published PDF goes too — but not an imported one's, which is
    // still the old entry's file (shown again once re-imported).
    if (f.pdf_token && !f.legacy_payment_id) {
        try { await unpublishFatturaPdf(f); } catch (e) { console.error('Could not remove published PDF:', e); }
    }
    const { error } = await supabaseClient.from('fatture').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert('Could not delete: ' + error.message); return; }
    fattureList = fattureList.filter((x) => x.id !== id);
    closeFatturaModal();
    refreshFattureViews();
}

// ---------- settings ----------
function openFatturaSettings() {
    if (!fatturaFeatureReady()) return;
    const st = fatturaSettings || {};
    const v = (x) => escapeHtml(x == null ? '' : String(x));
    const opt = (list, cur) => Object.keys(list).map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${k} — ${escapeHtml(list[k])}</option>`).join('');
    document.getElementById('fatturaSettingsBody').innerHTML = `
        <p style="font-size:0.84em; color:var(--ink-soft); margin-top:0;">Filled in once, used on every fattura. Copy the data from your last fattura accepted by AdE.</p>
        <div class="section-label" style="margin-top:0;">Studio («cedente»)</div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>First name («Nome»)</label><input id="fsNome" value="${v(st.nome)}"></div>
            <div class="field" style="flex:1;"><label>Last name («Cognome»)</label><input id="fsCognome" value="${v(st.cognome)}"></div>
        </div>
        <div class="field"><label>Company name («Denominazione», only for a company; otherwise empty)</label><input id="fsDenominazione" value="${v(st.denominazione)}"></div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>Partita IVA</label><input id="fsPartitaIva" maxlength="11" value="${v(st.partita_iva)}"></div>
            <div class="field" style="flex:1;"><label>Codice fiscale</label><input id="fsCodiceFiscale" maxlength="16" style="text-transform:uppercase;" value="${v(st.codice_fiscale)}"></div>
        </div>
        <div class="field"><label>Tax regime («Regime fiscale»)</label><select id="fsRegime">${opt(REGIME_LABELS, st.regime_fiscale || 'RF19')}</select></div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:3;"><label>Street («Via»)</label><input id="fsIndirizzo" value="${v(st.indirizzo)}"></div>
            <div class="field" style="flex:1;"><label>House no.</label><input id="fsCivico" value="${v(st.numero_civico)}"></div>
        </div>
        <div class="field"><label>Town («Comune»)</label><input id="fsComune" placeholder="Type and pick from the list…"></div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>Provincia</label><input id="fsProvincia" maxlength="2"></div>
            <div class="field" style="flex:1;"><label>CAP (postcode)</label><input id="fsCap"></div>
        </div>
        <div class="section-label">IVA</div>
        <div class="field"><label>«Natura» (VAT 0%)</label><select id="fsNatura">${opt(NATURA_LABELS, st.natura || 'N2.2')}</select></div>
        <div class="field"><label>«Riferimento normativo» (optional)</label><input id="fsRifNormativo" maxlength="100" value="${v(st.riferimento_normativo)}"></div>
        <div class="section-label">Texts (printed on the fattura, in Italian)</div>
        <div class="field"><label>Description for adults</label><input id="fsDescAdulti" maxlength="200" value="${v(st.descrizione_adulti || 'corso di danza')}"></div>
        <div class="field"><label>Description for under-18s ({allievo} = the student's name)</label><input id="fsDescMinori" maxlength="200" value="${v(st.descrizione_minori || 'corso di danza (per bambini - {allievo})')}"></div>
        <label style="display:flex; align-items:center; gap:8px; font-size:0.86em; font-weight:600; margin-bottom:8px; cursor:pointer;">
            <input type="checkbox" id="fsIncludeCausale" ${st.include_causale ? 'checked' : ''} style="width:16px; height:16px; margin:0;"> Add the «causale»
        </label>
        <div class="field"><label>«Causale»</label><input id="fsCausale" maxlength="200" value="${v(st.causale)}"></div>
        <div class="field"><label>Note at the bottom of the PDF</label><input id="fsPdfFooter" maxlength="200" value="${v(st.pdf_footer)}"></div>
        <div class="section-label">Numbering</div>
        <div style="display:flex; gap:10px;">
            <div class="field" style="flex:1;"><label>Next free number</label><input id="fsStartNumber" type="number" min="1" value="${v(st.start_number || '')}" placeholder="10"></div>
            <div class="field" style="flex:1;"><label>…in the year</label><input id="fsStartYear" type="number" min="2020" value="${v(st.start_year || new Date().getFullYear())}"></div>
        </div>
        <div style="font-size:0.78em; color:var(--ink-faint);">If the last fattura on AdE is 9/26, write 10 and 2026. Fatture added to the register count anyway.</div>
        <div class="section-label">To invoice</div>
        <div class="field"><label>Invoice payments from</label><input id="fsInvoiceFrom" type="date" value="${v(String(st.invoice_from || FATTURE_FROM_DEFAULT).slice(0, 10))}" ${fatturaTodoReady ? '' : 'disabled'}></div>
        <div style="font-size:0.78em; color:var(--ink-faint);">Payments from this date on without a fattura appear in «To invoice».${fatturaTodoReady ? '' : ' (Run fatture_todo.sql to change it.)'}</div>`;
    const A = window.Anagrafica;
    const c = document.getElementById('fsComune'), p = document.getElementById('fsProvincia'), cap = document.getElementById('fsCap');
    A.attachComunePicker(c, p, cap, null);
    A.setComuneValue(c, p, cap, st.comune, st.provincia, st.cap);
    document.getElementById('fatturaSettingsModal').style.display = 'flex';
}
function closeFatturaSettings() { document.getElementById('fatturaSettingsModal').style.display = 'none'; }
async function saveFatturaSettings() {
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const st = {
        id: 1,
        nome: val('fsNome').toUpperCase(), cognome: val('fsCognome').toUpperCase(), denominazione: val('fsDenominazione') || null,
        partita_iva: val('fsPartitaIva'), codice_fiscale: window.Anagrafica.normalizeCf(val('fsCodiceFiscale')),
        regime_fiscale: val('fsRegime'),
        indirizzo: val('fsIndirizzo').toUpperCase(), numero_civico: val('fsCivico'),
        comune: val('fsComune').toUpperCase(), provincia: val('fsProvincia').toUpperCase(), cap: val('fsCap'),
        natura: val('fsNatura'), riferimento_normativo: val('fsRifNormativo') || null,
        descrizione_adulti: val('fsDescAdulti') || 'corso di danza',
        descrizione_minori: val('fsDescMinori') || 'corso di danza (per bambini - {allievo})',
        include_causale: document.getElementById('fsIncludeCausale').checked,
        causale: val('fsCausale') || null,
        pdf_footer: val('fsPdfFooter') || null,
        start_number: Number(val('fsStartNumber')) || 1,
        start_year: Number(val('fsStartYear')) || new Date().getFullYear(),
        updated_at: new Date().toISOString()
    };
    if (fatturaTodoReady) st.invoice_from = val('fsInvoiceFrom') || FATTURE_FROM_DEFAULT;
    const problems = fatturaSettingsProblems(st);
    if (problems.length && !confirm('Missing or not valid:\n- ' + problems.join('\n- ') + "\n\nSave anyway? (You can't create fatture until they are correct.)")) return;
    const { error } = await supabaseClient.from('fattura_settings').upsert(st, { onConflict: 'id' });
    if (error) { alert('Could not save: ' + error.message); return; }
    fatturaSettings = st;
    closeFatturaSettings();
    refreshFattureViews();
}

// ---------- register (Fatture tab) ----------
function refreshFattureViews() {
    renderFattureTab();
    if (typeof currentViewingStudentId !== 'undefined' && currentViewingStudentId) {
        const s = students.find((x) => x.id === currentViewingStudentId);
        if (s) renderStudentViewModal(s);
    }
}
// ---------- «Da fatturare» / «Fatturati» ----------
function fattureFromDate() {
    return String((fatturaSettings && fatturaSettings.invoice_from) || FATTURE_FROM_DEFAULT).slice(0, 10);
}
// Recharges since fattureFromDate() without a fattura, grouped by student.
// skipped=true returns the «Non serve» ones instead.
function rechargesToInvoice(skipped) {
    const from = fattureFromDate();
    const rows = (typeof v2CreditTransactions === 'undefined' ? [] : v2CreditTransactions)
        .filter((t) => t.type === 'recharge' && !t.deleted_at && t.id && String(t.created_at).slice(0, 10) >= from)
        .filter((t) => !fatturaForTransaction(t.id))
        .filter((t) => fatturaSkipIds.has(t.id) === !!skipped)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const groups = new Map();
    rows.forEach((t) => {
        if (!groups.has(t.student_id)) groups.set(t.student_id, { student: students.find((x) => x.id === t.student_id), txs: [] });
        groups.get(t.student_id).txs.push(t);
    });
    return [...groups.values()].sort((a, b) => String(a.student?.name || '').localeCompare(String(b.student?.name || '')));
}
// Students with fatture dated since fattureFromDate(), plus how many recharges still miss one.
function studentsInvoiced() {
    const from = fattureFromDate();
    const missing = new Map(rechargesToInvoice(false).map((g) => [g.student?.id, g.txs.length]));
    const map = new Map();
    fattureList.filter((f) => f.student_id && String(f.data_fattura).slice(0, 10) >= from).forEach((f) => {
        if (!map.has(f.student_id)) map.set(f.student_id, { student: students.find((x) => x.id === f.student_id), count: 0, total: 0 });
        const g = map.get(f.student_id);
        g.count++; g.total += Number(f.importo || 0);
    });
    return [...map.values()].map((g) => ({ ...g, missing: missing.get(g.student?.id) || 0 }))
        .sort((a, b) => String(a.student?.name || '').localeCompare(String(b.student?.name || '')));
}
async function skipFatturaFor(txId, skip) {
    const { error } = skip
        ? await supabaseClient.from('fattura_skips').insert({ transaction_id: txId })
        : await supabaseClient.from('fattura_skips').delete().eq('transaction_id', txId);
    if (error) { alert('Could not save: ' + error.message); return; }
    if (skip) fatturaSkipIds.add(txId); else fatturaSkipIds.delete(txId);
    refreshFattureViews();
}
function setFattureTodoView(v) { fattureTodoView = v; renderFattureTab(); }
function fattureTodoCardHtml() {
    const todo = rechargesToInvoice(false);
    const skipped = fatturaTodoReady ? rechargesToInvoice(true) : [];
    const done = studentsInvoiced();
    const nTodo = todo.reduce((n, g) => n + g.txs.length, 0);
    const nSkipped = skipped.reduce((n, g) => n + g.txs.length, 0);
    const view = fattureTodoView === 'skipped' && !nSkipped ? 'todo' : fattureTodoView;
    const tab = (key, label) => `<button class="btn btn-sm ${view === key ? 'btn-primary' : 'btn-outline'}" onclick="setFattureTodoView('${key}')">${label}</button>`;
    const txRow = (t, skippedRow) => `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding:5px 0 5px 12px; font-size:0.85em;">
            <span>${dateIt(String(t.created_at).slice(0, 10))} · <b>€${moneyIt(t.amount)}</b></span>
            <span style="display:flex; gap:6px;">${skippedRow
                ? `<button class="btn btn-outline btn-sm" onclick="skipFatturaFor(${t.id}, false)">Restore</button>`
                : `<button class="btn btn-primary btn-sm" onclick="openFatturaFromTransaction(${t.id})">Make fattura</button>
                   ${fatturaTodoReady ? `<button class="btn btn-outline btn-sm" title="This payment won't get a fattura from the app" onclick="skipFatturaFor(${t.id}, true)">Not needed</button>` : ''}`}
            </span>
        </div>`;
    const groupHtml = (g, skippedRows) => `
        <div style="padding:8px 0; border-top:1px solid var(--border-soft);">
            <div style="font-weight:700; font-size:0.9em; cursor:pointer;" onclick="${g.student ? `openStudentViewModal(${g.student.id})` : ''}">${escapeHtml(g.student ? g.student.name : 'Deleted student')}
                <span style="font-weight:400; color:var(--ink-faint);">· ${g.txs.length} payment${g.txs.length === 1 ? '' : 's'}</span></div>
            ${g.txs.map((t) => txRow(t, skippedRows)).join('')}
        </div>`;
    let body;
    if (view === 'done') {
        body = done.length ? done.map((g) => `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 0; border-top:1px solid var(--border-soft); font-size:0.87em; cursor:pointer;" onclick="${g.student ? `openStudentViewModal(${g.student.id})` : ''}">
                <span><b>${escapeHtml(g.student ? g.student.name : 'Deleted student')}</b> · ${g.count} fattur${g.count === 1 ? 'a' : 'e'} · €${moneyIt(g.total)}</span>
                ${g.missing ? `<span class="badge badge-warning">${g.missing} missing</span>` : '<span class="badge badge-success">all invoiced ✓</span>'}
            </div>`).join('') : '<div style="font-size:0.85em; color:var(--ink-faint); padding:6px 0;">No fatture yet.</div>';
    } else if (view === 'skipped') {
        body = `<div style="font-size:0.8em; color:var(--ink-faint); margin-bottom:4px;">Payments marked «Not needed». «Restore» puts them back in «To invoice».</div>` + skipped.map((g) => groupHtml(g, true)).join('');
    } else {
        body = todo.length ? todo.map((g) => groupHtml(g, false)).join('')
            : '<div style="font-size:0.88em; color:var(--success); font-weight:600; padding:6px 0;">Every payment has its fattura ✓</div>';
    }
    return `
        <div class="card" style="padding:14px 16px; margin-bottom:14px;">
            <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center; margin-bottom:8px;">
                ${tab('todo', `To invoice (${nTodo})`)}
                ${tab('done', `Invoiced (${done.length} student${done.length === 1 ? '' : 's'})`)}
                ${nSkipped ? tab('skipped', `Hidden (${nSkipped})`) : ''}
                <span style="margin-left:auto; font-size:0.78em; color:var(--ink-faint);">payments from ${dateIt(fattureFromDate())}</span>
            </div>
            ${fatturaTodoReady ? '' : '<div style="font-size:0.8em; color:var(--warning); margin-bottom:6px;">Run fatture_todo.sql in Supabase for the «Not needed» button and to change the date.</div>'}
            <div style="max-height:420px; overflow-y:auto;">${body}</div>
        </div>`;
}

function renderFattureTab() {
    const panel = document.getElementById('fattureTabContent');
    if (!panel) return;
    if (fattureMissing) {
        panel.innerHTML = `<div class="placeholder-card">${icon('warning', 26)}<h3>Fatture not active yet</h3><div style="color:var(--ink-soft); font-size:0.88em;">Run student_details.sql, then fatture_xml.sql in Supabase, then refresh the page.</div></div>`;
        return;
    }
    const yearSel = document.getElementById('fattureYear');
    const currentYear = new Date().getFullYear();
    const years = [...new Set([currentYear, ...fattureList.map((f) => f.anno)])].sort((a, b) => b - a);
    const chosenYear = Number(yearSel?.value) || currentYear;
    const statusFilter = document.getElementById('fattureStatusFilter')?.value || 'all';
    const term = (document.getElementById('fattureSearch')?.value || '').toLowerCase();
    const ofYear = fattureList.filter((f) => f.anno === chosenYear);
    const shown = ofYear
        .filter((f) => statusFilter === 'all' || f.status === statusFilter)
        .filter((f) => {
            if (!term) return true;
            const s = f.student_id ? students.find((x) => x.id === f.student_id) : null;
            return [f.recipient_nome, f.recipient_cognome, f.recipient_cf, s?.name, fmtNumeroFattura(f)].join(' ').toLowerCase().includes(term);
        })
        .sort((a, b) => b.numero - a.numero);
    const total = ofYear.reduce((sum, f) => sum + Number(f.importo || 0), 0);
    const count = (k) => ofYear.filter((f) => f.status === k).length;
    const settingsWarn = fatturaSettingsProblems(fatturaSettings).length
        ? `<div class="card" style="padding:12px 16px; margin-bottom:14px; border-color:#fbdca0; font-size:0.86em;">${icon('warning', 14)} Complete the <a href="#" onclick="openFatturaSettings(); return false;">fattura Settings</a> before creating the first fattura.</div>`
        : '';
    const legacy = legacyFattureToImport(null);
    const legacyHtml = legacy.length ? `
        <div class="card" style="padding:14px 16px; margin-bottom:14px; border-color:#fbdca0;">
            <div style="font-weight:700; font-size:0.92em; margin-bottom:4px;">To import from the old archive (${legacy.length})</div>
            <div style="font-size:0.82em; color:var(--ink-soft); margin-bottom:10px;">Fatture saved in the old Reports section. Open the PDF, check the data, type the amount and save: they go into the register.</div>
            ${legacy.map((x) => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; padding:7px 0; border-top:1px solid var(--border-soft); font-size:0.86em;">
                    <span><strong>${escapeHtml(x.payment.taxFileNo || '—')}</strong> · ${x.payment.date ? dateIt(x.payment.date) : '—'} · ${escapeHtml(x.student ? x.student.name : 'Student #' + x.studentId)}</span>
                    <span style="display:flex; gap:6px;">
                        ${x.payment.pdfPath ? `<button class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(x.payment.pdfPath).replace(/'/g, "\\'")}')">PDF</button>` : ''}
                        <button class="btn btn-primary btn-sm" onclick="openLegacyImport(${x.studentId}, '${escapeHtml(x.payment.id)}')">Import</button>
                        <button class="btn btn-danger btn-sm" title="Delete permanently" onclick="deleteLegacyFattura(${x.studentId}, '${escapeHtml(x.payment.id)}')">${icon('trash', 14)}</button>
                    </span>
                </div>`).join('')}
        </div>` : '';
    panel.innerHTML = `
        ${settingsWarn}
        ${fattureTodoCardHtml()}
        ${legacyHtml}
        <div class="card" style="padding:14px 16px; margin-bottom:14px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end;">
            <div class="field" style="margin:0; min-width:110px;"><label>Year</label>
                <select id="fattureYear" onchange="renderFattureTab()">${years.map((y) => `<option value="${y}" ${y === chosenYear ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div class="field" style="margin:0; min-width:150px;"><label>Status</label>
                <select id="fattureStatusFilter" onchange="renderFattureTab()">
                    <option value="all">All</option>
                    ${Object.keys(FATTURA_STATUS).map((k) => `<option value="${k}" ${k === statusFilter ? 'selected' : ''}>${FATTURA_STATUS[k].label}</option>`).join('')}
                </select></div>
            <div class="field" style="margin:0; flex:1; min-width:180px;"><label>Search</label><input id="fattureSearch" value="${escapeHtml(term)}" placeholder="Name, CF, number…" oninput="renderFattureTab(); const el=document.getElementById('fattureSearch'); el.focus(); el.setSelectionRange(el.value.length, el.value.length);"></div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(120px, 1fr)); gap:10px; margin-bottom:14px;">
            <div class="stat-tile"><div class="label">Fatture ${chosenYear}</div><div class="value">${ofYear.length}</div></div>
            <div class="stat-tile"><div class="label">Total</div><div class="value">€${moneyIt(total)}</div></div>
            <div class="stat-tile"><div class="label">Accepted</div><div class="value" style="color:var(--success);">${count('accepted')}</div></div>
            <div class="stat-tile"><div class="label">Uploaded</div><div class="value" style="color:var(--warning);">${count('uploaded')}</div></div>
            <div class="stat-tile"><div class="label">To upload</div><div class="value">${count('created')}</div></div>
            <div class="stat-tile"><div class="label">Rejected</div><div class="value" style="color:var(--danger);">${count('rejected')}</div></div>
        </div>
        ${shown.length ? shown.map((f) => {
            const s = f.student_id ? students.find((x) => x.id === f.student_id) : null;
            const st = FATTURA_STATUS[f.status] || FATTURA_STATUS.created;
            return `
            <div class="student-row" style="cursor:pointer;" onclick="openFatturaView(${f.id})">
                <div style="min-width:64px; font-weight:800;">${fmtNumeroFattura(f)}</div>
                <div class="student-info" style="flex:1 1 220px;">
                    <div>
                        <div style="font-weight:700;">${escapeHtml(`${f.recipient_cognome}, ${f.recipient_nome}`)}${f.recipient_type === 'parent' ? ' <span style="font-weight:400; color:var(--ink-faint); font-size:0.85em;">(parent)</span>' : ''}</div>
                        <div class="student-meta">${dateIt(f.data_fattura)} · ${escapeHtml(f.recipient_cf)}${s && f.recipient_type === 'parent' ? ' · student: ' + escapeHtml(s.name) : ''}${f.source === 'manual' ? ' · added by hand' : ''}</div>
                    </div>
                </div>
                <div style="font-weight:800;">€${moneyIt(f.importo)}</div>
                <button type="button" class="btn btn-primary btn-sm" title="Open the PDF" onclick="event.stopPropagation(); openFatturaPdf(${f.id})">${iconLabel('file-text', 'PDF', 13)}</button>
                ${f.status === 'created' || f.status === 'uploaded'
                    ? `<button type="button" class="btn btn-success btn-sm" title="XML uploaded to AdE: mark Accepted" onclick="event.stopPropagation(); setFatturaStatus(${f.id}, 'accepted', true)">${iconLabel('check-circle', 'Uploaded to AdE', 13)}</button>`
                    : `<span class="badge ${st.badge}" title="${escapeHtml(st.hint)}">${st.label}</span>`}
            </div>`;
        }).join('') : `<div class="placeholder-card">${icon('file-text', 24)}<h3>No fatture</h3></div>`}`;
}

function exportFattureCsv() {
    const chosenYear = Number(document.getElementById('fattureYear')?.value) || new Date().getFullYear();
    const rows = fattureList.filter((f) => f.anno === chosenYear).sort((a, b) => a.numero - b.numero);
    const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const header = ['Number', 'Date', 'Last name', 'First name', 'Codice fiscale', 'Issued to', 'Student', 'Description', 'Amount', 'Status', 'Source'];
    const lines = rows.map((f) => {
        const s = f.student_id ? students.find((x) => x.id === f.student_id) : null;
        return [fmtNumeroFattura(f), dateIt(f.data_fattura), f.recipient_cognome, f.recipient_nome, f.recipient_cf,
            f.recipient_type === 'parent' ? 'Parent' : 'Student', s ? s.name : '', f.descrizione, moneyIt(f.importo),
            (FATTURA_STATUS[f.status] || {}).label || f.status, f.source === 'manual' ? 'Added by hand' : 'App'].map(q).join(';');
    });
    const total = rows.reduce((sum, f) => sum + Number(f.importo || 0), 0);
    lines.push(['', '', '', '', '', '', '', 'TOTAL', moneyIt(total), '', ''].map(q).join(';'));
    downloadBlob(new Blob(['﻿' + [header.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' }), `fatture_${chosenYear}.csv`);
}

// ---------- student popup: that student's fatture ----------
function renderStudentFatture(s) {
    const label = document.getElementById('svmFattureLabel');
    const list = document.getElementById('svmFatture');
    if (!label || !list) return;
    if (fattureMissing) {
        label.innerHTML = iconLabel('file-text', 'Fatture', 13);
        list.innerHTML = `<div style="color:var(--warning); font-size:0.85em; margin-bottom:6px;">Fatture not active yet: run student_details.sql and fatture_xml.sql in Supabase, then refresh the page.</div>`;
        return;
    }
    const mine = fattureOfStudent(s.id).sort((a, b) => b.anno - a.anno || b.numero - a.numero);
    const legacy = legacyFattureToImport(s.id);
    label.innerHTML = iconLabel('file-text', 'Fatture', 13);
    const legacyRows = legacy.map((x) => `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--border-soft); font-size:0.85em;">
                <span><strong>${escapeHtml(x.payment.taxFileNo || '—')}</strong> · ${x.payment.date ? dateIt(x.payment.date) : '—'} <span style="color:var(--warning);">· to import</span></span>
                <span style="display:flex; gap:6px;">
                    ${x.payment.pdfPath ? `<button type="button" class="btn btn-outline btn-sm" onclick="viewTaxPdf('${escapeHtml(x.payment.pdfPath).replace(/'/g, "\\'")}')">PDF</button>` : ''}
                    <button type="button" class="btn btn-primary btn-sm" onclick="openLegacyImport(${s.id}, '${escapeHtml(x.payment.id)}')">Import</button>
                    <button type="button" class="btn btn-danger btn-sm" title="Delete permanently" onclick="deleteLegacyFattura(${s.id}, '${escapeHtml(x.payment.id)}')">${icon('trash', 14)}</button>
                </span>
            </div>`).join('');
    list.innerHTML = legacyRows + (mine.length
        ? mine.map((f) => {
            const st = FATTURA_STATUS[f.status] || FATTURA_STATUS.created;
            return `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding:7px 0; border-bottom:1px solid var(--border-soft); font-size:0.85em; cursor:pointer;" onclick="openFatturaView(${f.id})">
                <span><strong>${fmtNumeroFattura(f)}</strong> · ${dateIt(f.data_fattura)} · €${moneyIt(f.importo)}</span>
                <span style="display:flex; gap:6px; align-items:center;">
                    <span class="badge ${st.badge}">${st.label}</span>
                    <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation(); openFatturaPdf(${f.id})">PDF</button>
                </span>
            </div>`;
        }).join('')
        : (legacy.length ? '' : `<div style="color:var(--ink-faint); font-size:0.85em; margin-bottom:6px;">No fatture. Use «Fattura» on a payment below.</div>`));
}
// Small button for a recharge row in the student's ledger.
function fatturaLedgerButton(t) {
    // Shown even before fatture_xml.sql is run — pressing it then explains
    // what's missing, instead of the button silently not being there.
    if (t.type !== 'recharge' || !t.id) return '';
    const f = fatturaForTransaction(t.id);
    const label = f ? `${fmtNumeroFattura(f)} · ${(FATTURA_STATUS[f.status] || {}).label || ''}` : 'Fattura';
    return `<button type="button" class="btn ${f ? 'btn-outline' : 'btn-primary'} btn-sm" style="height:24px; padding:0 8px; font-size:0.74em;" onclick="event.stopPropagation(); openFatturaFromTransaction(${t.id})">${escapeHtml(label)}</button>`;
}
