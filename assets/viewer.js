/**
 * @file viewer.js
 * PDF rendering via PDF.js 4.x.
 *
 * Each page is represented by a `.page-container` div that stacks four layers:
 *
 *   1. `.pdf-canvas`         — PDF.js renders the page content here.
 *   2. `.textLayer`          — PDF.js transparent text layer; enables text selection
 *                              for the Highlight tool. Pointer events are toggled by
 *                              NotaTools depending on the active tool.
 *   3. `.annotation-canvas` — Our canvas overlay for drawing strokes and highlights.
 *   4. `.notes-layer`        — Absolutely positioned `<div>` elements for text notes.
 *
 * Coordinate systems
 * ------------------
 * PDF.js renders at a configurable `_scale` (default 1.5×). All canvas pixel
 * coordinates are translated to **PDF user-space** (bottom-left origin, points)
 * via `viewport.convertToPdfPoint()` before being stored in NotaState. The
 * reverse transform (`viewport.convertToViewportPoint`) is used when redrawing.
 *
 * This means annotation coordinates are always scale-independent.
 */
window.NotaViewer = (() => {
    /** @type {import('pdfjs-dist').PDFDocumentProxy|null} */
    let _pdfDoc = null;

    /**
     * Per-page rendering info.
     * @type {Object.<number, {
     *   pdfCanvas: HTMLCanvasElement,
     *   annotCanvas: HTMLCanvasElement,
     *   ctx: CanvasRenderingContext2D,
     *   textLayer: HTMLDivElement,
     *   notesLayer: HTMLDivElement,
     *   viewport: import('pdfjs-dist').PageViewport
     * }>}
     */
    let _pages = {};

    /** Render scale applied to all PDF.js viewports. */
    let _scale = 1.5;

    const container = () => document.getElementById('pages-container');

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Load a PDF from a URL and return the total page count.
     * @param {string} url  URL of the PDF file (served by the same origin).
     * @returns {Promise<number>}
     */
    async function load(url) {
        const loadingTask = window.pdfjsLib.getDocument(url);
        _pdfDoc = await loadingTask.promise;
        return _pdfDoc.numPages;
    }

    /**
     * Build DOM shells for all pages then render them sequentially.
     * Shells are inserted as a single DocumentFragment to minimise reflows.
     * @param {number} numPages
     */
    async function renderAll(numPages) {
        const frag = document.createDocumentFragment();
        for (let i = 1; i <= numPages; i++) {
            frag.appendChild(_buildPageShell(i));
        }
        container().appendChild(frag);

        for (let i = 1; i <= numPages; i++) {
            await _renderPage(i);
        }
    }

    /**
     * Return the rendering info object for a page, or null if not yet rendered.
     * @param {number} pageNum  1-based page number.
     */
    function getPageInfo(pageNum) { return _pages[pageNum] || null; }

    /** @returns {number} Current render scale. */
    function getScale() { return _scale; }

    /**
     * Convert a canvas pixel coordinate to PDF user-space for a given page.
     * @param {number} pageNum
     * @param {number} cx  Canvas x (pixels from left edge).
     * @param {number} cy  Canvas y (pixels from top edge).
     * @returns {[number, number]}  [pdfX, pdfY] in PDF user-space (bottom-left origin).
     */
    function canvasToPdf(pageNum, cx, cy) {
        const info = _pages[pageNum];
        if (!info) return [cx, cy];
        return info.viewport.convertToPdfPoint(cx, cy);
    }

    /**
     * Convert a PDF user-space point to canvas pixels for a given page.
     * @param {number} pageNum
     * @param {number} px  PDF x coordinate.
     * @param {number} py  PDF y coordinate.
     * @returns {[number, number]}  [canvasX, canvasY].
     */
    function pdfToCanvas(pageNum, px, py) {
        const info = _pages[pageNum];
        if (!info) return [px, py];
        return info.viewport.convertToViewportPoint(px, py);
    }

    /**
     * Re-render all pages at the current scale and redraw saved annotations.
     * Call this after a zoom change.
     */
    async function rerender() {
        if (!_pdfDoc) return;
        for (let i = 1; i <= _pdfDoc.numPages; i++) {
            await _renderPage(i);
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Create the four-layer DOM structure for one page without rendering content.
     * Registers the page in `_pages` so other modules can reference it immediately.
     * @param {number} pageNum
     * @returns {HTMLDivElement}
     */
    function _buildPageShell(pageNum) {
        const wrap = document.createElement('div');
        wrap.className = 'page-container';
        wrap.dataset.page = pageNum;

        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'pdf-canvas';

        const textLayer = document.createElement('div');
        textLayer.className = 'textLayer';

        const annotCanvas = document.createElement('canvas');
        annotCanvas.className = 'annotation-canvas';
        annotCanvas.dataset.page = pageNum;

        const notesLayer = document.createElement('div');
        notesLayer.className = 'notes-layer';
        notesLayer.dataset.page = pageNum;

        wrap.appendChild(pdfCanvas);
        wrap.appendChild(textLayer);
        wrap.appendChild(annotCanvas);
        wrap.appendChild(notesLayer);

        _pages[pageNum] = { pdfCanvas, annotCanvas, ctx: null, textLayer, notesLayer, viewport: null };
        return wrap;
    }

    /**
     * Render a single PDF page: PDF content, text layer, then saved annotations.
     * @param {number} pageNum
     */
    async function _renderPage(pageNum) {
        const page = await _pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: _scale });
        const info = _pages[pageNum];
        info.viewport = viewport;

        // Size both canvases to match the rendered viewport
        for (const c of [info.pdfCanvas, info.annotCanvas]) {
            c.width = viewport.width;
            c.height = viewport.height;
        }
        info.ctx = info.annotCanvas.getContext('2d');

        const wrap = info.pdfCanvas.parentElement;
        wrap.style.width = viewport.width + 'px';
        wrap.style.height = viewport.height + 'px';

        await page.render({ canvasContext: info.pdfCanvas.getContext('2d'), viewport }).promise;

        // PDF.js 4.x text layer API — uses TextLayer class, not the legacy renderTextLayer()
        info.textLayer.innerHTML = '';
        info.textLayer.style.width = viewport.width + 'px';
        info.textLayer.style.height = viewport.height + 'px';
        const textLayer = new window.pdfjsLib.TextLayer({
            textContentSource: page.streamTextContent(),
            container: info.textLayer,
            viewport,
        });
        await textLayer.render();

        // Restore any annotations saved in NotaState for this page
        NotaTools.redrawPage(pageNum);
    }

    return { load, renderAll, getPageInfo, getScale, canvasToPdf, pdfToCanvas, rerender };
})();
