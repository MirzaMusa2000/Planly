import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { as, asPending, assertFails, assertSucceeds, D1, newEvent, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'events/c'), { ...newEvent('ali', { status: 'confirmed', finalDate: D1 }), createdAt: new Date() });
        await setDoc(doc(db, 'events/p'), { ...newEvent('ali'), createdAt: new Date() });
        await setDoc(doc(db, 'events/x'), { ...newEvent('ali', { status: 'cancelled' }), createdAt: new Date() });
        await setDoc(doc(db, 'events/c/checklist/k1'), entry('ali'));
    });
});

function entry(createdBy, overrides = {}) {
    return { item: 'Arang', quantity: '3 plastik', picUid: 'mei', done: false, notes: '', order: 0, createdBy, ...overrides };
}
const add = (db, eventId, data) => addDoc(collection(db, 'events', eventId, 'checklist'), data);

describe('events/{id}/checklist', () => {
    test('any approved member can read, add, tick off, edit and delete', async () => {
        const mei = as(env, 'mei');
        await assertSucceeds(getDocs(collection(mei, 'events/c/checklist')));
        await assertSucceeds(add(mei, 'c', entry('mei', { item: 'Ayam', quantity: '2', picUid: null, order: 1 })));
        await assertSucceeds(add(mei, 'c', { item: 'Tisu', done: false, order: 2, createdBy: 'mei' })); // optional fields left out
        await assertSucceeds(updateDoc(doc(mei, 'events/c/checklist/k1'), { done: true }));
        await assertSucceeds(updateDoc(doc(mei, 'events/c/checklist/k1'), { picUid: 'boss', quantity: '4', notes: 'Beli kat Tesco' }));
        await assertSucceeds(updateDoc(doc(mei, 'events/c/checklist/k1'), { picUid: null }));
        await assertSucceeds(deleteDoc(doc(mei, 'events/c/checklist/k1')));
    });

    test('pending users have no access', async () => {
        await assertFails(getDocs(collection(asPending(env), 'events/c/checklist')));
        await assertFails(add(asPending(env), 'c', entry('pending')));
        await assertFails(updateDoc(doc(asPending(env), 'events/c/checklist/k1'), { done: true }));
    });

    test('only confirmed events have a checklist', async () => {
        const mei = as(env, 'mei');
        await assertFails(add(mei, 'p', entry('mei')));
        await assertFails(add(mei, 'x', entry('mei')));
    });

    test('the PIC must be an approved member', async () => {
        const mei = as(env, 'mei');
        await assertFails(add(mei, 'c', entry('mei', { picUid: 'pending' })));
        await assertFails(add(mei, 'c', entry('mei', { picUid: 'stranger' }))); // no such user
        await assertFails(updateDoc(doc(mei, 'events/c/checklist/k1'), { picUid: 'rejected' }));
        await assertFails(add(mei, 'c', entry('mei', { picUid: 42 })));
    });

    test('ticking off still works after the PIC leaves', async () => {
        await seed(env, (db) => updateDoc(doc(db, 'users/mei'), { status: 'rejected' }));
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'events/c/checklist/k1'), { done: true }));
    });

    test('createdBy is honest and immutable', async () => {
        await assertFails(add(as(env, 'mei'), 'c', entry('ali')));
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/c/checklist/k1'), { createdBy: 'mei' }));
    });

    test('field validation', async () => {
        const mei = as(env, 'mei');
        await assertFails(add(mei, 'c', entry('mei', { item: '' })));
        await assertFails(add(mei, 'c', entry('mei', { item: 'x'.repeat(121) })));
        await assertFails(add(mei, 'c', entry('mei', { quantity: 2 }))); // quantity is text ("3 plastik")
        await assertFails(add(mei, 'c', entry('mei', { done: 'yes' })));
        await assertFails(add(mei, 'c', entry('mei', { notes: 'x'.repeat(501) })));
        await assertFails(add(mei, 'c', entry('mei', { price: 20 })));
    });
});
