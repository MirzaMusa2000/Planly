# Planly

A private group planner for friends: propose events with candidate dates, vote on
availability, confirm and RSVP, plan a day-by-day itinerary, and chat. New members
wait for admin approval.

**Stack:** Laravel 12 (PHP 8.3) · kreait/laravel-firebase · Cloud Firestore ·
Firebase Auth · Blade + Tailwind v4 + Alpine.js (Vite) · FullCalendar · Firebase JS SDK.
All app data lives in Firestore. There is no SQL database.

---

## Local development

### 1. Requirements

| Tool | Version | Notes |
|---|---|---|
| PHP | **8.2+** (8.3 recommended) | Laragon ships 8.3: *Menu → PHP → Version → php-8.3.x* so `php` on your PATH is 8.3 |
| PHP extensions | `mbstring`, `openssl`, `curl`, `fileinfo`, `sodium`, `zip` | `zip` is only needed by Composer. Enable it in `php.ini` (`extension=zip`) |
| Composer | 2.x | |
| Node.js | 20+ | |
| Java | 11+ (21 recommended) | Required by the Firestore emulator |

`firebase-tools` is a dev dependency, so you don't need to install the Firebase CLI globally.
Use `npx firebase ...`.

### 2. About `ext-grpc`

`google/cloud-firestore` normally uses gRPC. **For local development on Windows you
don't need it.** Without the extension, the client automatically uses its REST
transport. That covers everything this app does on the server (reads, writes,
transactions and queries). Realtime listeners run in the browser, not in PHP.

`composer.json` declares `ext-grpc` under `config.platform`, so `composer install`
works on machines without it. The Docker image for Cloud Run installs the real
extension (see Phase 6), because gRPC is faster in production.

If you want gRPC locally anyway:

- **Linux / WSL2 / macOS:**
  ```bash
  sudo apt install php8.3-dev php-pear zlib1g-dev   # macOS: brew install php
  sudo pecl install grpc                            # compiling takes 10–20 minutes
  echo "extension=grpc.so" | sudo tee /etc/php/8.3/mods-available/grpc.ini
  sudo phpenmod grpc && php -m | grep grpc
  ```
- **Windows (native):** PECL no longer publishes Windows DLLs for recent PHP versions,
  so use WSL2 or Docker instead. You don't need gRPC for local development.

### 3. Install

```bash
composer install
npm install
cp .env.example .env
php artisan key:generate
```

For **emulator-only** development, set these in `.env`. You don't need a real
Firebase project: the `demo-` prefix tells the emulators this is a local sandbox.

```dotenv
FIREBASE_CREDENTIALS=
FIREBASE_PROJECT_ID=demo-planly
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080

VITE_FIREBASE_API_KEY=demo-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-planly.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-planly
VITE_USE_FIREBASE_EMULATORS=true
```

### 4. Run

Everything at once (emulators, Laravel and Vite):

```bash
npm run dev:all
```

Or in three terminals:

```bash
npm run emulators     # Auth :9099, Firestore :8080, Emulator UI http://127.0.0.1:4000
php artisan serve     # http://127.0.0.1:8000
npm run dev           # Vite dev server with hot reload
```

`npm run emulators` saves emulator data to `./emulator-data` when it exits and
loads it on the next start. Use `npm run emulators:fresh` to start empty.

### 5. First run: make yourself admin

1. Open <http://127.0.0.1:8000/login> and choose **Create an account**. You'll land on
   "Waiting for admin approval".
2. Promote yourself:
   ```bash
   php artisan app:make-admin you@example.com
   ```
3. Click **Check again** on the waiting page. You'll go to the dashboard, and
   **Members** appears in the header. Approve everyone else from there.

How approval works:
- New sign-ups get a `users/{uid}` doc with `status: "pending"`.
- **Approve** sets the custom claims (`approved`, plus `admin` for admins), then the status.
  A waiting user's page notices within a second and lets them in.
- **Reject / Revoke** sets `status: "rejected"`, removes the claims and revokes
  refresh tokens. Open tabs of that user sign out immediately. The server also re-checks
  status on every request (cached for up to 60s).

How voting works:
- Each person has one vote doc per event (`events/{id}/votes/{uid}`). While an event is
  **proposed** it holds `availableDates`; once **confirmed** it holds `rsvp`.
- The calendar reads only the cached `availabilitySummary` / `rsvpSummary` on the event.
  The browser writes a vote and its summary change in **one transaction**, and
  `firestore.rules` checks that the summary moved by exactly that vote's change (±1 on the
  toggled date, or the RSVP swap). Counts can't be faked or drift.
- **Confirm** and **Cancel** go through Laravel (`POST /events/{id}/confirm|cancel`). Only the
  admin or the event's proposer may use them, and they run as Firestore transactions.

### 6. Emulator notes

- With `FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` set, the Admin SDK
  talks to the emulators and acts as an admin, bypassing rules, just like in production.
  See `app/Support/Firebase/EmulatorAdminAuth.php`.
- Emulator ID tokens are unsigned. kreait accepts them only while the Auth emulator
  env var is set. **Never set `FIREBASE_AUTH_EMULATOR_HOST` in production.**
- The browser connects to the emulators when `VITE_USE_FIREBASE_EMULATORS=true`
  (see `resources/js/firebase.js`).

### 7. Tests

```bash
php artisan test        # Laravel feature + unit tests (Firebase mocked)
npm run test:rules      # Firestore security rules, against a throwaway emulator
```

`test:rules` uses `@firebase/rules-unit-testing` (`tests/rules/*.test.mjs`) and starts
its own Firestore emulator, so stop `npm run emulators` first (both use port 8080).

### Windows + OneDrive gotcha

OneDrive marks folders as *read-only*, and PHP then treats them as unwritable
("bootstrap/cache directory must be present and writable"). If that happens, run
this in PowerShell from the project root:

```powershell
Get-ChildItem -Directory -Recurse storage, bootstrap\cache | % { $_.Attributes = $_.Attributes -band -bnot [IO.FileAttributes]::ReadOnly }
```

Consider excluding `vendor/` and `node_modules/` from OneDrive sync (or moving the
project outside OneDrive). Syncing thousands of small files is slow.

---

## Using a real Firebase project

1. Complete the Firebase console steps (below).
2. Put the service account JSON at `storage/app/firebase/service-account.json`
   (gitignored), and set `FIREBASE_CREDENTIALS` to that path.
3. Set `FIREBASE_PROJECT_ID` and the `VITE_FIREBASE_*` web config values.
4. Comment out `FIREBASE_AUTH_EMULATOR_HOST` and `FIRESTORE_EMULATOR_HOST`, and set
   `VITE_USE_FIREBASE_EMULATORS=false`.
5. Deploy the rules and indexes:
   ```bash
   npx firebase login
   npx firebase use --add          # choose your project
   npx firebase deploy --only firestore:rules,firestore:indexes
   ```

### Firebase console checklist

1. **Create a project** at <https://console.firebase.google.com>. Google Analytics is optional.
2. **Add a Web app** (*Project settings → General → Your apps → `</>`*). Copy the
   config values into the `VITE_FIREBASE_*` variables. You don't need Firebase Hosting yet.
3. **Enable Authentication → Sign-in method → Email/Password.** Leave "Email link
   (passwordless)" off for now.
4. **Authentication → Settings → Authorized domains:** add your Cloud Run domain
   later. `localhost` is already there.
5. **Create a Firestore database** (*Build → Firestore Database → Create*) in
   **Native mode**. `asia-southeast1` (Singapore) is closest to Kuala Lumpur. Start in
   *production mode*, then deploy `firestore.rules`.
6. **Create a service account key** (*Project settings → Service accounts → Generate
   new private key*). Save it as `storage/app/firebase/service-account.json`.
   **Never commit it.**
7. After your first sign-up, bootstrap yourself as admin:
   `php artisan app:make-admin you@example.com`.

---

## Deploying to Google Cloud Run

The `Dockerfile` builds one project-agnostic image: PHP 8.3 + Apache, with the
`grpc` and `protobuf` extensions, and assets built by Vite. **All configuration is
runtime environment variables**, including the browser's Firebase config, which the
server renders into the page. The first build compiles gRPC, which takes about 10–15 minutes.

### 1. One-time Google Cloud setup

Use the Google Cloud project that backs your Firebase project.

```bash
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# A dedicated identity for the service. It uses Application Default Credentials,
# so no key file is needed in production.
gcloud iam service-accounts create planly-run --display-name "Planly (Cloud Run)"
SA=planly-run@YOUR_PROJECT_ID.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member "serviceAccount:$SA" --role roles/datastore.user          # Firestore
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID --member "serviceAccount:$SA" --role roles/firebaseauth.admin      # custom claims, revoke tokens

# APP_KEY as a secret
php artisan key:generate --show | tr -d '\n' | gcloud secrets create planly-app-key --data-file=-
gcloud secrets add-iam-policy-binding planly-app-key --member "serviceAccount:$SA" --role roles/secretmanager.secretAccessor
```

### 2. Deploy

```bash
gcloud run deploy planly \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --service-account planly-run@YOUR_PROJECT_ID.iam.gserviceaccount.com \
  --set-secrets APP_KEY=planly-app-key:latest \
  --set-env-vars "APP_ENV=production,APP_DEBUG=false,APP_URL=https://YOUR-SERVICE-URL,APP_TIMEZONE=Asia/Kuala_Lumpur,LOG_CHANNEL=stderr,SESSION_DRIVER=cookie,SESSION_SECURE_COOKIE=true,CACHE_STORE=file,FIREBASE_PROJECT_ID=YOUR_PROJECT_ID,VITE_FIREBASE_API_KEY=...,VITE_FIREBASE_AUTH_DOMAIN=YOUR_PROJECT_ID.firebaseapp.com,VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID,VITE_FIREBASE_STORAGE_BUCKET=...,VITE_FIREBASE_MESSAGING_SENDER_ID=...,VITE_FIREBASE_APP_ID=...,VITE_USE_FIREBASE_EMULATORS=false"
```

Notes:
- **Sessions use the `cookie` driver.** Cloud Run runs several instances with
  in-memory disks, so file sessions would be lost between instances. The cookie is
  encrypted with `APP_KEY`.
- **`CACHE_STORE=file` is per instance.** It only caches each user's approval
  status for up to 60 seconds. A revoked user is still signed out immediately in the
  browser, and every instance re-checks within a minute.
- **Leave `FIREBASE_CREDENTIALS` unset.** The service account above supplies the
  credentials.
- **The app refuses to start** if `APP_ENV=production` and any emulator variable is set
  (`FIREBASE_AUTH_EMULATOR_HOST`, `FIRESTORE_EMULATOR_HOST`, or
  `VITE_USE_FIREBASE_EMULATORS=true`). The container logs say why.
- After the first deploy, set `APP_URL` to the service URL (or your domain), and add that
  domain under **Firebase → Authentication → Settings → Authorized domains**.
- Deploy the rules and indexes to the same project:
  `npx firebase deploy --only firestore:rules,firestore:indexes`.
- Bootstrap the first admin from your machine against production. Temporarily set
  `FIREBASE_CREDENTIALS` to a downloaded key and unset the emulator variables, then run
  `php artisan app:make-admin you@example.com`. Delete the key afterwards.

### 3. Custom domain

The simplest option is a Cloud Run domain mapping (*Cloud Run → Manage custom
domains*), or a load balancer. Add the domain to Firebase Auth's authorized
domains and update `APP_URL`.

### 4. Optional: Firebase Hosting in front of Cloud Run

This gives you a `*.web.app` domain. Add this to `firebase.json` (with an empty
`public-hosting/` folder), then run `npx firebase deploy --only hosting`:

```json
"hosting": {
  "public": "public-hosting",
  "rewrites": [
    { "source": "**", "run": { "serviceId": "planly", "region": "asia-southeast1" } }
  ]
}
```

⚠️ **Caveat:** Firebase Hosting forwards only one cookie, named `__session`, to Cloud Run.
Laravel's `cookie` session driver needs two cookies, so sign-in won't stick behind
Hosting as configured. To use Hosting you'd need `SESSION_COOKIE=__session` **and** a
shared session store (e.g. Redis via Memorystore, or a Firestore-backed session
driver), which this project doesn't include. Use the custom-domain option above instead.

---

## Project layout

```
app/Services/                               Firebase Auth + Firestore access (users, events)
app/Http/Controllers/EventController.php    confirm / cancel (admin or proposer only)
app/Http/Middleware/EnsureApproved.php      approved session + live status re-check
app/Http/Middleware/EnsureAdmin.php         admin-only routes
app/Console/Commands/MakeAdmin.php          php artisan app:make-admin {email}
app/Support/Firebase/EmulatorAdminAuth.php  emulator-only Admin SDK plumbing
config/firebase.php                         kreait config (credentials, project_id)
resources/js/firebase.js                    Firebase JS init + emulator connection
resources/js/auth.js                        sign-in, token → session exchange, session guard
resources/js/events.js                      realtime planner store (events + members), propose write
resources/js/calendar.js                    FullCalendar (lazy-loaded), colour coding, ⭐ everyone free
resources/js/propose.js                     "Propose event" sheet + multi-date picker
resources/js/voting.js                      availability / RSVP transactions, confirm + cancel calls
resources/js/itinerary.js                   day panel: events on a date + live itinerary (add/edit/delete/reorder)
resources/js/chat.js                        group chat: live latest 50, load older, unread badge (lastReadChatAt)
resources/js/ui.js                          shared UI stores (toasts, open overlays for Escape priority)
resources/js/dates.js                       YYYY-MM-DD helpers (app timezone, no off-by-one)
firebase.json / .firebaserc                 emulator + deploy config
firestore.rules / firestore.indexes.json    security rules + composite indexes
tests/rules/                                security-rules tests (npm run test:rules)
app/Support/ProductionGuard.php             refuses to boot production with emulator settings
app/Http/Middleware/SecurityHeaders.php     nosniff, frame-deny, referrer, HSTS
resources/views/errors/                     friendly 403/404/419/429/500/503 pages
Dockerfile / docker/                        Cloud Run image (Apache + grpc) and start-up script
```
