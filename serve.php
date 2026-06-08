<?php
declare(strict_types=1);

$filename = $_GET['file'] ?? '';

if (!$filename || $filename !== basename($filename) || !preg_match('/^[a-zA-Z0-9_\-]+\.pdf$/', $filename)) {
    http_response_code(400);
    exit;
}

$path = __DIR__ . '/uploads/' . $filename;

if (!file_exists($path)) {
    http_response_code(404);
    exit;
}

header('Content-Type: application/pdf');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: inline; filename="' . $filename . '"');
header('Cache-Control: private, max-age=3600');
readfile($path);
