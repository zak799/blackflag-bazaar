<?php
declare(strict_types=1);
header('Content-Type: text/html; charset=UTF-8');

// Front controller: catch everything
$request = $_SERVER['REQUEST_URI'];
$request = strtok($request, '?'); // remove query string
$request = rtrim($request, '/');

// Map routes to your public PHP files
$routes = [
    '' => __DIR__ . '/../public/index.php',
    '/index' => __DIR__ . '/../public/index.php',
    '/info' => __DIR__ . '/../public/info.php',
    '/renew' => __DIR__ . '/../public/renew.php',
    '/upgrade' => __DIR__ . '/../public/upgrade.php'
];

// Default fallback: index.php
$target = $routes[$request] ?? __DIR__ . '/../public/index.php';

include $target;
