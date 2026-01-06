<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = trim($path, '/');

$routes = [
    '' => 'app/index.php',
    'info' => 'app/info.php',
    'renew' => 'app/renew.php',
    'upgrade' => 'app/upgrade.php',
];

if (isset($routes[$path])) {
    require __DIR__ . '/' . $routes[$path];
} else {
    http_response_code(404);
    // redirect to 404.php inside app
    require __DIR__ . '/app/404.php';
    exit;
}
