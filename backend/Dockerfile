FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction
COPY . .
RUN composer dump-autoload --classmap-authoritative --no-dev \
    && php artisan package:discover --ansi

FROM php:8.3-apache
RUN apt-get update \
    && apt-get install -y --no-install-recommends libonig-dev libpng-dev libzip-dev \
    && docker-php-ext-install mbstring pdo_mysql gd zip opcache \
    && a2enmod rewrite \
    && printf 'upload_max_filesize=50M\npost_max_size=110M\nmax_execution_time=120\n' > /usr/local/etc/php/conf.d/kaly.ini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html
COPY --from=vendor /app /var/www/html
COPY docker/000-default.conf /etc/apache2/sites-available/000-default.conf
COPY docker/entrypoint.sh /usr/local/bin/kaly-entrypoint
RUN chmod +x /usr/local/bin/kaly-entrypoint \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache

EXPOSE 80
ENTRYPOINT ["kaly-entrypoint"]
