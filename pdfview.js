// ============================================================================
// Opening PDFs (and certificate images) the same way everywhere.
//
//  * Computer: opens in a new tab, as always (the browser's own viewer has
//    download/print/close).
//  * Phone (and the installed home-screen app, where a PDF used to replace the
//    app screen with no way back): a small menu —
//      Apri      new tab / the phone's viewer, with its own close (X) and share
//      Condividi the phone's share sheet (WhatsApp, Mail, Salva su File, Stampa…)
//      Scarica   saves the file
//      Chiudi
//
// Use: openFileSmart({ name: 'Fattura_3-26.pdf', getUrl: async () => url })
//   or openFileSmart({ name, getBlob: async () => blob }) for PDFs made in the page.
// Labels follow the page language when i18n.js is loaded (member.html).
// ============================================================================
(function () {
    const L = (key, fallback) => (typeof t === 'function' && t(key) !== key ? t(key) : fallback);
    const isPhone = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
        || (window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900);
    const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    function injectStyles() {
        if (document.getElementById('fileSheetStyles')) return;
        const st = document.createElement('style');
        st.id = 'fileSheetStyles';
        st.textContent = `
            #fileSheet{position:fixed; inset:0; z-index:1000; background:rgba(15,23,42,0.5); display:flex; align-items:flex-end; justify-content:center;}
            #fileSheet .fs-box{background:#fff; width:100%; max-width:480px; border-radius:16px 16px 0 0; padding:16px 16px calc(16px + env(safe-area-inset-bottom)); box-shadow:0 -8px 30px rgba(15,23,42,0.2); font-family:inherit;}
            #fileSheet .fs-name{font-weight:700; font-size:0.95em; margin-bottom:4px; word-break:break-all; color:#0f172a;}
            #fileSheet .fs-note{font-size:0.8em; color:#64748b; min-height:1.2em; margin-bottom:10px;}
            #fileSheet .fs-btn{display:block; width:100%; padding:13px; margin-top:8px; border-radius:10px; border:1px solid #e2e8f0; background:#fff; font-size:0.98em; font-weight:600; color:#0f172a; cursor:pointer; font-family:inherit;}
            #fileSheet .fs-btn.primary{background:#2563eb; border-color:#2563eb; color:#fff;}
            #fileSheet .fs-btn:disabled{opacity:0.45;}
            #fileSheet .fs-close{color:#64748b;}`;
        document.head.appendChild(st);
    }

    function closeSheet() {
        const el = document.getElementById('fileSheet');
        if (el) el.remove();
    }

    window.openFileSmart = async function ({ name, getUrl, getBlob }) {
        name = name || 'documento.pdf';
        // ----- computer: new tab, like before -----
        if (!isPhone()) {
            const win = window.open('', '_blank');
            try {
                const url = getUrl ? await getUrl() : URL.createObjectURL(await getBlob());
                if (win) win.location.href = url; else window.open(url, '_blank');
            } catch (e) {
                if (win) win.close();
                alert(L('file_open_error', "Couldn't open the file") + ': ' + (e?.message || e));
            }
            return;
        }

        // ----- phone: menu -----
        injectStyles();
        closeSheet();
        const sheet = document.createElement('div');
        sheet.id = 'fileSheet';
        sheet.innerHTML = `<div class="fs-box" role="dialog">
            <div class="fs-name"></div>
            <div class="fs-note">${L('file_loading', 'Loading…')}</div>
            <button class="fs-btn primary" data-act="open" disabled>${L('file_open', 'Open')}</button>
            <button class="fs-btn" data-act="share" disabled>${L('file_share', 'Share')}</button>
            <button class="fs-btn" data-act="download" disabled>${L('file_download', 'Download')}</button>
            <button class="fs-btn fs-close" data-act="close">${L('file_close', 'Close')}</button>
        </div>`;
        sheet.querySelector('.fs-name').textContent = name;
        sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
        document.body.appendChild(sheet);
        const note = sheet.querySelector('.fs-note');
        const btn = (act) => sheet.querySelector(`[data-act="${act}"]`);
        btn('close').onclick = closeSheet;

        // Load the file first, so Condividi can open the share sheet right on
        // the tap (phones only allow it directly after a tap).
        let url = null, blob = null;
        try {
            url = getUrl ? await getUrl() : null;
            blob = getBlob ? await getBlob() : await (await fetch(url)).blob();
        } catch (e) {
            if (!url) { note.textContent = L('file_open_error', "Couldn't open the file") + ': ' + (e?.message || e); return; }
            // have a link but couldn't read the file: Apri still works
        }
        if (!document.body.contains(sheet)) return; // closed meanwhile
        const type = (blob && blob.type) || (/\.pdf$/i.test(name) ? 'application/pdf' : '');
        const file = blob ? new File([blob], name, { type }) : null;
        const blobUrl = blob ? URL.createObjectURL(blob) : null;
        note.textContent = '';

        // Apri: a real link opens in the phone's viewer (own X and share). A PDF
        // made in the page (no link) can't do that inside the installed app,
        // so there it is hidden: use Condividi or Scarica.
        if (url || !isInstalledApp()) {
            btn('open').disabled = false;
            btn('open').onclick = () => { window.open(url || blobUrl, '_blank'); closeSheet(); };
        } else {
            btn('open').style.display = 'none';
            btn('share').classList.add('primary');
        }
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            btn('share').disabled = false;
            btn('share').onclick = async () => {
                try { await navigator.share({ files: [file], title: name }); closeSheet(); }
                catch (e) { if (e?.name !== 'AbortError') note.textContent = L('file_share_error', "Couldn't share"); }
            };
        } else {
            btn('share').style.display = 'none';
        }
        if (blobUrl) {
            btn('download').disabled = false;
            btn('download').onclick = () => {
                const a = document.createElement('a');
                a.href = blobUrl; a.download = name;
                document.body.appendChild(a); a.click(); a.remove();
                closeSheet();
            };
        } else {
            btn('download').style.display = 'none';
        }
    };

    // Name for a stored file: keeps its extension (certificates can be photos).
    window.fileNameFromPath = function (path, fallbackBase) {
        const ext = (String(path).match(/\.([a-z0-9]+)$/i) || [])[1] || 'pdf';
        return `${fallbackBase || 'documento'}.${ext.toLowerCase()}`;
    };
})();
