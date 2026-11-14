#!/bin/sh
set -eu

mkdir -p /app/data "${KALY_STORAGE_DIR:-/var/www/html/storage/app/private/documents}"
chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache
if [ ! -f /app/data/.kaly-permissions-fixed ]; then
    chown -R www-data:www-data /app/data
    touch /app/data/.kaly-permissions-fixed
    chown www-data:www-data /app/data/.kaly-permissions-fixed
fi

php artisan migrate --force
if [ "${KALY_DEMO_ACCOUNTS_ENABLED:-false}" = "true" ]; then
    php artisan db:seed --force
fi

exec apache2-foreground
