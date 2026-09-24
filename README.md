# Planly

A private group planner for friends: propose events with candidate dates, vote on
availability, confirm and RSVP, plan a day-by-day itinerary, share a "who brings what"
checklist (Itinerary page), and chat. New members wait for admin approval.

**Runs entirely on Firebase's free Spark plan.** It's a static site (HTML + JavaScript,
built with Vite) on **Firebase Hosting**, using **Firebase Auth** and **Cloud Firestore**
directly from the browser. `firestore.rules` is the security boundary. There's no server
to run or pay for.

**Stack:** Vite · Tailwind v4 · Alpine.js · FullCalendar · Firebase JS SDK v12 ·
Firestore security rules (tested with `@firebase/rules-unit-testing`).

> The earlier Laravel version (server-rendered, needs a paid PHP host) is in the git
> history at commit `10ebeed`.

---

## How it works

| Concern | Where it lives |
|---|---|
| Sign-in / sign-up | Firebase Auth (email + password), `src/js/auth.js` |
| Who may see a page | `<body data-access="guest\|pending\|approved\|admin">`, checked by `src/js/session.js` before the page renders |
| Who may read/write data | `firestore.rules`: access comes from your `users/{uid}` doc (`status`, `role`), re-checked on **every** request |
| Approve / reject / revoke | Admin changes a member's `status` on the Members page (rules: admins only, never themselves) |
| Confirm / cancel event | Browser transaction; rules allow only the admin or the proposer, proposed → confirmed on a candidate date, or → cancelled |
| Votes & RSVPs | Vote + summary change in one transaction; rules check the summary moved by exactly that vote's change |
| Pages | `src/*.html` with layouts/partials, rendered at build time by `build/html-templates.js` |

Revoking someone takes effect immediately. The rules deny their next read or write,
and their open pages switch to "Access denied".

---

## Local development

Requirements: **Node.js 20+** and **Java 11+** (for the emulators). On Windows PowerShell,
use `npm.cmd` / `npx.cmd` if scripts are blocked.

```bash
npm install
```

### Option A: local emulators (throwaway data, no Firebase project needed)

```bash
npm run dev:all          # Auth + Firestore emulators and the site, http://localhost:5173
```
or in two terminals: `npm run emulators` and `npm run dev:emulators`.
Settings come from `.env.emulators` (committed, demo project).

Make yourself admin after signing up on the site:
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm run make-admin -- you@example.com
```

### Option B: your real Firebase project

1. `cp .env.example .env` and fill in the web app config (see **Firebase setup** below).
2. `npm run dev` → <http://localhost:5173>
3. Sign up, then make yourself admin (needs `secrets/service-account.json`):
   ```bash
   npm run make-admin -- you@example.com
   ```

### Tests

```bash
npm run test:rules       # 57 security-rules tests against a throwaway emulator
npm run build            # static site into dist/
```
`test:rules` starts its own Firestore emulator, so stop `npm run emulators` first.

---

## Firebase setup (all free, Spark plan)

1. **Create a project** at <https://console.firebase.google.com>.
2. **Add a Web app** (*Project settings → General → Your apps → `</>`*, choose npm) and copy
   `firebaseConfig` into `.env` as the `VITE_FIREBASE_*` values.
3. **Authentication → Sign-in method → Email/Password**: enable.
4. **Firestore Database → Create** (Native mode, `asia-southeast1`, production mode).
5. **Service account key** (only for `npm run make-admin`): *Project settings →
   Service accounts → Generate new private key*, save as `secrets/service-account.json`.
   It's gitignored and only ever used on your machine.
6. Log the CLI in and pick the project:
   ```bash
   npx firebase login
   npx firebase use --add
   ```

## Deploy (Firebase Hosting, free)

```bash
npm run deploy
```
This builds the site and deploys **Hosting + Firestore rules + indexes**. Your site is at
`https://<project-id>.web.app` (and `.firebaseapp.com`), both already authorized for
sign-in. Friends sign up there, and you approve them under **Members**.

Spark limits that matter: Hosting 10 GB storage / 360 MB per day transfer; Firestore
50k reads / 20k writes per day. A friends group is far below these.

---

## Project layout

```
src/index.html, login.html, pending.html,
    itinerary.html, members.html, 404.html  pages (layout directive on line 1)
src/layouts/, src/partials/                 page shells and shared markup
src/js/session.js                           sign-in state, page access, live revocation
src/js/auth.js                              sign-in / sign-up, waiting page
src/js/events.js                            realtime planner store, propose
src/js/calendar.js                          FullCalendar (lazy-loaded), colour coding, ⭐
src/js/voting.js                            votes / RSVP transactions, confirm, cancel
src/js/itinerary.js                         day panel + itinerary editing (shared)
src/js/itinerary-page.js                    Itinerary page: upcoming events, checklist
src/js/chat.js                              group chat, unread badge
src/js/members.js                           admin Members page, Home greeting
src/js/dates.js                             YYYY-MM-DD helpers (Asia/Kuala_Lumpur)
build/html-templates.js                     layouts, <include>, <x-icon>, clean URLs in dev
firestore.rules, firestore.indexes.json     security rules + composite indexes
tests/rules/                                rules tests (npm run test:rules)
scripts/make-admin.mjs                      bootstrap the first admin
scripts/generate-icons.mjs                  app icons + favicon (npm run icons)
firebase.json                               Hosting (dist/, clean URLs, headers) + emulators
```
