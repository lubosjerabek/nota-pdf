/**
 * @file tools.js
 * Annotation tools: highlight, draw (freehand), text note, and select/delete.
 *
 * Tool behaviour
 * --------------
 * highlight — Pointer events are enabled on the PDF.js text layer so the user
 *             can select text normally. On `mouseup` the selection rectangles
 *             are read from `Range.getClientRects()`, converted to PDF space,
 *             and stored as a highlight annotation.
 *
 * draw      — `mousedown/mousemove/mouseup` on the annotation canvas accumulate
 *             canvas-space points into a live preview path. On `mouseup` the
 *             points are converted to PDF space and saved as a draw annotation.
 *
 * text      — A single `click` on the annotation canvas places a `<textarea>`
 *             in the notes layer. On blur or Enter the text is committed and the
 *             textarea is replaced with a styled `<div>`. Double-clicking an
 *             existing note re-opens it for editing.
 *
 * select    — Clicking an annotation highlights it with a dashed bounding box.
 *             Pressing Delete/Backspace removes the selected annotation.
 *             Pressing Escape deselects.
 *
 * Keyboard shortcuts: H (highlight), D (draw), T (text), S (select),
 *                     Ctrl+Z (undo), Ctrl+Y / Ctrl+Shift+Z (redo).
 */
window.NotaTools = (() => {
    /** @type {'highlight'|'draw'|'text'|'select'} */
    let _activeTool = 'highlight';
    let _color = '#f5c518';
    let _strokeWidth = 3;
    let _drawing = false;
    /** @type {[number,number][]} Canvas-space points accumulated during a live draw stroke. */
    let _currentPath = [];
    /** @type {number|null} Page being drawn on (prevents cross-page strokes on fast moves). */
    let _activePageNum = null;
    /** @type {string|null} ID of the currently selected annotation, or null. */
    let _selectedId = null;

    // ── Redraw ──────────────────────────────────────────────────────────────

    /**
     * Clear and repaint the annotation canvas for one page, then sync note divs.
     * Called by NotaViewer after each page render and by tools after each change.
     * @param {number} pageNum  1-based page number.
     */
    function redrawPage(pageNum) {
        const info = NotaViewer.getPageInfo(pageNum);
        if (!info) return;
        const ctx = info.ctx;
        ctx.clearRect(0, 0, info.annotCanvas.width, info.annotCanvas.height);

        const annotations = NotaState.getPage(pageNum);
        for (const ann of annotations) {
            if (ann.type === 'highlight') _drawHighlight(ctx, ann, pageNum);
            else if (ann.type === 'draw') _drawPath(ctx, ann, pageNum);
        }
        _redrawNotes(pageNum, annotations.filter(a => a.type === 'text'));
    }

    /**
     * Repaint every page — used after undo/redo or annotation deletion where
     * the affected page number is not known in advance.
     */
    function redrawAll() {
        // Walk all rendered page containers rather than just NotaState keys so
        // that pages whose annotations were cleared also get their canvas wiped.
        document.querySelectorAll('.page-container').forEach(pc => {
            redrawPage(parseInt(pc.dataset.page));
        });
    }

    // ── Draw helpers ─────────────────────────────────────────────────────────

    function _drawHighlight(ctx, ann, pageNum) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = ann.color;
        for (const [px, py, pw, ph] of ann.rects) {
            const [cx, cy] = NotaViewer.pdfToCanvas(pageNum, px, py);
            // pw/ph are in PDF space; scale by viewport scale
            const scale = NotaViewer.getScale();
            ctx.fillRect(cx, cy - ph * scale, pw * scale, ph * scale);
        }
        ctx.restore();
        if (_selectedId === ann.id) _drawSelectionRing(ctx, ann, pageNum);
    }

    function _drawPath(ctx, ann, pageNum) {
        if (!ann.points || ann.points.length < 2) return;
        ctx.save();
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = ann.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        const [x0, y0] = NotaViewer.pdfToCanvas(pageNum, ann.points[0][0], ann.points[0][1]);
        ctx.moveTo(x0, y0);
        for (let i = 1; i < ann.points.length; i++) {
            const [x, y] = NotaViewer.pdfToCanvas(pageNum, ann.points[i][0], ann.points[i][1]);
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        if (_selectedId === ann.id) _drawSelectionRing(ctx, ann, pageNum);
    }

    function _drawSelectionRing(ctx, ann, pageNum) {
        // Simple dashed bounding box for selected annotation
        const bounds = _getAnnotBounds(ann, pageNum);
        if (!bounds) return;
        ctx.save();
        ctx.strokeStyle = '#2196f3';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8);
        ctx.restore();
    }

    function _getAnnotBounds(ann, pageNum) {
        if (ann.type === 'highlight' && ann.rects?.length) {
            const scale = NotaViewer.getScale();
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const [px, py, pw, ph] of ann.rects) {
                const [cx, cy] = NotaViewer.pdfToCanvas(pageNum, px, py);
                minX = Math.min(minX, cx);
                minY = Math.min(minY, cy - ph * scale);
                maxX = Math.max(maxX, cx + pw * scale);
                maxY = Math.max(maxY, cy);
            }
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        if (ann.type === 'draw' && ann.points?.length) {
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const [px, py] of ann.points) {
                const [cx, cy] = NotaViewer.pdfToCanvas(pageNum, px, py);
                minX = Math.min(minX, cx); minY = Math.min(minY, cy);
                maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
            }
            return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
        }
        return null;
    }

    // ── Text notes rendering ──────────────────────────────────────────────────

    function _redrawNotes(pageNum, textAnns) {
        const info = NotaViewer.getPageInfo(pageNum);
        if (!info) return;
        const layer = info.notesLayer;
        // Remove notes that no longer exist in state
        layer.querySelectorAll('.note').forEach(el => {
            if (!textAnns.find(a => a.id === el.dataset.id)) el.remove();
        });
        for (const ann of textAnns) {
            let el = layer.querySelector(`.note[data-id="${ann.id}"]`);
            if (!el) {
                el = _createNoteEl(ann, pageNum);
                layer.appendChild(el);
            }
            // Position (PDF → canvas)
            const [cx, cy] = NotaViewer.pdfToCanvas(pageNum, ann.x, ann.y);
            el.style.left = cx + 'px';
            el.style.top = cy + 'px';
            el.style.color = ann.color;
            el.querySelector('.note-body').textContent = ann.text;
            el.classList.toggle('selected', _selectedId === ann.id);
        }
    }

    function _createNoteEl(ann, pageNum) {
        const el = document.createElement('div');
        el.className = 'note';
        el.dataset.id = ann.id;
        el.dataset.page = pageNum;

        const body = document.createElement('div');
        body.className = 'note-body';
        body.textContent = ann.text;
        el.appendChild(body);

        el.addEventListener('dblclick', e => {
            e.stopPropagation();
            _editNote(el, ann.id, pageNum);
        });
        el.addEventListener('click', e => {
            if (_activeTool === 'select') {
                e.stopPropagation();
                _setSelected(ann.id);
                redrawPage(pageNum);
            }
        });
        return el;
    }

    function _editNote(el, id, pageNum) {
        const body = el.querySelector('.note-body');
        const current = body.textContent;
        const ta = document.createElement('textarea');
        ta.className = 'note-editor';
        ta.value = current;
        body.replaceWith(ta);
        ta.focus();

        const commit = () => {
            const newText = ta.value.trim();
            const newBody = document.createElement('div');
            newBody.className = 'note-body';
            newBody.textContent = newText;
            ta.replaceWith(newBody);
            if (newText) {
                NotaState.pushUndo();
                const anns = NotaState.getPage(pageNum);
                const ann = anns.find(a => a.id === id);
                if (ann) { ann.text = newText; NotaState.add; }
                // Update via remove + re-add
                NotaState.removeById(id);
                const updated = { ...NotaState.getPage(pageNum), text: newText };
                // Simplest: get annotation from state snapshot before remove
                // Re-add with updated text
                const all = NotaState.all();
                // Already removed above — re-add from saved copy
                NotaState.add({ type: 'text', id, page: pageNum, x: parseFloat(el.style.left), y: parseFloat(el.style.top), text: newText, color: el.style.color || _color, fontSize: 12 });
                redrawPage(pageNum);
            } else {
                NotaState.pushUndo();
                NotaState.removeById(id);
                el.remove();
            }
        };

        ta.addEventListener('blur', commit);
        ta.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { ta.value = current; commit(); }
        });
    }

    // ── Tool activation ───────────────────────────────────────────────────────

    /**
     * Switch to a different tool and update cursor / pointer-event state.
     * The highlight tool needs pointer events on the text layer; all others
     * need them on the annotation canvas instead.
     * @param {'highlight'|'draw'|'text'|'select'} tool
     */
    function setTool(tool) {
        _activeTool = tool;
        _selectedId = null;
        document.querySelectorAll('.tool-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tool === tool);
        });
        // Cursor
        document.querySelectorAll('.annotation-canvas').forEach(c => {
            c.style.cursor = tool === 'draw' ? 'crosshair'
                           : tool === 'text' ? 'text'
                           : tool === 'select' ? 'default'
                           : 'text';
        });
        document.querySelectorAll('.textLayer').forEach(t => {
            t.style.pointerEvents = tool === 'highlight' ? 'auto' : 'none';
        });
    }

    function setColor(color) { _color = color; }
    function setStrokeWidth(w) { _strokeWidth = w; }

    function _setSelected(id) {
        _selectedId = (_selectedId === id) ? null : id;
    }

    // ── Event wiring ──────────────────────────────────────────────────────────

    function _wireCanvas(annotCanvas, pageNum) {
        annotCanvas.addEventListener('mousedown', e => _onMouseDown(e, pageNum));
        annotCanvas.addEventListener('mousemove', e => _onMouseMove(e, pageNum));
        annotCanvas.addEventListener('mouseup',   e => _onMouseUp(e, pageNum));
        annotCanvas.addEventListener('mouseleave',e => _onMouseUp(e, pageNum));
        annotCanvas.addEventListener('click',     e => _onClick(e, pageNum));

        // Touch support
        annotCanvas.addEventListener('touchstart', e => {
            e.preventDefault();
            _onMouseDown(_touchToMouse(e), pageNum);
        }, { passive: false });
        annotCanvas.addEventListener('touchmove', e => {
            e.preventDefault();
            _onMouseMove(_touchToMouse(e), pageNum);
        }, { passive: false });
        annotCanvas.addEventListener('touchend', e => {
            e.preventDefault();
            _onMouseUp(_touchToMouse(e), pageNum);
        }, { passive: false });
    }

    function _touchToMouse(e) {
        const t = e.changedTouches[0];
        return { clientX: t.clientX, clientY: t.clientY, target: e.target };
    }

    function _canvasXY(e) {
        const rect = e.target.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }

    function _onMouseDown(e, pageNum) {
        if (_activeTool !== 'draw') return;
        _drawing = true;
        _activePageNum = pageNum;
        _currentPath = [_canvasXY(e)];
    }

    function _onMouseMove(e, pageNum) {
        if (!_drawing || _activeTool !== 'draw' || pageNum !== _activePageNum) return;
        _currentPath.push(_canvasXY(e));

        // Live preview
        const info = NotaViewer.getPageInfo(pageNum);
        const ctx = info.ctx;
        redrawPage(pageNum);
        ctx.save();
        ctx.strokeStyle = _color;
        ctx.lineWidth = _strokeWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(_currentPath[0][0], _currentPath[0][1]);
        for (let i = 1; i < _currentPath.length; i++) {
            ctx.lineTo(_currentPath[i][0], _currentPath[i][1]);
        }
        ctx.stroke();
        ctx.restore();
    }

    function _onMouseUp(e, pageNum) {
        if (!_drawing || _activeTool !== 'draw') return;
        _drawing = false;
        if (_currentPath.length < 2) { _currentPath = []; return; }

        NotaState.pushUndo();
        const pdfPoints = _currentPath.map(([cx, cy]) => NotaViewer.canvasToPdf(pageNum, cx, cy));
        NotaState.add({
            type: 'draw', id: NotaState.uid(), page: pageNum,
            points: pdfPoints, color: _color, width: _strokeWidth,
        });
        _currentPath = [];
        redrawPage(pageNum);
    }

    function _onClick(e, pageNum) {
        if (_activeTool === 'text') {
            _placeTextNote(e, pageNum);
        } else if (_activeTool === 'select') {
            // Deselect if clicking empty space
            _setSelected(null);
            redrawPage(pageNum);
        }
    }

    function _placeTextNote(e, pageNum) {
        const [cx, cy] = _canvasXY(e);
        const info = NotaViewer.getPageInfo(pageNum);
        const layer = info.notesLayer;

        const ta = document.createElement('textarea');
        ta.className = 'note-editor';
        ta.style.left = cx + 'px';
        ta.style.top = cy + 'px';
        ta.style.color = _color;
        layer.appendChild(ta);
        ta.focus();

        const commit = () => {
            const text = ta.value.trim();
            ta.remove();
            if (!text) return;
            const [px, py] = NotaViewer.canvasToPdf(pageNum, cx, cy);
            NotaState.pushUndo();
            NotaState.add({
                type: 'text', id: NotaState.uid(), page: pageNum,
                x: px, y: py, text, color: _color, fontSize: 12,
            });
            redrawPage(pageNum);
        };

        ta.addEventListener('blur', commit);
        ta.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commit(); }
            if (ev.key === 'Escape') { ta.remove(); }
        });
    }

    // ── Highlight (driven by text-layer selection) ────────────────────────────

    function _wireTextLayer(textLayer, pageNum) {
        // Only fires when highlight tool is active
        textLayer.addEventListener('mouseup', () => {
            if (_activeTool !== 'highlight') return;
            const sel = window.getSelection();
            if (!sel || sel.isCollapsed) return;

            const range = sel.getRangeAt(0);
            const clientRects = Array.from(range.getClientRects());
            if (!clientRects.length) return;

            const info = NotaViewer.getPageInfo(pageNum);
            const canvasRect = info.annotCanvas.getBoundingClientRect();
            const scale = NotaViewer.getScale();

            const pdfRects = clientRects.map(r => {
                // Convert screen rect → canvas-relative → PDF space
                const cx = r.left - canvasRect.left;
                const cy = r.top - canvasRect.top;
                // width/height stay in canvas space; convert to PDF units
                const [px, py] = NotaViewer.canvasToPdf(pageNum, cx, cy + r.height);
                const pw = r.width / scale;
                const ph = r.height / scale;
                return [px, py, pw, ph];
            });

            NotaState.pushUndo();
            NotaState.add({
                type: 'highlight', id: NotaState.uid(), page: pageNum,
                rects: pdfRects, color: _color,
            });
            sel.removeAllRanges();
            redrawPage(pageNum);
        });
    }

    // ── Keyboard shortcuts ────────────────────────────────────────────────────

    function _initKeyboard() {
        document.addEventListener('keydown', e => {
            if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
            if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                e.preventDefault(); _undoRedo('undo');
            }
            if (((e.key === 'y' || e.key === 'Y') && (e.ctrlKey || e.metaKey)) ||
                ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
                e.preventDefault(); _undoRedo('redo');
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (_selectedId) {
                    NotaState.pushUndo();
                    NotaState.removeById(_selectedId);
                    _selectedId = null;
                    redrawAll();
                }
            }
            if (e.key === 'h' || e.key === 'H') setTool('highlight');
            if (e.key === 'd' || e.key === 'D') setTool('draw');
            if (e.key === 't' || e.key === 'T') setTool('text');
            if (e.key === 's' || e.key === 'S') setTool('select');
        });
    }

    function _undoRedo(action) {
        const changed = action === 'undo' ? NotaState.undo() : NotaState.redo();
        if (changed) redrawAll();
    }

    // ── Public init ───────────────────────────────────────────────────────────

    /**
     * Wire all event listeners after the PDF has been rendered.
     * Must be called once by NotaApp.init() after NotaViewer.renderAll().
     */
    function init() {
        document.querySelectorAll('.annotation-canvas').forEach(c => {
            _wireCanvas(c, parseInt(c.dataset.page));
        });
        document.querySelectorAll('.textLayer').forEach(t => {
            _wireTextLayer(t, parseInt(t.closest('.page-container').dataset.page));
        });

        // Toolbar buttons
        document.querySelectorAll('.tool-btn').forEach(btn => {
            btn.addEventListener('click', () => setTool(btn.dataset.tool));
        });

        const colorPicker = document.getElementById('color-picker');
        const colorSwatch = document.getElementById('color-swatch');
        colorSwatch.style.background = colorPicker.value;
        colorPicker.addEventListener('input', () => {
            _color = colorPicker.value;
            colorSwatch.style.background = _color;
        });

        document.getElementById('stroke-width').addEventListener('input', e => {
            _strokeWidth = parseInt(e.target.value);
        });

        document.getElementById('undo-btn').addEventListener('click', () => _undoRedo('undo'));
        document.getElementById('redo-btn').addEventListener('click', () => _undoRedo('redo'));
        document.getElementById('clear-btn').addEventListener('click', () => {
            const active = document.querySelector('.page-container:hover');
            const pageNum = active ? parseInt(active.dataset.page) : 1;
            NotaState.pushUndo();
            NotaState.clearPage(pageNum);
            redrawPage(pageNum);
        });

        _initKeyboard();
        setTool('highlight');
    }

    return { init, redrawPage, redrawAll, setTool, setColor, setStrokeWidth };
})();
