import { after, before, beforeEach, describe, test } from 'node:test';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc } from 'firebase/firestore';
import { as, asGuest, asPending, assertFails, assertSucceeds, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, (db) => setDoc(doc(db, 'users/ali/pushSubscriptions/d1'), { ...device('ali'), createdAt: new Date() }));
});

function device(uid, overrides = {}) {
    return {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
        p256dh: `B${'x'.repeat(86)}`,
        auth: 'y'.repeat(22),
        uid,
        userAgent: 'Chrome on Android',
        createdAt: serverTimestamp(),
        ...overrides,
    };
}
const ref = (db, uid, id = 'd2') => doc(db, `users/${uid}/pushSubscriptions/${id}`);

describe('users/{uid}/pushSubscriptions', () => {
    test('you can add, replace, read and remove your own devices', async () => {
        const ali = as(env, 'ali');
        await assertSucceeds(setDoc(ref(ali, 'ali'), device('ali')));
        await assertSucceeds(setDoc(ref(ali, 'ali'), device('ali', { endpoint: 'https://web.push.apple.com/QAbc' })));
        await assertSucceeds(getDocs(collection(ali, 'users/ali/pushSubscriptions')));
        await assertSucceeds(deleteDoc(ref(ali, 'ali', 'd1')));
    });

    test("nobody else can see or change them (not even the admin)", async () => {
        for (const who of ['mei', 'admin']) {
            const db = as(env, who);
            await assertFails(getDoc(ref(db, 'ali', 'd1')));
            await assertFails(getDocs(collection(db, 'users/ali/pushSubscriptions')));
            await assertFails(setDoc(ref(db, 'ali'), device('ali')));
            await assertFails(deleteDoc(ref(db, 'ali', 'd1')));
        }
        await assertFails(getDoc(ref(asGuest(env), 'ali', 'd1')));
    });

    test('only approved members can turn notifications on', async () => {
        await assertFails(setDoc(ref(asPending(env), 'pending'), device('pending')));
        await assertFails(setDoc(ref(as(env, 'rejected'), 'rejected'), device('rejected')));
    });

    test('a revoked member can still remove their devices', async () => {
        await seed(env, (db) => setDoc(doc(db, 'users/rejected/pushSubscriptions/d1'), { ...device('rejected'), createdAt: new Date() }));
        await assertSucceeds(deleteDoc(ref(as(env, 'rejected'), 'rejected', 'd1')));
    });

    test('field validation', async () => {
        const ali = as(env, 'ali');
        await assertFails(setDoc(ref(ali, 'ali'), device('mei'))); // uid must match the path
        await assertFails(setDoc(ref(ali, 'ali'), device('ali', { endpoint: 'http://insecure.example/push' })));
        await assertFails(setDoc(ref(ali, 'ali'), device('ali', { p256dh: 'short' })));
        await assertFails(setDoc(ref(ali, 'ali'), device('ali', { auth: '' })));
        await assertFails(setDoc(ref(ali, 'ali'), device('ali', { createdAt: new Date(2020, 0, 1) })));
        await assertFails(setDoc(ref(ali, 'ali'), device('ali', { extra: 1 })));
    });
});

describe('pushLog (worker only)', () => {
    test('browsers cannot read or write it', async () => {
        await seed(env, (db) => setDoc(doc(db, 'pushLog/chat-m1'), { type: 'chat' }));
        await assertFails(getDoc(doc(as(env, 'admin'), 'pushLog/chat-m1')));
        await assertFails(setDoc(doc(as(env, 'ali'), 'pushLog/chat-m2'), { type: 'chat' }));
        await assertFails(deleteDoc(doc(as(env, 'admin'), 'pushLog/chat-m1')));
    });
});
