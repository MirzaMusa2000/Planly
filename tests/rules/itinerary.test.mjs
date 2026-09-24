import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { as, asPending, assertFails, assertSucceeds, D1, D2, newEvent, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'events/c'), { ...newEvent('ali', { status: 'confirmed', finalDate: D1 }), createdAt: new Date() });
        await setDoc(doc(db, 'events/p'), { ...newEvent('ali'), createdAt: new Date() });
        await setDoc(doc(db, 'events/c/itinerary/i1'), item('ali'));
    });
});

function item(createdBy, overrides = {}) {
    return { date: D1, startTime: '09:00', endTime: '10:30', activity: 'Breakfast', location: 'Hotel', notes: '', order: 0, createdBy, ...overrides };
}
const add = (db, eventId, data) => addDoc(collection(db, 'events', eventId, 'itinerary'), data);

describe('events/{id}/itinerary', () => {
    test('any approved member can read, add, edit and delete', async () => {
        const mei = as(env, 'mei');
        await assertSucceeds(getDocs(collection(mei, 'events/c/itinerary')));
        await assertSucceeds(add(mei, 'c', item('mei', { startTime: '12:00', endTime: null, activity: 'Lunch' })));
        await assertSucceeds(updateDoc(doc(mei, 'events/c/itinerary/i1'), { activity: 'Big breakfast', order: 3 }));
        await assertSucceeds(deleteDoc(doc(mei, 'events/c/itinerary/i1')));
    });

    test('pending users have no access', async () => {
        await assertFails(getDocs(collection(asPending(env), 'events/c/itinerary')));
        await assertFails(add(asPending(env), 'c', item('pending')));
    });

    test('items belong on the confirmed date of a confirmed event', async () => {
        const mei = as(env, 'mei');
        await assertFails(add(mei, 'c', item('mei', { date: D2 }))); // not the finalDate
        await assertFails(add(mei, 'p', item('mei'))); // event only proposed
        await assertFails(updateDoc(doc(mei, 'events/c/itinerary/i1'), { date: D2 })); // moved to another day
    });

    test('multi-day events take items on each of their days', async () => {
        await seed(env, (db) => setDoc(doc(db, 'events/trip'), {
            ...newEvent('ali', { status: 'confirmed', finalDate: '2026-11-06', finalEndDate: '2026-11-08', candidateEnds: { '2026-11-06': '2026-11-08' } }),
            createdAt: new Date(),
        }));
        const mei = as(env, 'mei');
        for (const date of ['2026-11-06', '2026-11-07', '2026-11-08']) await assertSucceeds(add(mei, 'trip', item('mei', { date })));
        await assertFails(add(mei, 'trip', item('mei', { date: '2026-11-05' })));
        await assertFails(add(mei, 'trip', item('mei', { date: '2026-11-09' })));
    });

    test('createdBy is honest and immutable', async () => {
        await assertFails(add(as(env, 'mei'), 'c', item('ali')));
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/c/itinerary/i1'), { createdBy: 'mei' }));
    });

    test('field validation', async () => {
        const mei = as(env, 'mei');
        await assertFails(add(mei, 'c', item('mei', { startTime: '15:00', endTime: '14:00' }))); // ends before it starts
        await assertFails(add(mei, 'c', item('mei', { startTime: '9am' })));
        await assertFails(add(mei, 'c', item('mei', { startTime: '24:00' })));
        await assertFails(add(mei, 'c', item('mei', { activity: '' })));
        await assertFails(add(mei, 'c', item('mei', { notes: 'x'.repeat(1001) })));
        await assertFails(add(mei, 'c', item('mei', { price: 20 })));
    });
});
