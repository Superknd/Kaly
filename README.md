# Kaly

Kaly est une application de gestion et de préparation de documents. Le frontend Angular propose une bibliothèque de documents locale ou liée à un compte, des dossiers, le scan de pages et plusieurs outils PDF. L’API Laravel fournit l’authentification JWT et le stockage privé des documents.

## Démarrer le frontend

Prérequis : Node.js 20.19+, 22.12+ ou 24 LTS. Angular CLI 21 ne prend pas officiellement en charge Node.js 25.

```powershell
cd frontend
npm install
npm start
```

Ouvrir ensuite `http://localhost:4200`.

## Fonctions implémentées

- Tableau de bord Kaly et navigation responsive.
- Bibliothèque persistée dans IndexedDB hors connexion ou dans l’espace serveur après connexion, avec recherche, filtres, aperçu, téléchargement et suppression.
- Inscription et connexion, puis consultation et organisation des documents personnels via l’API.
- Création, renommage, suppression et filtrage par dossiers; déplacer un document n’en modifie pas le contenu.
- Import de PDF et d’images.
- Fusion de plusieurs PDF et images JPEG/PNG en un PDF, avec choix de l’ordre.
- Création d’un PDF multipage à partir d’images ou de captures caméra, avec détection et correction de perspective OpenCV, réorganisation et rotation des pages.
- Extraction de pages PDF par plages (par exemple `1, 3-5`).
- Édition de pages PDF (réorganisation, rotation, suppression), division par plages, compression par rasterisation et conversion des pages en images.
- OCR français pour les images et les PDF jusqu’à 20 pages, avec extraction et téléchargement du texte. Le moteur et les données linguistiques sont servis localement.
- Boîtes de dialogue accessibles pour les actions sensibles, texture de grain discrète sur l’interface et onglet de soutien communautaire.
- Contrôle des types, limite de 50 Mo par fichier et de 100 Mo par lot dans les outils.

Les outils PDF traitent les fichiers dans le navigateur. Les documents créés ou importés sont enregistrés dans l’espace actif (IndexedDB ou API selon la session). La compression rasterise les pages et ne conserve pas le texte sélectionnable.

## API backend

Le backend est une API Laravel 12 (PHP 8.2+) avec MySQL en déploiement et SQLite possible en développement local. Depuis `backend/` :

```powershell
Copy-Item .env.example .env
composer install
php artisan key:generate
```

Configure ensuite `KALY_JWT_SECRET` dans `.env` avec au moins 32 octets aléatoires. Le profil de développement utilise SQLite par défaut; lancer les migrations puis l’API :

```powershell
php artisan migrate
php artisan serve --host=127.0.0.1 --port=8080
```

Les appels du frontend passent par le proxy `/api` vers `localhost:8080`. Les tests utilisent SQLite en mémoire :

```powershell
php artisan test
```

Les endpoints et leurs formats JSON restent compatibles avec Angular :

- `POST /api/auth/register`, `POST /api/auth/login` et `GET /api/auth/me`.
- `POST /api/auth/password-reset` et `/api/auth/password-reset/confirm`.
- `GET/POST /api/documents`, `GET /api/documents/{id}/content`, `PUT /api/documents/{id}/name`, `PUT /api/documents/{id}/folder` et `DELETE /api/documents/{id}`.
- `GET/POST /api/folders`, `PUT/DELETE /api/folders/{id}`.
- `GET /api/notifications`, `GET /api/notifications/unread-count`, `PATCH /api/notifications/{id}/read` et `PATCH /api/notifications/read-all`.
- `GET/POST /api/admin/users` et `PATCH /api/admin/users/{id}/enabled` (rôle ADMIN).
- `GET /api/admin/stats`, `GET /api/admin/users/{id}/activity`, `PATCH /api/admin/users/{id}/role` et `POST /api/admin/users/{id}/password-reset` (rôle ADMIN).
- `POST /api/pdf/merge` (JWT requis).

Le formulaire d’inscription est accessible depuis le bouton « Créer un compte » dans l’en-tête ou directement via `/?auth=register`.

Les routes privées nécessitent `Authorization: Bearer TOKEN_JWT`. Les identifiants, rôles, noms de colonnes et données historiques Flyway sont conservés; la migration Laravel ne recrée pas les tables Kaly déjà présentes. Pour réutiliser les fichiers existants, configure `KALY_STORAGE_DIR` sur le même répertoire de stockage. Les mots de passe BCrypt et les JWT émis par l’ancien backend restent compatibles si le secret JWT n’est pas changé.

Le panneau admin permet de rechercher et filtrer les comptes, de modifier les rôles, de désactiver ou réactiver les comptes et d’envoyer un lien de réinitialisation par e-mail si SMTP et la récupération de mot de passe sont configurés. La désactivation conserve les données; aucune suppression définitive de compte n’est proposée. Les statistiques agrègent les comptes, documents, dossiers, notifications et créations des 30 derniers jours. L’activité individuelle ne révèle que des compteurs d’utilisation et le volume stocké, jamais les noms ni le contenu des documents.

La récupération de mot de passe est désactivée par défaut. Pour l’activer, configure `KALY_PASSWORD_RESET_ENABLED=true`, le serveur SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`), `KALY_MAIL_FROM` et `KALY_FRONTEND_URL`. Les jetons sont à usage unique et expirent après 30 minutes; une erreur SMTP est renvoyée explicitement.

Les comptes de démonstration ne sont créés que si `APP_ENV=local` ou `development` et `KALY_DEMO_ACCOUNTS_ENABLED=true`. Définis `KALY_DEMO_ADMIN_PASSWORD` et `KALY_DEMO_USER_PASSWORD` (12 caractères minimum), puis lance `php artisan db:seed`. N’active jamais ces comptes sur une instance de production. Les comptes existants ne sont pas modifiés.

## Déploiement Docker

Copier `.env.example` vers `.env`, définir des valeurs fortes pour `DB_PASSWORD` et `MYSQL_ROOT_PASSWORD`, puis générer `APP_KEY` et `KALY_JWT_SECRET` (par exemple avec `php artisan key:generate --show` dans `backend/` et `php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"`). Reporter ces valeurs dans le `.env` à la racine avant de lancer :

```powershell
docker compose up --build
```

Pour les comptes de démonstration, utiliser une base et des volumes dédiés au développement, puis définir `APP_ENV=local`, `KALY_DEMO_ACCOUNTS_ENABLED=true` et les deux mots de passe dans `.env` avant de lancer `docker compose -p kaly-dev up --build`. Ne pas activer cette option sur un déploiement de production.

Le frontend est servi sur `http://localhost:4200`, l’API sur `http://localhost:8080` et MySQL écoute uniquement dans le réseau Compose. En développement, Angular relaie les appels `/api` vers le backend; en déploiement, Nginx relaie ces mêmes appels vers le service API. Le navigateur n’a donc pas besoin d’une URL d’API codée en dur ni d’un accès CORS inter-origines.

Le lien externe du bouton « Soutenir financièrement » se configure dans `frontend/src/environments/environment.ts` (`supportUrl`). Tant qu’aucune URL de don n’a été fournie, l’interface ne présente pas de lien de paiement fictif; le partage de Kaly reste disponible.

## Architecture

- `frontend/` : Angular, TypeScript, SCSS et Lucide Angular.
- `backend/` : API REST Laravel organisée en contrôleurs, services, modèles, middleware JWT et gestion JSON des erreurs.
- MySQL avec Flyway pour les métadonnées; fichiers dans un répertoire serveur configurable, hors de la base.
- FPDI/FPDF pour la fusion, JWT et BCrypt pour l’authentification.
- Docker Compose pour le frontend, l’API et MySQL.

## Étapes restant à développer

L’OCR est actuellement limité au français et aux PDF de 20 pages par opération. L’authentification conserve le jeton dans `sessionStorage` et ne propose pas de renouvellement automatique.

Le recadrage automatique s’effectue localement dans le navigateur. Si aucun contour fiable n’est trouvé, l’image originale est conservée; l’option peut être désactivée ou relancée page par page.

## Vérification

Depuis `frontend/` :

```powershell
npm run build
npm test -- --watch=false
```

Depuis `backend/` :

```powershell
php artisan test
```
