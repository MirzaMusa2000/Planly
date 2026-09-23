import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { as, asAdmin, asGuest, asPending, assertFails, assertSucceeds, D1, newEvent, seed, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, (db) => setDoc(doc(db, 'events/e1'), { ...newEvent('ali'), createdAt: new Date() }));
});

const propose = (db, data) => addDoc(collection(db, 'events'), { ...data, createdAt: serverTimestamp() });

describe('events/{eventId}', () => {
    test('approved members can read events; pending users and guests cannot', async () => {
        await assertSucceeds(getDoc(doc(as(env, 'mei'), 'events/e1')));
        await assertFails(getDoc(doc(asPending(env), 'events/e1')));
        await assertFails(getDoc(doc(asGuest(env), 'events/e1')));
    });

    test('an approved member can propose an event', async () => {
        await assertSucceeds(propose(as(env, 'mei'), newEvent('mei')));
    });

    test('pending users cannot propose', async () => {
        await assertFails(propose(asPending(env, 'p'), newEvent('p')));
    });

    test('proposals must be honest and start empty', async () => {
        const db = as(env, 'mei');
        await assertFails(propose(db, newEvent('ali'))); // proposedBy someone else
        await assertFails(propose(db, newEvent('mei', { status: 'confirmed', finalDate: D1 }))); // already confirmed
        await assertFails(propose(db, newEvent('mei', { availabilitySummary: { [D1]: 9 } }))); // pre-filled votes
        await assertFails(propose(db, newEvent('mei', { rsvpSummary: { join: 5, notAvailable: 0 } }))); // pre-filled RSVPs
        await assertFails(propose(db, newEvent('mei', { candidateDates: [] }))); // no dates
        await assertFails(propose(db, newEvent('mei', { candidateDates: Array.from({ length: 32 }, (_, i) => `2026-11-${String(i % 28 + 1).padStart(2, '0')}`) }))); // 32 dates
        await assertFails(propose(db, newEvent('mei', { title: '' }))); // empty title
        await assertFails(propose(db, newEvent('mei', { title: 'x'.repeat(121) }))); // title too long
        await assertFails(propose(db, newEvent('mei', { secret: true }))); // unknown field
    });

    test('status and finalDate are server-only', async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D1 }));
        await assertFails(updateDoc(doc(asAdmin(env), 'events/e1'), { status: 'cancelled' }));
    });

    test('summaries cannot be edited on their own', async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { [`availabilitySummary.${D1}`]: 4 }));
    });

    test('only admins may delete events', async () => {
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'events/e1')));
        await assertSucceeds(deleteDoc(doc(asAdmin(env), 'events/e1')));
    });
});
