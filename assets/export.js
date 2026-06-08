/**
 * @file export.js
 * PDF export via pdf-lib.
 *
 * How it works
 * ------------
 * 1. Fetch the original PDF from `uploads/` as an ArrayBuffer.
 * 2. Load it with `PDFDocument.load()` (pdf-lib 1.17, loaded globally as PDFLib).
 * 3. Iterate every annotation stored in NotaState and draw it onto the
 *    corresponding pdf-lib page using the appropriate draw primitive.
 * 4. Serialise to bytes, wrap in a Blob, and trigger a browser download.
 *
 * Coordinate mapping
 * ------------------
 * Annotations are stored in PDF user-space (origin = bottom-left, y increases
 * upward). pdf-lib uses the same coordinate system, so annotation coordinates
 * are passed directly without transformation.
 *
 * Highlight rects: [x, y, w, h] where (x, y) is the bottom-left corner.
 * Draw points:     [x, y] pairs fed into an SVG path string.
 * Text notes:      (x, y) anchor for the first baseline of the text string.
 */
window.NotaExport = (() => {

    /**
     * Export the current document with annotations and download it.
     * Disables the export button while running to prevent double-clicks.
     * @param {string} pdfUrl    URL of the original PDF (e.g. "uploads/foo.pdf").
     * @param {string} filename  Original filename; used to derive the download name.
     */
    async function exportPdf(pdfUrl, filename) {
        const btn = document.getElementById('export-btn');
        btn.disabled = true;
        _setStatus('Exporting…');

        try {
            const bytes = await fetch(pdfUrl).then(r => r.arrayBuffer());
            const { PDFDocument, rgb, StandardFonts } = PDFLib;
            const pdfDoc = await PDFDocument.load(bytes);
            const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const pages = pdfDoc.getPages();
            const allAnnotations = NotaState.all();

            for (const [pageKey, anns] of Object.entries(allAnnotations)) {
                const pageIdx = parseInt(pageKey) - 1;
                if (pageIdx < 0 || pageIdx >= pages.length) continue;
                const page = pages[pageIdx];
                const { height: pageH } = page.getSize();

                for (const ann of anns) {
                    if (ann.type === 'highlight') _drawHighlight(page, ann, pageH);
                    else if (ann.type === 'draw')  _drawPath(page, ann, pageH);
                    else if (ann.type === 'text')  _drawText(page, ann, pageH, font);
                }
            }

            const outBytes = await pdfDoc.save();
            const blob = new Blob([outBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename.replace(/\.pdf$/i, '') + '-annotated.pdf';
            a.click();
            // Release the object URL after the download has been triggered
            setTimeout(() => URL.revokeObjectURL(url), 5000);
            _setStatus('Exported.');
        } catch (err) {
            console.error('Export failed:', err);
            _setStatus('Export failed: ' + err.message);
        } finally {
            btn.disabled = false;
        }
    }

    // ── Drawing helpers ───────────────────────────────────────────────────────

    /**
     * Parse a CSS hex color string into a pdf-lib rgb() triplet (0–1 range).
     * @param {string} hex  e.g. "#f5c518"
     * @returns {{ r:number, g:number, b:number }}
     */
    function _hexToRgb(hex) {
        const n = parseInt(hex.replace('#', ''), 16);
        return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
    }

    /**
     * Draw a highlight annotation as semi-transparent filled rectangles.
     * One rectangle per selection rect (a text selection may span multiple lines).
     * @param {import('pdf-lib').PDFPage} page
     * @param {import('./state').HighlightAnnotation} ann
     */
    function _drawHighlight(page, ann) {
        const { r, g, b } = _hexToRgb(ann.color);
        const { rgb } = PDFLib;
        for (const [px, py, pw, ph] of ann.rects) {
            page.drawRectangle({
                x: px, y: py,
                width: pw, height: ph,
                color: rgb(r, g, b),
                opacity: 0.35,
            });
        }
    }

    /**
     * Draw a freehand stroke as individual line segments.
     * Annotations are stored in PDF user-space (bottom-left origin, y up),
     * which matches pdf-lib's drawLine coordinate system directly.
     * (drawSvgPath must NOT be used here — it expects SVG/top-left-origin
     * coordinates and internally flips y, which would mirror the stroke.)
     * @param {import('pdf-lib').PDFPage} page
     * @param {import('./state').DrawAnnotation} ann
     */
    function _drawPath(page, ann) {
        if (!ann.points || ann.points.length < 2) return;
        const { rgb, LineCapStyle } = PDFLib;
        const { r, g, b } = _hexToRgb(ann.color);
        const color = rgb(r, g, b);
        for (let i = 1; i < ann.points.length; i++) {
            page.drawLine({
                start: { x: ann.points[i-1][0], y: ann.points[i-1][1] },
                end:   { x: ann.points[i][0],   y: ann.points[i][1] },
                thickness: ann.width,
                color,
                lineCap: LineCapStyle.Round,
            });
        }
    }

    /**
     * Draw a text note with its sticky-note background, matching the on-screen
     * appearance of .note-body (rgba(255,251,200) background, #d4c84b border).
     *
     * ann.y is the PDF-space y of the click point, which corresponds to the TOP
     * of the note div in the browser. pdf-lib's drawText places the font baseline
     * at y, so we shift down by (padV + ascent) to keep the text inside the box.
     * @param {import('pdf-lib').PDFPage} page
     * @param {import('./state').TextAnnotation} ann
     * @param {number} _pageH
     * @param {import('pdf-lib').PDFFont} font
     */
    function _drawText(page, ann, _pageH, font) {
        const { rgb } = PDFLib;
        const { r, g, b } = _hexToRgb(ann.color);
        const size = ann.fontSize || 12;
        const padH = 4, padV = 3;
        try {
            const text = ann.text;
            const textW = font.widthOfTextAtSize(text, size);
            const boxH  = size + padV * 2;
            // Background — same colour as .note-body
            page.drawRectangle({
                x: ann.x - padH,
                y: ann.y - boxH,
                width:  textW + padH * 2,
                height: boxH,
                color:       rgb(1, 0.984, 0.784),   // rgba(255,251,200)
                opacity:     0.92,
                borderColor: rgb(0.831, 0.784, 0.294), // #d4c84b
                borderWidth: 0.75,
            });
            // Text — baseline shifted inside the box (0.75 ≈ Helvetica ascent ratio)
            page.drawText(text, {
                x: ann.x,
                y: ann.y - padV - size * 0.75,
                size, font, color: rgb(r, g, b),
            });
        } catch (_) { /* skip if text contains unsupported characters */ }
    }

    /** Update the status bar text. */
    function _setStatus(msg) {
        const el = document.getElementById('status-msg');
        if (el) el.textContent = msg;
    }

    /** Wire the export button click handler. Called by NotaApp.init(). */
    function init() {
        document.getElementById('export-btn').addEventListener('click', () => {
            exportPdf(window.NOTA.pdfUrl, window.NOTA.filename);
        });
    }

    return { init, exportPdf };
})();
