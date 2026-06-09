<?php
/**
 * router.php
 * Router script for PHP built-in web server.
 * Replicates the URL rewriting rules in .htaccess for local development and testing.
 */

$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

// Decode URL to handle encoded filenames or spaces correctly
$uri = rawurldecode($uri);

// Prevent directory traversal or accessing files outside the root directory
if (strpos($uri, '..') !== false) {
    http_response_code(400);
    exit('Invalid request');
}

$file = __DIR__ . $uri;

// 1. Block direct access to uploads/ and annotations/
if (preg_match('#^/(uploads|annotations)/#', $uri)) {
    http_response_code(403);
    exit('Forbidden');
}

// 2. If it's a real file, serve it directly
if (is_file($file)) {
    // Register .mjs as JavaScript module manually for the built-in server
    if (pathinfo($file, PATHINFO_EXTENSION) === 'mjs') {
        header('Content-Type: text/javascript');
    }
    return false;
}

// 3. /index.php -> /
if ($uri === '/index.php') {
    header('Location: /', true, 301);
    exit;
}

// 4. /anything.php -> /anything (for GET requests)
if (preg_match('#^/(.+)\.php$#', $uri, $matches)) {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        header('Location: /' . $matches[1], true, 301);
        exit;
    }
}

// 5. Root path -> index.php
if ($uri === '/' || $uri === '') {
    include __DIR__ . '/index.php';
    return;
}

// 6. /name -> name.php
if (is_file(__DIR__ . $uri . '.php')) {
    include __DIR__ . $uri . '.php';
    return;
}

// Fallback to 404
http_response_code(404);
exit('Not Found');
