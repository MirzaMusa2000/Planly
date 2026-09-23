#!/usr/bin/env node
// Promote an existing account to an approved admin (one-time bootstrap).
//
//   npm run make-admin -- you@example.com
//
// Runs on your machine with the Firebase Admin SDK, so it needs the
// service-account key at secrets/service-account.json (gitignored), or
// GOOGLE_APPLICATION_CREDENTIALS pointing at it. With FIRESTORE_EMULATOR_HOST
// and FIREBASE_AUTH_EMULATOR_HOST set it works against the emulators instead.
import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
    console.error('Usage: npm run make-admin -- you@example.com');
    process.exit(1);
}

const keyPath = new URL('../secrets/service-account.json', import.meta.url);
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
let options;
if (usingEmulators) {
    options = { projectId: process.env.FIREBASE_PROJECT_ID || 'demo-planly' };
} else if (fs.existsSync(keyPath)) {
    options = { credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) };
} else if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('Missing secrets/service-account.json. Download it from Firebase → Project settings → Service accounts.');
    process.exit(1);
}

initializeApp(options);

let user;
try {
    user = await getAuth().getUserByEmail(email);
} catch {
    console.error(`No account found for ${email}. Sign up on the site first, then run this again.`);
    process.exit(1);
}

const ref = getFirestore().doc(`users/${user.uid}`);
const existing = await ref.get();
await ref.set({
    email: user.email,
    role: 'admin',
    status: 'approved',
    approvedAt: FieldValue.serverTimestamp(),
    approvedBy: user.uid,
    ...(existing.exists ? {} : {
        displayName: user.displayName || email.split('@')[0],
        photoUrl: null,
        createdAt: FieldValue.serverTimestamp(),
        lastReadChatAt: null,
    }),
}, { merge: true });

console.log(`${user.email} (${user.uid}) is now an approved admin${usingEmulators ? ' (emulators)' : ''}.`);
console.log('If they are on the "Waiting for approval" page it updates by itself; otherwise sign in.');
process.exit(0);
