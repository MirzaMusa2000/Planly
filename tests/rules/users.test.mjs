import { after, before, beforeEach, describe, test } from 'node:test';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { as, asGuest, asPending, assertFails, assertSucceeds, seed, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
        await setDoc(doc(db, 'users/ali'), { email: 'ali@x', displayName: 'Ali', role: 'member', status: 'approved', lastReadChatAt: null });
        await setDoc(doc(db, 'users/newbie'), { email: 'n@x', displayName: 'Newbie', role: 'member', status: 'pending', lastReadChatAt: null });
    });
});

describe('users/{uid}', () => {
    test('approved members can read any profile', async () => {
        await assertSucceeds(getDoc(doc(as(env, 'ali'), 'users/newbie')));
    });

    test('pending users can read only their own profile', async () => {
        await assertSucceeds(getDoc(doc(asPending(env, 'newbie'), 'users/newbie')));
        await assertFails(getDoc(doc(asPending(env, 'newbie'), 'users/ali')));
    });

    test('guests can read nothing', async () => {
        await assertFails(getDoc(doc(asGuest(env), 'users/ali')));
    });

    test('nobody creates or deletes profiles from the browser', async () => {
        await assertFails(setDoc(doc(as(env, 'x'), 'users/x'), { email: 'x@x', displayName: 'X', role: 'member', status: 'approved' }));
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'users/ali')));
    });

    test('a user cannot approve or promote themselves', async () => {
        await assertFails(updateDoc(doc(asPending(env, 'newbie'), 'users/newbie'), { status: 'approved' }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/ali'), { role: 'admin' }));
    });

    test('read receipt must be the server time', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'users/ali'), { lastReadChatAt: serverTimestamp() }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/ali'), { lastReadChatAt: Timestamp.fromDate(new Date('2099-01-01')) }));
    });

    test("you can't touch someone else's profile", async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/newbie'), { lastReadChatAt: serverTimestamp() }));
    });

    test('display name: 1–60 characters', async () => {
        await assertSucceeds(updateDoc(doc(as(env, 'ali'), 'users/ali'), { displayName: 'Ali B' }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/ali'), { displayName: '' }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/ali'), { displayName: 'x'.repeat(61) }));
    });
});
