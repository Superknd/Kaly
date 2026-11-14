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

For a standalone MySQL 8+ schema script instead of running Laravel migrations, apply `database/schema.mysql.sql` to your MySQL server. It creates the `kaly` database and its tables if they do not already exist; it does not drop or modify existing tables.

## Tests

```powershell
php artisan test
```

Feature tests use SQLite in memory. `php artisan migrate` does not recreate or drop the existing Flyway-managed Kaly tables; document files remain outside the database in `KALY_STORAGE_DIR`.

Admin-only endpoints provide global usage and 30-day account/document creation statistics, per-account aggregate usage (document, folder, notification counts and storage size), account role changes, and password-reset email requests. They never return document names or content. Accounts can be disabled or re-enabled without deleting their data. Password-reset emails require `KALY_PASSWORD_RESET_ENABLED=true` and a working SMTP configuration.

## Docker

The project root's `docker-compose.yml` runs Laravel with Apache/PHP and MySQL. The backend container applies Laravel migrations at startup. Set `APP_KEY`, `KALY_JWT_SECRET`, and the database passwords in the root `.env` before starting Compose.
