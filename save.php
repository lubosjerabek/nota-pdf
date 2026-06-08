<?php
/**
 * save.php — Server-side annotation persistence (optional).
 *
 * Accepts a JSON POST body:
 *   { "docId": "<filename>.pdf", "annotations": { "<page>": [ ...annotation objects ] } }
 *
 * Writes the annotations object to annotations/<docId>.json.
 * The client calls this endpoint from the "Save to server" button in the toolbar.
 * Annotations are also kept in localStorage automatically, so this endpoint is
 * only needed when you want server-side durability (e.g. shared hosting with
 * multiple devices, or to survive browser cache clears).
 *
 * The docId validation regex matches exactly the filenames that upload.php
 * generates, preventing directory traversal via crafted docId values.
 */
declare(strict_types=1);

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$body = file_get_contents('php://input');
$data = json_decode($body, true);

if (!$data || empty($data['docId']) || !isset($data['annotations'])) {
    echo json_encode(['ok' => false, 'error' => 'Invalid payload']);
    exit;
}

$docId = $data['docId'];
// Accepts only the safe filenames produced by upload.php: [a-zA-Z0-9_-]+.pdf
if (!preg_match('/^[a-zA-Z0-9_\-]+\.pdf$/', $docId)) {
    echo json_encode(['ok' => false, 'error' => 'Invalid docId']);
    exit;
}

$path    = __DIR__ . '/annotations/' . $docId . '.json';
$encoded = json_encode($data['annotations'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

if (file_put_contents($path, $encoded) === false) {
    echo json_encode(['ok' => false, 'error' => 'Write failed']);
    exit;
}

echo json_encode(['ok' => true]);
