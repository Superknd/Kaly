<?php

return [
    'jwt_secret' => env('KALY_JWT_SECRET', ''),
    'jwt_expiration' => (int) env('KALY_JWT_EXPIRATION_SECONDS', 43200),
    'storage_dir' => env('KALY_STORAGE_DIR') ?: storage_path('app/private/documents'),
    'password_reset_enabled' => (bool) env('KALY_PASSWORD_RESET_ENABLED', false),
    'frontend_url' => env('KALY_FRONTEND_URL', 'http://localhost:4200/'),
    'mail_from' => env('KALY_MAIL_FROM', 'noreply@kaly.local'),
    'demo_accounts_enabled' => (bool) env('KALY_DEMO_ACCOUNTS_ENABLED', false),
    'demo_admin_name' => env('KALY_DEMO_ADMIN_NAME', 'Kaly Admin'),
    'demo_admin_email' => env('KALY_DEMO_ADMIN_EMAIL', 'admin@kaly.local'),
    'demo_admin_password' => env('KALY_DEMO_ADMIN_PASSWORD', ''),
    'demo_user_name' => env('KALY_DEMO_USER_NAME', 'Kaly User'),
    'demo_user_email' => env('KALY_DEMO_USER_EMAIL', 'user@kaly.local'),
    'demo_user_password' => env('KALY_DEMO_USER_PASSWORD', ''),
    'cors_origin' => env('KALY_CORS_ORIGIN', 'http://localhost:4200'),
];
