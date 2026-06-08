<?php
declare(strict_types=1);

$filename = $_GET['file'] ?? '';

// Validate: must be a filename only (no path traversal), must exist in uploads/
if (!$filename || $filename !== basename($filename) || !preg_match('/^[a-zA-Z0-9_\-]+\.pdf$/', $filename)) {
    header('Location: index.php?error=' . urlencode('Invalid file.'));
    exit;
}

$path = __DIR__ . '/uploads/' . $filename;
if (!file_exists($path)) {
    header('Location: index.php?error=' . urlencode('File not found.'));
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
    <link rel="stylesheet" href="assets/app.css">
</head>
<body class="annotate-page">

    <nav class="toolbar" id="toolbar">
        <a href="index.php" class="toolbar-logo" title="Back to home">Nota</a>
        <div class="toolbar-sep"></div>

        <button class="tool-btn" data-tool="highlight" title="Highlight text (H)">
            <svg viewBox="0 0 24 24"><rect x="3" y="14" width="18" height="6" rx="1" fill="currentColor" opacity=".4"/><line x1="5" y1="10" x2="19" y2="10" stroke="currentColor" stroke-width="2"/><line x1="7" y1="6" x2="17" y2="6" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="tool-btn" data-tool="draw" title="Draw (D)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path d="M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
        </button>
        <button class="tool-btn" data-tool="text" title="Text note (T)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
        </button>
        <button class="tool-btn" data-tool="select" title="Select / delete (S)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-7 1-3 7z"/></svg>
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
            pdfUrl: 'uploads/' + <?= json_encode(rawurlencode($filename)) ?>,
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
