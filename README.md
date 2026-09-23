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
php artisan test
```

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
resources/js/dates.js                       YYYY-MM-DD helpers (app timezone, no off-by-one)
firebase.json / .firebaserc                 emulator + deploy config
firestore.rules / firestore.indexes.json    security rules + composite indexes
```
