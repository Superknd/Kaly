# Kaly API (Laravel)

Laravel 12 API for Kaly. It keeps the existing `/api` route contracts, MySQL tables, BCrypt hashes, and HS256 bearer tokens.

## Local setup

Requirements: PHP 8.2+, Composer 2, and the PHP extensions required by Laravel (including `pdo_sqlite`, `pdo_mysql`, `mbstring`, `fileinfo`, and GD).

```powershell
Copy-Item .env.example .env
composer install
php artisan key:generate
```

The sample environment uses a local SQLite database. Set `KALY_JWT_SECRET` to at least 32 random bytes, then:

```powershell
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8080
```

## Tests

```powershell
php artisan test
```

Feature tests use SQLite in memory. `php artisan migrate` does not recreate or drop the existing Flyway-managed Kaly tables; document files remain outside the database in `KALY_STORAGE_DIR`.

## Docker

The project root's `docker-compose.yml` runs Laravel with Apache/PHP and MySQL. The backend container applies Laravel migrations at startup. Set `APP_KEY`, `KALY_JWT_SECRET`, and the database passwords in the root `.env` before starting Compose.
