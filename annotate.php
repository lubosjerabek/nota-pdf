<?php
declare(strict_types=1);

$filename = $_GET['file'] ?? '';

// Validate: must be a filename only (no path traversal), must exist in uploads/
if (!$filename || $filename !== basename($filename) || !preg_match('/^[a-zA-Z0-9_\-]+\.pdf$/', $filename)) {
    header('Location: /?error=' . urlencode('Invalid file.'));
    exit;
}

$path = __DIR__ . '/uploads/' . $filename;
if (!file_exists($path)) {
    header('Location: /?error=' . urlencode('File not found.'));
    exit;
}

$displayName = preg_replace('/_[0-9a-f]{8}\.pdf$/', '', $filename);
$displayName = str_replace('_', ' ', $displayName);
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($displayName) ?> — Nota</title>
    <link rel="icon" type="image/svg+xml" href="favicon.svg">
    <link rel="stylesheet" href="assets/app.css">
</head>
<body class="annotate-page">

    <nav class="toolbar" id="toolbar">
        <a href="/" class="toolbar-logo" title="Back to home">Nota</a>
        <div class="toolbar-sep"></div>

        <button class="tool-btn" data-tool="highlight" title="Highlight text (H)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 11-6 6v3h3l6-6"/><path d="m14 6-2.5 2.5 3.5 3.5 2.5-2.5-3.5-3.5z"/><path d="m11.5 8.5 3.5 3.5"/></svg>
            <span>Highlight</span>
        </button>
        <button class="tool-btn" data-tool="draw" title="Draw (D)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            <span>Draw</span>
        </button>
        <button class="tool-btn" data-tool="text" title="Text note (T)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9z"/><polyline points="16 3 16 9 22 9"/></svg>
            <span>Text Note</span>
        </button>
        <button class="tool-btn" data-tool="select" title="Select / delete (S)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>
            <span>Select</span>
        </button>

        <div class="toolbar-sep"></div>

        <label class="color-swatch-wrap" title="Color">
            <input type="color" id="color-picker" value="#f5c518">
            <span class="color-swatch" id="color-swatch"></span>
        </label>

        <label class="stroke-wrap" title="Stroke width">
            <input type="range" id="stroke-width" min="1" max="12" value="3">
        </label>

        <div class="toolbar-sep"></div>

        <button class="icon-btn" id="undo-btn" title="Undo (Ctrl+Z)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.95"/></svg>
        </button>
        <button class="icon-btn" id="redo-btn" title="Redo (Ctrl+Y)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-4.95"/></svg>
        </button>
        <button class="icon-btn" id="clear-btn" title="Clear page annotations">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>

        <div class="toolbar-sep"></div>

        <button class="icon-btn save-server-btn" id="save-server-btn" title="Save annotations to server">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </button>
        <button class="icon-btn export-btn" id="export-btn" title="Export annotated PDF">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>

        <div class="toolbar-filename"><?= htmlspecialchars($displayName) ?></div>
    </nav>

    <main class="viewer" id="viewer">
        <div id="pages-container"></div>
    </main>

    <div id="status-bar">
        <span id="status-msg">Loading…</span>
        <span id="page-count"></span>
    </div>

    <script>
        window.NOTA = {
            filename: <?= json_encode($filename) ?>,
            pdfUrl: 'serve?file=' + <?= json_encode(rawurlencode($filename)) ?>,
            workerSrc: 'assets/vendor/pdf.worker.min.mjs'
        };
    </script>

    <!-- pdf-lib for export -->
    <script src="assets/vendor/pdf-lib.min.js"></script>

    <!-- PDF.js as ES module -->
    <script type="module">
        import * as pdfjsLib from './assets/vendor/pdf.min.mjs';
        pdfjsLib.GlobalWorkerOptions.workerSrc = window.NOTA.workerSrc;
        window.pdfjsLib = pdfjsLib;

        // Load app modules after pdfjsLib is ready
        const load = src => new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src; s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
        });
        await load('assets/state.js');
        await load('assets/viewer.js');
        await load('assets/tools.js');
        await load('assets/export.js');
        await load('assets/app.js');

        window.NotaApp.init();
    </script>
</body>
</html>
