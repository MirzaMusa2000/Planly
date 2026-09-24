import { after, before, beforeEach, describe, test } from 'node:test';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { as, asAdmin, asGuest, asPending, assertFails, assertSucceeds, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
});

/** The profile the browser creates on first sign-in. */
const signUpProfile = (uid, overrides = {}) => ({
    email: `${uid}@planly.test`, displayName: 'New Person', photoUrl: null, role: 'member', status: 'pending',
    createdAt: serverTimestamp(), approvedAt: null, approvedBy: null, lastReadChatAt: null, ...overrides,
});

describe('users/{uid}: reading', () => {
    test('approved members can read everyone', async () => {
        await assertSucceeds(getDocs(collection(as(env, 'ali'), 'users')));
    });

    test('pending and rejected users can read only their own profile', async () => {
        await assertSucceeds(getDoc(doc(asPending(env), 'users/pending')));
        await assertFails(getDoc(doc(asPending(env), 'users/ali')));
        await assertSucceeds(getDoc(doc(as(env, 'rejected'), 'users/rejected')));
        await assertFails(getDocs(collection(as(env, 'rejected'), 'users')));
    });

    test('guests can read nothing', async () => {
        await assertFails(getDoc(doc(asGuest(env), 'users/ali')));
    });
});

describe('users/{uid}: sign-up', () => {
    test('a new user creates their own pending profile', async () => {
        await assertSucceeds(setDoc(doc(as(env, 'newbie'), 'users/newbie'), signUpProfile('newbie')));
    });

    test('sign-up cannot self-approve, self-promote or lie about the email', async () => {
        const db = as(env, 'newbie');
        await assertFails(setDoc(doc(db, 'users/newbie'), signUpProfile('newbie', { status: 'approved' })));
        await assertFails(setDoc(doc(db, 'users/newbie'), signUpProfile('newbie', { role: 'admin' })));
        await assertFails(setDoc(doc(db, 'users/newbie'), signUpProfile('newbie', { email: 'admin@planly.test' })));
        await assertFails(setDoc(doc(db, 'users/newbie'), signUpProfile('newbie', { approvedBy: 'newbie' })));
        await assertFails(setDoc(doc(db, 'users/newbie'), signUpProfile('newbie', { createdAt: Timestamp.fromDate(new Date('2020-01-01')) })));
    });

    test("you can't create someone else's profile", async () => {
        await assertFails(setDoc(doc(as(env, 'newbie'), 'users/other'), signUpProfile('other')));
    });

    test("an existing profile can't be overwritten by re-signing up", async () => {
        await assertFails(setDoc(doc(asPending(env), 'users/pending'), signUpProfile('pending')));
    });
});

describe('users/{uid}: your own profile', () => {
    test('display name (1–60 characters) and server-time read receipt', async () => {
        const ali = as(env, 'ali');
        await assertSucceeds(updateDoc(doc(ali, 'users/ali'), { displayName: 'Ali B' }));
        await assertSucceeds(updateDoc(doc(ali, 'users/ali'), { lastReadChatAt: serverTimestamp() }));
        await assertFails(updateDoc(doc(ali, 'users/ali'), { displayName: '' }));
        await assertFails(updateDoc(doc(ali, 'users/ali'), { lastReadChatAt: Timestamp.fromDate(new Date('2099-01-01')) }));
    });

    test('you cannot approve or promote yourself', async () => {
        await assertFails(updateDoc(doc(asPending(env), 'users/pending'), { status: 'approved' }));
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/ali'), { role: 'admin' }));
    });

    test('nobody deletes profiles', async () => {
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'users/ali')));
        await assertFails(deleteDoc(doc(asAdmin(env), 'users/ali')));
    });
});

describe('users/{uid}: admin moderation', () => {
    test('admin approves a pending user', async () => {
        await assertSucceeds(updateDoc(doc(asAdmin(env), 'users/pending'), {
            status: 'approved', approvedAt: serverTimestamp(), approvedBy: 'admin',
        }));
    });

    test('admin rejects, revokes and promotes', async () => {
        const admin = asAdmin(env);
        await assertSucceeds(updateDoc(doc(admin, 'users/pending'), { status: 'rejected' }));
        await assertSucceeds(updateDoc(doc(admin, 'users/ali'), { status: 'rejected' }));
        await assertSucceeds(updateDoc(doc(admin, 'users/mei'), { role: 'admin' }));
    });

    test('a revoked user loses access immediately', async () => {
        await assertSucceeds(getDocs(collection(as(env, 'ali'), 'users')));
        await updateDoc(doc(asAdmin(env), 'users/ali'), { status: 'rejected' });
        await assertFails(getDocs(collection(as(env, 'ali'), 'users')));
    });

    test('admin moderation is validated', async () => {
        const admin = asAdmin(env);
        await assertFails(updateDoc(doc(admin, 'users/pending'), { status: 'superuser' }));
        await assertFails(updateDoc(doc(admin, 'users/pending'), { status: 'approved', approvedBy: 'someone-else' }));
        await assertFails(updateDoc(doc(admin, 'users/ali'), { email: 'x@x' }));
        await assertFails(updateDoc(doc(admin, 'users/admin'), { role: 'member' })); // never yourself
    });

    test('members cannot moderate', async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/pending'), { status: 'approved' }));
    });
});

describe('profile photo and name', () => {
    const photo = `data:image/webp;base64,${'A'.repeat(4000)}`;

    test('you can set, change and remove your own photo, and rename yourself', async () => {
        const mei = as(env, 'mei');
        await assertSucceeds(updateDoc(doc(mei, 'users/mei'), { photoUrl: photo }));
        await assertSucceeds(updateDoc(doc(mei, 'users/mei'), { photoUrl: `data:image/jpeg;base64,${'B'.repeat(100)}==` }));
        await assertSucceeds(updateDoc(doc(mei, 'users/mei'), { photoUrl: null }));
        await assertSucceeds(updateDoc(doc(mei, 'users/mei'), { displayName: 'Mei Ling', photoUrl: photo }));
    });

    test("nobody else can change your photo, not even the admin", async () => {
        await assertFails(updateDoc(doc(as(env, 'ali'), 'users/mei'), { photoUrl: photo }));
        await assertFails(updateDoc(doc(as(env, 'admin'), 'users/mei'), { photoUrl: photo }));
    });

    test('only small image data URLs', async () => {
        const mei = as(env, 'mei');
        await assertFails(updateDoc(doc(mei, 'users/mei'), { photoUrl: 'https://example.com/me.png' })); // no links
        await assertFails(updateDoc(doc(mei, 'users/mei'), { photoUrl: `data:image/svg+xml;base64,${'A'.repeat(100)}` })); // no SVG
        await assertFails(updateDoc(doc(mei, 'users/mei'), { photoUrl: `data:text/html;base64,${'A'.repeat(100)}` }));
        await assertFails(updateDoc(doc(mei, 'users/mei'), { photoUrl: `data:image/png;base64,${'A'.repeat(100)}<script>` }));
        await assertFails(updateDoc(doc(mei, 'users/mei'), { photoUrl: `data:image/webp;base64,${'A'.repeat(120001)}` })); // too big
        await assertFails(updateDoc(doc(mei, 'users/mei'), { displayName: '' }));
    });
});

