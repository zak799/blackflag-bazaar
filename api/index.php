<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=UTF-8');

// Get the requested path
$request = $_SERVER['REQUEST_URI'];

// Remove query string if present
$request = strtok($request, '?');

// Map requests to PHP files in public/
$routes = [
    '/' => 'index.php',
    '/info' => 'info.php',
    '/renew' => 'renew.php',
    '/upgrade' => 'upgrade.php'
];

// Normalize request: remove trailing slash
$request = rtrim($request, '/');

// Default: route everything else to index.php
$file = $routes[$request] ?? 'index.php';

// Include the requested PHP file from public/
include __DIR__ . '/../public/' . $file;
