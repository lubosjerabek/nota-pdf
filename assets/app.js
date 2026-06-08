/**
 * @file app.js
 * Application bootstrap — wires all modules together and starts the app.
 *
 * Module load order (enforced by annotate.php's sequential `await load()` calls):
 *   1. state.js    — annotation data store; must be first
 *   2. viewer.js   — PDF rendering; depends on window.pdfjsLib being set
 *   3. tools.js    — annotation tools; calls NotaViewer to map coordinates
 *   4. export.js   — PDF export; reads NotaState and fetches original PDF
 *   5. app.js      — this file; calls init() on all modules
 *
 * The `window.NOTA` object is injected by annotate.php:
 *   { filename: string, pdfUrl: string, workerSrc: string }
 */

window.NotaApp = {
    /**
     * Initialise the entire application.
     * Loads the PDF, renders all pages, then activates annotation tools and
     * the export button. Sets `#status-msg` to "Ready" when complete.
     */
    async init() {
        const { filename, pdfUrl } = window.NOTA;

        // Use the server filename as the document ID. It is already unique because
        // upload.php appends a random 4-byte hex suffix to every uploaded file.
        NotaState.init(filename);

        const statusMsg = document.getElementById('status-msg');
        const pageCount = document.getElementById('page-count');

        try {
            statusMsg.textContent = 'Loading PDF…';
            const numPages = await NotaViewer.load(pdfUrl);
            pageCount.textContent = numPages + ' page' + (numPages !== 1 ? 's' : '');

            statusMsg.textContent = 'Rendering…';
            await NotaViewer.renderAll(numPages);

            NotaTools.init();
            NotaExport.init();
            _initServerSave();

            statusMsg.textContent = 'Ready';
        } catch (err) {
            statusMsg.textContent = 'Error: ' + err.message;
            console.error(err);
        }
    }
};

/**
 * Wire the "Save to server" button.
 * POSTs the full annotation JSON to save.php so annotations are persisted
 * server-side in addition to the automatic localStorage save.
 * This is optional — localStorage alone is sufficient for single-user use.
 */
function _initServerSave() {
    const btn = document.getElementById('save-server-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const statusMsg = document.getElementById('status-msg');
        btn.disabled = true;
        statusMsg.textContent = 'Saving…';
        try {
            const res = await fetch('save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    docId: window.NOTA.filename,
                    annotations: NotaState.all(),
                }),
            });
            const data = await res.json();
            statusMsg.textContent = data.ok
                ? 'Saved to server.'
                : 'Save failed: ' + (data.error || 'unknown');
        } catch (e) {
            statusMsg.textContent = 'Save failed: ' + e.message;
        } finally {
            btn.disabled = false;
        }
    });
}
