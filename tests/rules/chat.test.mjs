import { after, before, beforeEach, describe, test } from 'node:test';
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { as, asAdmin, asPending, assertFails, assertSucceeds, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'chats/main/messages/m1'), { senderId: 'mei', senderName: 'Mei Lin', text: 'Hi', createdAt: new Date() });
    });
});

const message = (overrides = {}) => ({ senderId: 'ali', senderName: 'Ali', text: 'Hello!', createdAt: serverTimestamp(), ...overrides });
const send = (db, data, room = 'main') => addDoc(collection(db, 'chats', room, 'messages'), data);

describe('chats/main/messages', () => {
    test('approved members read and send', async () => {
        const ali = as(env, 'ali');
        await assertSucceeds(getDocs(collection(ali, 'chats/main/messages')));
        await assertSucceeds(send(ali, message()));
        await assertSucceeds(send(ali, message({ text: 'line one\nline two' })));
        await assertSucceeds(send(ali, message({ text: 'x'.repeat(1000) })));
    });

    test('pending users can neither read nor send', async () => {
        await assertFails(getDocs(collection(asPending(env), 'chats/main/messages')));
        await assertFails(send(asPending(env), message({ senderId: 'pending', senderName: 'Newbie' })));
    });

    test('text must be 1–1000 characters and not just whitespace', async () => {
        const ali = as(env, 'ali');
        await assertFails(send(ali, message({ text: '' })));
        await assertFails(send(ali, message({ text: '   \n  ' })));
        await assertFails(send(ali, message({ text: 'x'.repeat(1001) })));
    });

    test('no impersonation', async () => {
        const ali = as(env, 'ali');
        await assertFails(send(ali, message({ senderId: 'mei', senderName: 'Mei Lin' })));
        await assertFails(send(ali, message({ senderName: 'Mei Lin' })));
    });

    test('server time, main room, known fields only', async () => {
        const ali = as(env, 'ali');
        await assertFails(send(ali, message({ createdAt: new Date('2020-01-01') })));
        await assertFails(send(ali, message(), 'secret'));
        await assertFails(send(ali, message({ pinned: true })));
    });

    test('only admins edit or delete messages', async () => {
        await assertFails(updateDoc(doc(as(env, 'mei'), 'chats/main/messages/m1'), { text: 'edited' }));
        await assertFails(deleteDoc(doc(as(env, 'mei'), 'chats/main/messages/m1')));
        await assertSucceeds(deleteDoc(doc(asAdmin(env), 'chats/main/messages/m1')));
    });
});
