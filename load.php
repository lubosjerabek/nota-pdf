<?php
/**
 * load.php — Retrieve server-saved annotations for a document (optional).
 *
 * GET parameter: docId=<filename>.pdf
 *
 * Returns JSON:
 *   { "ok": true,  "annotations": { ... } }   — when a save file exists
 *   { "ok": true,  "annotations": {}     }   — when no save file exists yet
 *   { "ok": false, "error": "..."        }   — on validation failure
 *
 * The client can call this on page load to prefer server-saved annotations over
 * localStorage (useful when the same PDF is annotated from multiple devices).
 * Currently not called automatically; wiring it into app.js is left as an
 * extension point.
 */
declare(strict_types=1);

header('Content-Type: application/json');

$docId = $_GET['docId'] ?? '';

if (!$docId || !preg_match('/^[a-zA-Z0-9_\-]+\.pdf$/', $docId)) {
    echo json_encode(['ok' => false, 'error' => 'Invalid docId']);
    exit;
}

$path = __DIR__ . '/annotations/' . $docId . '.json';

if (!file_exists($path)) {
    // No server save yet — return empty annotations so the caller can fall
    // back to localStorage without treating this as an error.
    echo json_encode(['ok' => true, 'annotations' => new stdClass()]);
    exit;
}

$content     = file_get_contents($path);
$annotations = json_decode($content, true);

echo json_encode(['ok' => true, 'annotations' => $annotations ?? new stdClass()]);
