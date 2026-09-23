import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { as, asAdmin, asGuest, asPending, assertFails, assertSucceeds, D1, D2, newEvent, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'events/e1'), { ...newEvent('ali'), createdAt: new Date() });
        await setDoc(doc(db, 'events/c1'), { ...newEvent('ali', { status: 'confirmed', finalDate: D1 }), createdAt: new Date() });
    });
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
        await assertFails(propose(asPending(env), newEvent('pending')));
        await assertFails(propose(as(env, 'rejected'), newEvent('rejected')));
        await assertFails(propose(as(env, 'stranger'), newEvent('stranger'))); // no profile at all
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

    test('the proposer or the admin confirms onto a candidate date', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D2 }));
        await seed(env, (db) => setDoc(doc(db, 'events/e2'), { ...newEvent('mei'), createdAt: new Date() }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/e2'), { status: 'confirmed', finalDate: D1 }));
    });

    test('confirming is guarded', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { status: 'confirmed', finalDate: D1 })); // not the proposer
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: '2026-12-25' })); // not a candidate
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D1, title: 'Renamed' })); // extra change
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/c1'), { status: 'confirmed', finalDate: D2 })); // already confirmed
    });

    test('the proposer or the admin cancels', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'cancelled' }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/c1'), { status: 'cancelled' }));
    });

    test('cancelling is guarded', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { status: 'cancelled' })); // not the proposer
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'proposed' })); // not a valid transition
        await updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'cancelled' });
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D1 })); // no resurrecting
    });

    test('summaries cannot be edited on their own', async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { [`availabilitySummary.${D1}`]: 4 }));
    });

    test('only admins may delete events', async () => {
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'events/e1')));
        await assertSucceeds(deleteDoc(doc(asAdmin(env), 'events/e1')));
    });
});
