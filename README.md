# Planly

A private group planner for friends: propose events with candidate dates, vote on
availability, confirm and RSVP, plan a day-by-day itinerary (events can span several days), share a "who brings what"
checklist (Itinerary page), split costs and settle up (Expenses page), and chat. In English or Bahasa Melayu, light or dark. New members wait for admin approval.

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
npm run test:rules       # 85 security-rules tests against a throwaway emulator
npm run test:unit        # expense maths (splits, balances, settle up)
npm run test:i18n        # builds, then checks every string has a Malay translation
npm run test:push        # push worker: encryption, VAPID, who gets notified (emulator)
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

Work goes to the `staging` branch first; `main` is what's live.

| Command | Branch | Goes to |
|---|---|---|
| `npm run deploy:staging` | `staging` | the **staging preview channel**, its own URL (printed after deploy), Hosting only |
| `npm run deploy` | `main` | **production**, `https://<project-id>.web.app`, Hosting + Firestore rules + indexes |

Both build the site first and refuse to deploy from the wrong branch, with uncommitted
changes, or when the branch isn't pushed, so what's online always matches a commit on
GitHub. They use the `prod` alias in `.firebaserc`.

The staging preview shares production's users and Firestore data (and rules): only the
website is separate. Rules only change with a production deploy, so test rule changes
with `npm run test:rules` and the emulators first. A preview channel expires 30 days
after its last deploy; deploy again to bring it back.

To release: merge `staging` into `main`, push, then `npm run deploy` on `main`.
Friends sign up on the production site, and you approve them under **Members**.

Spark limits that matter: Hosting 10 GB storage / 360 MB per day transfer; Firestore
50k reads / 20k writes per day. A friends group is far below these.

---

## Data retention (3 months)

Firestore **TTL policies** (`fieldOverrides` in `firestore.indexes.json`, deployed with
`npm run deploy`) delete documents once their `expireAt` has passed; Firestore does it
by itself, typically within a day. Users and their devices are never deleted.

| Data | Deleted |
|---|---|
| Chat messages | 3 months after they're sent |
| An event and its votes, itinerary, checklist, expenses, payments | 3 months after the event's last day (its last date option while proposed) |
| Push worker locks (`pushLog/`) | 3 months after they're written |

The browser sets `expireAt` (`src/js/retention.js`); `firestore.rules` accept only the
exact value, so nobody can make data disappear early. For data created before this
existed:
```bash
npm run backfill-expiry              # dry run: what would change, what is already past 3 months
npm run backfill-expiry -- --apply   # write expireAt where it's missing
```

## Languages and dark mode

- **English / Bahasa Melayu** (`src/js/i18n.js`): the English text is the key.
  Mark text with `data-t` (element text), `data-t-attr="placeholder"` (attributes),
  `$t('…')` in Alpine expressions or `t('…')` / `N_('…')` in JS; add the Malay in
  `src/js/i18n-ms.js`. `npm run test:i18n` fails on anything missing. The choice is
  kept per device and on the profile (`users/{uid}.lang`), so push notifications
  arrive in each person's language. Switching reloads the page.
- **Dark mode** (`<html class="dark">`, chosen in the profile: system / light /
  dark): `src/css/app.css` remaps the palette (neutrals flip, tints darken, white
  surfaces become cards) instead of `dark:` variants everywhere. Always-dark areas
  carry `.on-ink`. Applied before first paint by an inline script in `head.html`.

## Push notifications (Cloudflare Workers, free)

Admins hear about new sign-ups; everyone hears about new proposals and chat
messages, even with Planly closed. Each person turns them on per device (banner,
bell in the sidebar, or the profile menu on phones). On iPhone this needs iOS 16.4+
and Planly added to the Home Screen.

Firebase's free plan has no server to send pushes, so a small **Cloudflare Worker**
(`workers/push/`, free plan, no card) does it:

1. The browser creates a proposal / message / sign-up, then calls the worker's
   `POST /notify` with its Firebase ID token.
2. The worker verifies the token, re-reads that document with the service account,
   checks the caller created it in the last 10 minutes and that it wasn't announced
   already (`pushLog/`), then sends Web Push (VAPID + aes128gcm, `webpush.js`) to
   the recipients' devices in `users/{uid}/pushSubscriptions`.

One-time setup:
```bash
node scripts/generate-vapid.mjs   # secrets/vapid.json; put the public key in .env
npx wrangler login                # opens the browser once
npm run push:secrets              # uploads the service account + VAPID private key
npm run push:deploy               # prints the worker URL -> VITE_PUSH_URL in .env
```
Then deploy the site as usual. Without `VITE_PUSH_URL`/`VITE_VAPID_PUBLIC_KEY` the
feature is hidden. `npm run push:logs` streams the worker's logs. Free plan limits:
100k requests/day and 50 devices per notification.

## Project layout

```
src/index.html, login.html, pending.html,
    itinerary.html, expenses.html,
    members.html, 404.html                  pages (layout directive on line 1)
src/layouts/, src/partials/                 page shells and shared markup
src/js/session.js                           sign-in state, page access, live revocation
src/js/auth.js                              sign-in / sign-up, waiting page
src/js/events.js                            realtime planner store, propose
src/js/calendar.js                          FullCalendar (lazy-loaded), colour coding, ⭐
src/js/voting.js                            votes / RSVP transactions, confirm, cancel
src/js/itinerary.js                         day panel + itinerary editing (shared)
src/js/itinerary-page.js                    Itinerary page: upcoming events, checklist
src/js/expenses-page.js, src/js/money.js    Expenses page; sen-exact splits and settle-up maths
src/js/chat.js                              group chat, unread badge
src/js/members.js                           admin Members page, Home greeting
src/js/dates.js                             YYYY-MM-DD helpers (Asia/Kuala_Lumpur)
build/html-templates.js                     layouts, <include>, <x-icon>, clean URLs in dev
firestore.rules, firestore.indexes.json     security rules + composite indexes
tests/rules/                                rules tests (npm run test:rules)
scripts/make-admin.mjs                      bootstrap the first admin
scripts/backfill-expiry.mjs                 give older data an expireAt (3-month retention)
scripts/generate-icons.mjs                  app icons + favicon (npm run icons)
src/js/i18n.js, src/js/i18n-ms.js        English / Malay (scripts/i18n-check.mjs)
src/js/people.js, src/js/profile.js         names + profile photos (small data URLs; Storage needs Blaze)
src/js/push.js, src/public/sw.js            notifications: device opt-in, service worker
workers/push/                               push worker (Cloudflare), tests in tests/push/
firebase.json                               Hosting (dist/, clean URLs, headers) + emulators
```
