<?php
$path = trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');

$routes = [
    '' => 'public/index.php',
    'info' => 'public/info.php',
    'renew' => 'public/renew.php',
    'upgrade' => 'public/upgrade.php',
];

if (isset($routes[$path])) {
    require __DIR__ . '/' . $routes[$path];
} else {
    http_response_code(404);
    require __DIR__ . '/404.php';
}
