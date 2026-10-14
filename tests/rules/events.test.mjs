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
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D2, finalEndDate: D2 }));
        await seed(env, (db) => setDoc(doc(db, 'events/e2'), { ...newEvent('mei'), createdAt: new Date() }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/e2'), { status: 'confirmed', finalDate: D1, finalEndDate: D1 }));
    });

    test('confirming is guarded', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { status: 'confirmed', finalDate: D1, finalEndDate: D1 })); // not the proposer
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: '2026-12-25', finalEndDate: '2026-12-25' })); // not a candidate
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D1, finalEndDate: D1, title: 'Renamed' })); // extra change
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/c1'), { status: 'confirmed', finalDate: D2, finalEndDate: D2 })); // already confirmed
    });

    test('multi-day options: proposed with candidateEnds, confirmed with the matching end', async () => {
        const trip = newEvent('mei', { candidateDates: ['2026-11-06', '2026-11-13'], candidateEnds: { '2026-11-06': '2026-11-08' } });
        await assertSucceeds(propose(as(env, 'mei'), trip));
        await assertFails(propose(as(env, 'mei'), { ...trip, candidateEnds: { '2026-11-07': '2026-11-08' } })); // not an option's first day
        await assertFails(propose(as(env, 'mei'), { ...trip, candidateEnds: ['2026-11-08'] })); // not a map
        await assertFails(propose(as(env, 'mei'), { ...trip, finalEndDate: '2026-11-08' })); // not confirmed yet

        await seed(env, (db) => setDoc(doc(db, 'events/t1'), { ...trip, createdAt: new Date() }));
        const mei = as(env, 'mei');
        await assertFails(updateDoc(doc(mei, 'events/t1'), { status: 'confirmed', finalDate: '2026-11-06' })); // end missing
        await assertFails(updateDoc(doc(mei, 'events/t1'), { status: 'confirmed', finalDate: '2026-11-06', finalEndDate: '2026-11-06' })); // wrong end
        await assertFails(updateDoc(doc(mei, 'events/t1'), { status: 'confirmed', finalDate: '2026-11-06', finalEndDate: '2026-11-20' })); // stretched
        await assertSucceeds(updateDoc(doc(mei, 'events/t1'), { status: 'confirmed', finalDate: '2026-11-06', finalEndDate: '2026-11-08' }));

        await seed(env, (db) => setDoc(doc(db, 'events/t2'), { ...trip, createdAt: new Date() }));
        await assertFails(updateDoc(doc(mei, 'events/t2'), { status: 'confirmed', finalDate: '2026-11-13', finalEndDate: '2026-11-15' })); // one-day option
        await assertSucceeds(updateDoc(doc(mei, 'events/t2'), { status: 'confirmed', finalDate: '2026-11-13', finalEndDate: '2026-11-13' }));
    });

    test('older pages may still confirm a one-day option without finalEndDate', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D1 }));
    });

    test('the proposer or the admin can change the location, while proposed or confirmed', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { location: 'Port Dickson' }));
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/c1'), { location: 'Lexis Hibiscus, Port Dickson' }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/e1'), { location: 'Bangsar' }));
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { location: '' })); // cleared
    });

    test('changing the location is guarded', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { location: 'Somewhere' })); // not the proposer
        await assertFails(updateDoc(doc(asPending(env), 'events/e1'), { location: 'Somewhere' }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { location: 'x'.repeat(201) })); // too long
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { location: 42 })); // not text
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { location: 'PD', title: 'Renamed' })); // more than the location
        await seed(env, (db) => setDoc(doc(db, 'events/x1'), { ...newEvent('ali', { status: 'cancelled' }), createdAt: new Date() }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/x1'), { location: 'PD' })); // cancelled
    });

    test('the proposer or the admin can change the description', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { description: 'Bawa tikar.\nRM20 seorang.' }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/c1'), { description: 'Nota admin' }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/c1'), { description: '' })); // cleared
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { description: 'Not mine' })); // not the proposer
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { description: 'x'.repeat(2001) })); // too long
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { description: 'ok', title: 'Renamed' })); // more than allowed
    });

    test('an event can have a kind, from the list only', async () => {
        await assertSucceeds(propose(as(env, 'mei'), newEvent('mei', { kind: 'beach' })));
        await assertFails(propose(as(env, 'mei'), newEvent('mei', { kind: 'rocket' })));
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { kind: 'food' }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/c1'), { kind: 'trip', location: 'KLIA' })); // both at once
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { kind: 'rocket' }));
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { kind: 'party' })); // not the proposer
    });

    test('the proposer or the admin cancels', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'cancelled' }));
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/c1'), { status: 'cancelled' }));
    });

    test('cancelling is guarded', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/e1'), { status: 'cancelled' })); // not the proposer
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'proposed' })); // not a valid transition
        await updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'cancelled' });
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { status: 'confirmed', finalDate: D1, finalEndDate: D1 })); // no resurrecting
    });

    test('summaries cannot be edited on their own', async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/e1'), { [`availabilitySummary.${D1}`]: 4 }));
    });

    test('only admins may delete events', async () => {
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'events/e1')));
        await assertSucceeds(deleteDoc(doc(asAdmin(env), 'events/e1')));
    });
});
