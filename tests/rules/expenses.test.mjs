import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { as, asAdmin, asPending, assertFails, assertSucceeds, D1, newEvent, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'events/c'), { ...newEvent('ali', { status: 'confirmed', finalDate: D1 }), createdAt: new Date() });
        await setDoc(doc(db, 'events/p'), { ...newEvent('ali'), createdAt: new Date() });
        await setDoc(doc(db, 'events/c/expenses/x1'), { ...expense('ali'), createdAt: new Date() });
        await setDoc(doc(db, 'events/c/settlements/s1'), { from: 'mei', to: 'ali', amountCents: 5000, createdBy: 'mei', createdAt: new Date() });
    });
});

function expense(createdBy, overrides = {}) {
    return {
        item: 'Sewa glamping',
        amountCents: 27000,
        paidBy: createdBy,
        splitWith: ['ali', 'mei', 'boss'],
        notes: '',
        createdBy,
        createdAt: serverTimestamp(),
        ...overrides,
    };
}
const addExpense = (db, eventId, data) => addDoc(collection(db, 'events', eventId, 'expenses'), data);
const pay = (db, data) => addDoc(collection(db, 'events/c/settlements'), { createdAt: serverTimestamp(), ...data });

describe('events/{id}/expenses', () => {
    test('approved members can read and add expenses (paid by anyone approved)', async () => {
        const mei = as(env, 'mei');
        await assertSucceeds(getDocs(collection(mei, 'events/c/expenses')));
        await assertSucceeds(addExpense(mei, 'c', expense('mei')));
        await assertSucceeds(addExpense(mei, 'c', expense('mei', { paidBy: 'boss', notes: 'Boss bayar dulu' })));
        await assertSucceeds(addExpense(mei, 'c', { item: 'Ice', amountCents: 800, paidBy: 'mei', splitWith: ['mei'], createdBy: 'mei', createdAt: serverTimestamp() }));
    });

    test('pending users have no access', async () => {
        await assertFails(getDocs(collection(asPending(env), 'events/c/expenses')));
        await assertFails(addExpense(asPending(env), 'c', expense('pending')));
    });

    test('only on confirmed events', async () => {
        await assertFails(addExpense(as(env, 'mei'), 'p', expense('mei')));
    });

    test('field validation', async () => {
        const mei = as(env, 'mei');
        await assertFails(addExpense(mei, 'c', expense('mei', { amountCents: 0 })));
        await assertFails(addExpense(mei, 'c', expense('mei', { amountCents: -500 })));
        await assertFails(addExpense(mei, 'c', expense('mei', { amountCents: 12.5 }))); // whole sen only
        await assertFails(addExpense(mei, 'c', expense('mei', { amountCents: '270' })));
        await assertFails(addExpense(mei, 'c', expense('mei', { item: '' })));
        await assertFails(addExpense(mei, 'c', expense('mei', { splitWith: [] })));
        await assertFails(addExpense(mei, 'c', expense('mei', { paidBy: 'pending' }))); // payer not approved
        await assertFails(addExpense(mei, 'c', expense('mei', { paidBy: 'stranger' })));
        await assertFails(addExpense(mei, 'c', expense('ali'))); // createdBy someone else
        await assertFails(addExpense(mei, 'c', expense('mei', { createdAt: new Date(2020, 0, 1) })));
        await assertFails(addExpense(mei, 'c', expense('mei', { receipt: 'x' })));
    });

    test('the creator, the payer or the admin can edit or remove it; others cannot', async () => {
        await seed(env, (db) => setDoc(doc(db, 'events/c/expenses/x2'), { ...expense('mei', { paidBy: 'boss' }), createdAt: new Date() }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/c/expenses/x2'), { amountCents: 100 }));
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'events/c/expenses/x2')));
        await assertSucceeds(updateDoc(doc(as(env, 'mei'), 'events/c/expenses/x2'), { amountCents: 30000 })); // creator
        await assertSucceeds(updateDoc(doc(as(env, 'boss'), 'events/c/expenses/x2'), { splitWith: ['boss', 'mei'] })); // payer
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'events/c/expenses/x2'), { item: 'Fixed' }));
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/c/expenses/x2'), { paidBy: 'rejected' }));
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/c/expenses/x2'), { createdBy: 'boss' }));
        await assertSucceeds(deleteDoc(doc(as(env, 'boss'), 'events/c/expenses/x2')));
    });
});

describe('events/{id}/settlements', () => {
    test('the payer or the receiver records a payment', async () => {
        await assertSucceeds(pay(as(env, 'boss'), { from: 'boss', to: 'ali', amountCents: 9000, createdBy: 'boss' }));
        await assertSucceeds(pay(as(env, 'ali'), { from: 'mei', to: 'ali', amountCents: 1000, createdBy: 'ali' }));
        await assertSucceeds(pay(asAdmin(env), { from: 'mei', to: 'boss', amountCents: 1000, createdBy: 'admin' })); // the admin, for others
    });

    test('other members cannot record payments between other people', async () => {
        await assertFails(pay(as(env, 'boss'), { from: 'mei', to: 'ali', amountCents: 1000, createdBy: 'boss' }));
    });

    test('payments are validated', async () => {
        const boss = as(env, 'boss');
        await assertFails(pay(boss, { from: 'boss', to: 'boss', amountCents: 1000, createdBy: 'boss' }));
        await assertFails(pay(boss, { from: 'boss', to: 'ali', amountCents: 0, createdBy: 'boss' }));
        await assertFails(pay(boss, { from: 'boss', to: 'ali', amountCents: 10.5, createdBy: 'boss' }));
        await assertFails(pay(boss, { from: 'boss', to: 'pending', amountCents: 1000, createdBy: 'boss' }));
        await assertFails(pay(boss, { from: 'boss', to: 'ali', amountCents: 1000, createdBy: 'ali' }));
        await assertFails(pay(boss, { from: 'boss', to: 'ali', amountCents: 1000, createdBy: 'boss', note: 'x' }));
        await assertFails(addDoc(collection(boss, 'events/p/settlements'), { from: 'boss', to: 'ali', amountCents: 1000, createdBy: 'boss', createdAt: serverTimestamp() }));
    });

    test('never edited; undone by whoever recorded it or the admin', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/c/settlements/s1'), { amountCents: 1 }));
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'events/c/settlements/s1'))); // the receiver, but not the recorder
        await assertSucceeds(deleteDoc(doc(as(env, 'mei'), 'events/c/settlements/s1')));
        await seed(env, (db) => setDoc(doc(db, 'events/c/settlements/s2'), { from: 'mei', to: 'ali', amountCents: 5000, createdBy: 'mei', createdAt: new Date() }));
        await assertSucceeds(deleteDoc(doc(asAdmin(env), 'events/c/settlements/s2')));
    });
});
