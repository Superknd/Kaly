# Kaly

Kaly est une application de gestion et de préparation de documents. Le frontend Angular propose une bibliothèque de documents locale ou liée à un compte, des dossiers, le scan de pages et plusieurs outils PDF. L’API Spring Boot fournit l’authentification JWT et le stockage privé des documents.

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

Prérequis : Java 25 et MySQL 8.4. Depuis `backend/`, lancer `.\mvnw.cmd test` pour vérifier l’API sans MySQL (les tests utilisent H2).

Pour démarrer immédiatement une instance locale isolée, sans toucher à MySQL ni créer de fichier `.env`, lancer depuis `backend/` :

```powershell
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

Le profil `local` utilise une base H2 dédiée dans `%USERPROFILE%\.kaly\local-demo.mv.db`, liée uniquement à `127.0.0.1`, et crée les comptes de démonstration ci-dessous. Ces identifiants sont réservés au profil local, ne pas les réutiliser en production. L’interface de développement doit être ouverte sur `http://localhost:4210` pour que CORS et le proxy API correspondent à cette configuration.

| Rôle | Adresse | Mot de passe |
|---|---|---|
| Administrateur | `admin@kaly.local` | `password54321` |
| Utilisateur | `user@kaly.local` | `kinda6543210` |

L’API de développement se configure par variables d’environnement :

- `DB_URL` (par défaut `jdbc:mysql://localhost:3306/kaly?...`)
- `DB_USER` et `DB_PASSWORD`
- `KALY_JWT_SECRET` (obligatoire, au moins 32 caractères)
- `KALY_STORAGE_DIR` (par défaut `./data/documents`)
- `KALY_CORS_ORIGIN` (par défaut `http://localhost:4200`)

Routes disponibles :

- `POST /api/auth/register` et `POST /api/auth/login` : crée un compte USER ou ouvre une session JWT.
- `GET /api/auth/me` : renvoie l’identité et le rôle du compte connecté.
- `POST /api/auth/password-reset` et `POST /api/auth/password-reset/confirm` : envoie un lien de réinitialisation à usage unique (30 minutes) et change le mot de passe.
- `GET /api/notifications` et `GET /api/notifications/unread-count` : liste les 50 notifications les plus récentes du compte et son nombre de notifications non lues.
- `PATCH /api/notifications/{id}/read` et `PATCH /api/notifications/read-all` : marque une notification ou toutes les notifications du compte comme lues.
- `GET/POST /api/admin/users` et `PATCH /api/admin/users/{id}/enabled` : réservés aux ADMIN; listent les comptes, créent un utilisateur/admin et activent/désactivent un compte. Le dernier admin actif et le compte admin courant ne peuvent pas être désactivés.
- `GET /api/documents` : liste les métadonnées des documents du compte.
- `POST /api/documents` : téléverse un PDF, JPEG ou PNG (`multipart/form-data`, champ `file`).
- `GET /api/documents/{id}/content`, `PUT /api/documents/{id}/name`, `PUT /api/documents/{id}/folder` et `DELETE /api/documents/{id}` : lire, renommer, déplacer et supprimer un document appartenant au compte.
- `GET/POST /api/folders`, `PUT/DELETE /api/folders/{id}` : lister, créer, renommer et supprimer ses dossiers. Supprimer un dossier conserve ses documents en les laissant sans dossier.
- `POST /api/pdf/merge` : fusionne au moins deux PDF/images (`multipart/form-data`, champs `files`).

Sauf les routes d’authentification, les endpoints nécessitent `Authorization: Bearer TOKEN_JWT`. Flyway crée les tables dans la base MySQL `kaly`, qui doit être accessible. Les fichiers sont stockés hors MySQL avec une clé aléatoire; l’API vérifie la propriété avant de les servir.

La récupération de mot de passe est désactivée par défaut. Pour l’activer, configurer `KALY_PASSWORD_RESET_ENABLED=true`, un serveur SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_AUTH`, `SMTP_STARTTLS`), l’expéditeur `KALY_MAIL_FROM` et l’URL publique de Kaly `KALY_FRONTEND_URL`. Sans SMTP valide, la demande renvoie une erreur explicite et aucun lien n’est prétendu envoyé.

Les routes privées nécessitent un JWT dans l’en-tête `Authorization`; `/api/admin/**` nécessite en plus le rôle ADMIN. Les comptes de démonstration `admin@kaly.local` et `user@kaly.local` sont créés uniquement avec le profil Spring `dev` et `KALY_DEMO_ACCOUNTS_ENABLED=true`. Définir les mots de passe `KALY_DEMO_ADMIN_PASSWORD` et `KALY_DEMO_USER_PASSWORD` dans l’environnement; chacun doit compter au moins 12 caractères. Les valeurs d’exemple sont des marqueurs à remplacer, pas des identifiants par défaut. Dans Docker Compose, lancer avec un projet et des volumes dédiés au développement (par exemple `docker compose -p kaly-dev up --build`) afin de ne pas créer de comptes de test dans une base de production. Les identifiants déjà présents ne sont jamais modifiés par le seed.

Exception aux routes d’authentification publiques : `GET /api/auth/me` nécessite un JWT valide.

## Déploiement Docker

Copier `.env.example` vers `.env`, remplacer les mots de passe et le secret JWT par des valeurs fortes, puis lancer :

```powershell
docker compose up --build
```

Pour les comptes de démonstration, utiliser une base et des volumes dédiés au développement, puis définir `SPRING_PROFILES_ACTIVE=dev`, `KALY_DEMO_ACCOUNTS_ENABLED=true` et les deux mots de passe dans `.env` avant de lancer `docker compose -p kaly-dev up --build`. Ne pas activer ce profil sur un déploiement de production.

Le frontend est servi sur `http://localhost:4200`, l’API sur `http://localhost:8080` et MySQL écoute uniquement dans le réseau Compose. En développement, Angular relaie les appels `/api` vers le backend; en déploiement, Nginx relaie ces mêmes appels vers le service API. Le navigateur n’a donc pas besoin d’une URL d’API codée en dur ni d’un accès CORS inter-origines.

Le lien externe du bouton « Soutenir financièrement » se configure dans `frontend/src/environments/environment.ts` (`supportUrl`). Tant qu’aucune URL de don n’a été fournie, l’interface ne présente pas de lien de paiement fictif; le partage de Kaly reste disponible.

## Architecture

- `frontend/` : Angular, TypeScript, SCSS et Lucide Angular.
- `backend/` : API REST Spring Boot organisée en couches controller, service, repository, entity, DTO, sécurité et gestion des erreurs.
- MySQL avec Flyway pour les métadonnées; fichiers dans un répertoire serveur configurable, hors de la base.
- Apache PDFBox pour la fusion, JWT et BCrypt pour l’authentification.
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
.\mvnw.cmd test
```
