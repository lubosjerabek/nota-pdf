<?php
/**
 * upload.php — PDF upload handler.
 *
 * Accepts a multipart/form-data POST from index.php with a single file field
 * named "pdf". Validates the MIME type using PHP's finfo extension (not just
 * the file extension, which is user-controlled), sanitises the original
 * filename, saves the file to uploads/ with a random 4-byte hex suffix to
 * prevent name collisions, then redirects to annotate.php.
 *
 * Security notes:
 *   - MIME validation via finfo rejects non-PDF files even if renamed .pdf.
 *   - The generated filename uses only [a-zA-Z0-9_\-] characters to prevent
 *     directory traversal or shell injection if the path is ever passed to a
 *     system call.
 *   - .htaccess blocks direct HTTP access to uploads/ so uploaded PDFs cannot
 *     be executed even on misconfigured servers.
 */
declare(strict_types=1);

$uploadDir = __DIR__ . '/uploads/';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('Method not allowed');
}

if (!isset($_FILES['pdf']) || $_FILES['pdf']['error'] !== UPLOAD_ERR_OK) {
    $code = $_FILES['pdf']['error'] ?? -1;
    header('Location: index.php?error=' . urlencode("Upload failed (code $code)"));
    exit;
}

$file = $_FILES['pdf'];

// Validate using magic bytes, not just the Content-Type header or file extension
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime  = $finfo->file($file['tmp_name']);
if ($mime !== 'application/pdf') {
    header('Location: index.php?error=' . urlencode('Only PDF files are accepted.'));
    exit;
}

// Strip anything outside [a-zA-Z0-9_-] and cap at 80 chars to stay filesystem-safe
$originalName = pathinfo($file['name'], PATHINFO_FILENAME);
$safeName     = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $originalName);
$safeName     = substr($safeName, 0, 80);
$filename     = $safeName . '_' . bin2hex(random_bytes(4)) . '.pdf';

if (!move_uploaded_file($file['tmp_name'], $uploadDir . $filename)) {
    header('Location: index.php?error=' . urlencode('Failed to save the file.'));
    exit;
}

header('Location: annotate.php?file=' . urlencode($filename));
exit;
