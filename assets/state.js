/**
 * @file state.js
 * Annotation state management and localStorage persistence.
 *
 * All annotation coordinates are stored in **PDF user-space** (origin at the
 * bottom-left corner of the page, y increasing upward). This makes them
 * scale-independent: they survive zoom changes and can be passed directly
 * to pdf-lib during export without any transformation.
 *
 * Annotation shapes
 * -----------------
 * @typedef {{ type:'highlight', id:string, page:number, rects:[number,number,number,number][], color:string }} HighlightAnnotation
 * @typedef {{ type:'draw',      id:string, page:number, points:[number,number][],                color:string, width:number }} DrawAnnotation
 * @typedef {{ type:'text',      id:string, page:number, x:number, y:number, text:string,         color:string, fontSize:number }} TextAnnotation
 * @typedef {HighlightAnnotation|DrawAnnotation|TextAnnotation} Annotation
 *
 * Storage key: `nota:<docId>` in localStorage, where docId is the server-side
 * filename (already unique due to the random 4-byte hex suffix added by upload.php).
 */
window.NotaState = (() => {
    let _docId = null;
    /** @type {Object.<number, Annotation[]>} */
    let _annotations = {};
    /** @type {Object.<number, Annotation[]>[]} snapshot stack for undo */
    let _undoStack = [];
    /** @type {Object.<number, Annotation[]>[]} snapshot stack for redo */
    let _redoStack = [];
    const MAX_UNDO = 30;

    /** @returns {string} localStorage key for the current document */
    function _key() { return 'nota:' + _docId; }

    /** @returns {Object.<number, Annotation[]>} deep clone of current annotations */
    function _snapshot() { return JSON.parse(JSON.stringify(_annotations)); }

    /** Persist current state to localStorage, ignoring quota errors. */
    function _save() {
        try {
            localStorage.setItem(_key(), JSON.stringify(_annotations));
        } catch (e) { /* storage full — silently skip */ }
    }

    /**
     * Initialise state for a document, loading any previously saved annotations.
     * Must be called before any other method.
     * @param {string} docId  Server filename used as a unique document identifier.
     */
    function init(docId) {
        _docId = docId;
        const raw = localStorage.getItem(_key());
        _annotations = raw ? JSON.parse(raw) : {};
    }

    /**
     * Return a live (non-cloned) array of annotations for one page.
     * @param {number} page  1-based page number.
     * @returns {Annotation[]}
     */
    function getPage(page) {
        return _annotations[page] || [];
    }

    /**
     * Push the current state onto the undo stack before making a change.
     * Clears the redo stack — call this *before* calling `add`, `removeById`, or `clearPage`.
     */
    function pushUndo() {
        _undoStack.push(_snapshot());
        if (_undoStack.length > MAX_UNDO) _undoStack.shift();
        _redoStack = [];
    }

    /**
     * Add an annotation to state and immediately persist it.
     * @param {Annotation} annotation
     */
    function add(annotation) {
        const p = annotation.page;
        if (!_annotations[p]) _annotations[p] = [];
        _annotations[p].push(annotation);
        _save();
    }

    /**
     * Remove all annotations with the given id (across all pages) and persist.
     * @param {string} id
     */
    function removeById(id) {
        for (const p of Object.keys(_annotations)) {
            _annotations[p] = _annotations[p].filter(a => a.id !== id);
        }
        _save();
    }

    /**
     * Delete every annotation on a single page and persist.
     * @param {number} page  1-based page number.
     */
    function clearPage(page) {
        delete _annotations[page];
        _save();
    }

    /**
     * Restore the previous state from the undo stack.
     * @returns {boolean} true if an undo step was available.
     */
    function undo() {
        if (!_undoStack.length) return false;
        _redoStack.push(_snapshot());
        _annotations = _undoStack.pop();
        _save();
        return true;
    }

    /**
     * Re-apply the last undone state from the redo stack.
     * @returns {boolean} true if a redo step was available.
     */
    function redo() {
        if (!_redoStack.length) return false;
        _undoStack.push(_snapshot());
        _annotations = _redoStack.pop();
        _save();
        return true;
    }

    /**
     * Return a deep clone of all annotations, keyed by page number.
     * Safe to pass to export or server-save without mutating internal state.
     * @returns {Object.<number, Annotation[]>}
     */
    function all() { return _snapshot(); }

    /**
     * Generate a compact time-based unique ID for a new annotation.
     * @returns {string}
     */
    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    return { init, getPage, pushUndo, add, removeById, clearPage, undo, redo, all, uid };
})();
