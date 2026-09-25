// expireAt (deleted by the daily cleanup once passed): optional, but never earlier than the retention
// period allows, so nobody can make data disappear early.
import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, doc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { as, assertFails, assertSucceeds, D1, D2, newEvent, seed, seedMembers, setupEnv } from './helpers.mjs';

const DAY = 24 * 60 * 60 * 1000;
const after90 = (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return Timestamp.fromMillis(Date.UTC(y, m - 1, d) + 90 * DAY);
};
const EVENT_EXPIRY = after90(D1);

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'events/c'), { ...newEvent('ali', { status: 'confirmed', finalDate: D1, finalEndDate: D1 }), expireAt: EVENT_EXPIRY, createdAt: new Date() });
        await setDoc(doc(db, 'events/p'), { ...newEvent('ali'), expireAt: after90(D2), createdAt: new Date() });
    });
});

const propose = (db, data) => addDoc(collection(db, 'events'), { ...data, createdAt: serverTimestamp() });

describe('retention (expireAt)', () => {
    test('a new event expires 90 days after the last day of its last option', async () => {
        const mei = as(env, 'mei');
        await assertSucceeds(propose(mei, { ...newEvent('mei'), expireAt: after90(D2) }));
        await assertSucceeds(propose(mei, newEvent('mei'))); // older pages send none
        await assertFails(propose(mei, { ...newEvent('mei'), expireAt: after90(D1) })); // before the last option
        await assertFails(propose(mei, { ...newEvent('mei'), expireAt: Timestamp.now() }));
        const trip = newEvent('mei', { candidateDates: ['2026-11-06', '2026-11-13'], candidateEnds: { '2026-11-13': '2026-11-15' } });
        await assertSucceeds(propose(mei, { ...trip, expireAt: after90('2026-11-15') }));
        await assertFails(propose(mei, { ...trip, expireAt: after90('2026-11-13') }));
    });

    test('confirming moves it to 90 days after the chosen last day', async () => {
        const ali = as(env, 'ali');
        await assertFails(updateDoc(doc(ali, 'events/p'), { status: 'confirmed', finalDate: D1, finalEndDate: D1, expireAt: Timestamp.now() }));
        await assertSucceeds(updateDoc(doc(ali, 'events/p'), { status: 'confirmed', finalDate: D1, finalEndDate: D1, expireAt: after90(D1) }));
    });

    test('nobody can change an event’s expiry afterwards', async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'events/c'), { expireAt: Timestamp.now() }));
        await assertFails(updateDoc(doc(as(env, 'admin'), 'events/c'), { status: 'cancelled', expireAt: Timestamp.now() }));
    });

    test('votes, itinerary, checklist, expenses and payments expire with their event', async () => {
        const mei = as(env, 'mei');
        const wrong = Timestamp.fromMillis(Date.now() + DAY);
        const item = { date: D1, startTime: '09:00', activity: 'Breakfast', order: 0, createdBy: 'mei' };
        await assertSucceeds(addDoc(collection(mei, 'events/c/itinerary'), { ...item, expireAt: EVENT_EXPIRY }));
        await assertSucceeds(addDoc(collection(mei, 'events/c/itinerary'), item)); // none: fine
        await assertFails(addDoc(collection(mei, 'events/c/itinerary'), { ...item, expireAt: wrong }));

        const entry = { item: 'Arang', done: false, order: 0, createdBy: 'mei' };
        await assertSucceeds(addDoc(collection(mei, 'events/c/checklist'), { ...entry, expireAt: EVENT_EXPIRY }));
        await assertFails(addDoc(collection(mei, 'events/c/checklist'), { ...entry, expireAt: wrong }));

        const expense = { item: 'Glamping', amountCents: 27000, paidBy: 'mei', splitWith: ['mei', 'ali'], createdBy: 'mei', createdAt: serverTimestamp() };
        await assertSucceeds(addDoc(collection(mei, 'events/c/expenses'), { ...expense, expireAt: EVENT_EXPIRY }));
        await assertFails(addDoc(collection(mei, 'events/c/expenses'), { ...expense, expireAt: wrong }));

        const payment = { from: 'mei', to: 'ali', amountCents: 100, createdBy: 'mei', createdAt: serverTimestamp() };
        await assertSucceeds(addDoc(collection(mei, 'events/c/settlements'), { ...payment, expireAt: EVENT_EXPIRY }));
        await assertFails(addDoc(collection(mei, 'events/c/settlements'), { ...payment, expireAt: wrong }));
    });

    test('an item’s expiry can’t be changed later', async () => {
        await seed(env, (db) => setDoc(doc(db, 'events/c/checklist/k1'), { item: 'Arang', done: false, order: 0, createdBy: 'mei', expireAt: EVENT_EXPIRY }));
        await assertSucceeds(updateDoc(doc(as(env, 'mei'), 'events/c/checklist/k1'), { done: true }));
        await assertFails(updateDoc(doc(as(env, 'mei'), 'events/c/checklist/k1'), { expireAt: Timestamp.now() }));
    });

    test('chat messages expire about 90 days after they are sent', async () => {
        const mei = as(env, 'mei');
        const message = (extra = {}) => ({ senderId: 'mei', senderName: 'Mei Lin', text: 'Hai', createdAt: serverTimestamp(), ...extra });
        const add = (data) => addDoc(collection(mei, 'chats/main/messages'), data);
        await assertSucceeds(add(message({ expireAt: Timestamp.fromMillis(Date.now() + 90 * DAY) })));
        await assertSucceeds(add(message())); // older pages send none
        await assertFails(add(message({ expireAt: Timestamp.fromMillis(Date.now() + 10 * DAY) })));
        await assertFails(add(message({ expireAt: Timestamp.fromMillis(Date.now() + 400 * DAY) })));
    });
});
