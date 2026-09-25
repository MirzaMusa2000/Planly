#!/usr/bin/env node
// Give existing data an expireAt, so Firestore TTL cleans it up like new data
// (js/retention.js): an event and everything under it 90 days after its last
// day, chat messages 90 days after they were sent. Users are never touched.
//
//   npm run backfill-expiry              dry run: counts only, writes nothing
//   npm run backfill-expiry -- --apply   write expireAt where it's missing
//
// Anything whose expiry is already in the past is deleted by Firestore within
// about a day of --apply (and of the TTL policies being deployed).
// Uses secrets/service-account.json, or the emulators when
// FIRESTORE_EMULATOR_HOST is set.
import fs from 'node:fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const apply = process.argv.includes('--apply');

const keyPath = new URL('../secrets/service-account.json', import.meta.url);
const usingEmulators = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (usingEmulators) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'demo-planly' });
} else if (fs.existsSync(keyPath)) {
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
} else {
    console.error('Missing secrets/service-account.json (or set FIRESTORE_EMULATOR_HOST).');
    process.exit(1);
}
const db = getFirestore();

const afterDay = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Timestamp.fromMillis(Date.UTC(y, m - 1, d) + RETENTION_DAYS * DAY_MS);
};
const afterTime = (date) => Timestamp.fromMillis(date.getTime() + RETENTION_DAYS * DAY_MS);

/** The event's last day: its confirmed last day, else its latest date option. */
function lastDay(event) {
    if (event.status === 'confirmed' && event.finalDate) return event.finalEndDate || event.finalDate;
    const ends = (event.candidateDates ?? []).map((d) => event.candidateEnds?.[d] ?? d);
    return ends.sort().at(-1) ?? null;
}

const stats = { updated: 0, alreadySet: 0, expiredNow: 0, skipped: 0 };
const now = Timestamp.now();
let batch = db.batch();
let pending = 0;

async function set(ref, expireAt) {
    if (expireAt.toMillis() <= now.toMillis()) stats.expiredNow++;
    stats.updated++;
    if (!apply) return;
    batch.update(ref, { expireAt });
    if (++pending === 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
    }
}

// Events and what's stored under them
const SUBCOLLECTIONS = ['votes', 'itinerary', 'checklist', 'expenses', 'settlements'];
for (const eventDoc of (await db.collection('events').get()).docs) {
    const event = eventDoc.data();
    let expireAt = event.expireAt;
    if (!expireAt) {
        const day = lastDay(event);
        if (!day) {
            stats.skipped++;
            continue;
        }
        expireAt = afterDay(day);
        await set(eventDoc.ref, expireAt);
    } else {
        stats.alreadySet++;
    }
    for (const name of SUBCOLLECTIONS) {
        for (const child of (await eventDoc.ref.collection(name).get()).docs) {
            if (child.data().expireAt) stats.alreadySet++;
            else await set(child.ref, expireAt);
        }
    }
}

// Chat messages
for (const message of (await db.collection('chats/main/messages').get()).docs) {
    const data = message.data();
    if (data.expireAt) stats.alreadySet++;
    else await set(message.ref, afterTime(data.createdAt?.toDate?.() ?? new Date()));
}

// The push worker's "sent once" locks
for (const lock of (await db.collection('pushLog').get()).docs) {
    const data = lock.data();
    if (data.expireAt) stats.alreadySet++;
    else await set(lock.ref, afterTime(data.at ? new Date(data.at) : new Date()));
}

if (apply && pending) await batch.commit();

console.log(`${apply ? 'Updated' : 'Would update'} ${stats.updated} documents${usingEmulators ? ' (emulators)' : ''}.`);
console.log(`  ${stats.expiredNow} of them are already past 3 months and will be deleted by Firestore within about a day.`);
console.log(`  ${stats.alreadySet} already had an expiry; ${stats.skipped} events had no dates and were left alone.`);
if (!apply) console.log('Dry run: nothing was written. Run again with --apply to write.');
