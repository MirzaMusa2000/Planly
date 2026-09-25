// The worker's daily cleanup against the Firestore emulator: expired chat and
// event data goes, everything else (and every user) stays.
// Run with: npm run test:push (starts the Firestore emulator).
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { cleanup } from '../../workers/push/src/index.js';

const PROJECT = 'demo-planly';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const DOCS = `http://${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const DAY = 24 * 60 * 60 * 1000;

const put = async (path, fields) => {
    const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v instanceof Date ? { timestampValue: v.toISOString() } : { stringValue: String(v) }])) };
    const response = await fetch(`${DOCS}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify(body) });
    assert.ok(response.ok, `seed ${path}: ${response.status}`);
};
const exists = async (path) => (await fetch(`${DOCS}/${path}`, { headers: owner })).ok;

const past = new Date(Date.now() - DAY);
const future = new Date(Date.now() + 30 * DAY);

const EXPIRED = [
    'events/old', 'events/old/votes/ali', 'events/old/itinerary/i1', 'events/old/checklist/k1',
    'events/old/expenses/x1', 'events/old/settlements/s1', 'chats/main/messages/m-old', 'pushLog/chat-m-old',
];
const KEPT = [
    'events/soon', 'events/soon/votes/ali', 'events/soon/itinerary/i1', 'events/soon/checklist/k1',
    'events/soon/expenses/x1', 'events/soon/settlements/s1', 'chats/main/messages/m-new', 'pushLog/chat-m-new',
    'events/legacy', 'chats/main/messages/m-legacy', // no expireAt yet: left alone
    'users/ali', 'users/ali/pushSubscriptions/d1', // users are never deleted
];

before(async () => {
    await fetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    for (const path of EXPIRED) await put(path, { note: 'expired', expireAt: past });
    for (const path of KEPT.slice(0, 8)) await put(path, { note: 'fresh', expireAt: future });
    await put('events/legacy', { title: 'No expiry' });
    await put('chats/main/messages/m-legacy', { text: 'No expiry' });
    await put('users/ali', { displayName: 'Ali', status: 'approved', expireAt: past }); // even with an old date
    await put('users/ali/pushSubscriptions/d1', { endpoint: 'https://push.example/1', expireAt: past });
});

describe('daily cleanup', () => {
    test('deletes expired chat and event data only', async () => {
        const deleted = await cleanup({ PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: EMULATOR });
        assert.deepEqual(deleted, { messages: 1, votes: 1, itinerary: 1, checklist: 1, expenses: 1, settlements: 1, events: 1, pushLog: 1 });
        for (const path of EXPIRED) assert.equal(await exists(path), false, `${path} should be deleted`);
        for (const path of KEPT) assert.equal(await exists(path), true, `${path} should be kept`);
    });

    test('running again finds nothing', async () => {
        const deleted = await cleanup({ PROJECT_ID: PROJECT, FIRESTORE_EMULATOR_HOST: EMULATOR });
        assert.ok(Object.values(deleted).every((n) => n === 0));
    });
});
