// The push worker end to end: Firebase ID tokens (signed by a test key served as
// Google's JWKS), Firestore in the emulator, and a fake push service that
// records and decrypts what each device receives.
// Run with: npm run test:push (starts the Firestore emulator).
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { decrypt, makeSubscriber, makeVapid } from './helpers.mjs';

const PROJECT = 'demo-planly';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const ORIGIN = 'https://planly.example';
const DOCS = `http://${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

// --- Google's token keys, faked --------------------------------------------------
const signingKey = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(signingKey.publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === GOOGLE_JWKS_URL) {
        return Promise.resolve(new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Content-Type': 'application/json' } }));
    }
    return realFetch(input, init);
};
const { default: worker } = await import('../../workers/push/src/index.js');

const idToken = (uid, { audience = PROJECT } = {}) => new SignJWT({ user_id: uid })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(`https://securetoken.google.com/${PROJECT}`)
    .setAudience(audience)
    .setSubject(uid)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(signingKey.privateKey);

// --- Firestore emulator (REST, as the "owner": no rules) ------------------------
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
function encode(value) {
    if (value === null) return { nullValue: null };
    if (value instanceof Date) return { timestampValue: value.toISOString() };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return { integerValue: String(value) };
    return { stringValue: String(value) };
}
async function put(path, data) {
    const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
    const response = await realFetch(`${DOCS}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields }) });
    assert.ok(response.ok, `seed ${path}: ${response.status}`);
}
const exists = async (path) => (await realFetch(`${DOCS}/${path}`, { headers: owner })).ok;
const clear = () => realFetch(`http://${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

// --- Fake push service: records every delivery per device path -----------------
const deliveries = [];
const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
        deliveries.push({ path: req.url, body: new Uint8Array(Buffer.concat(chunks)) });
        res.statusCode = req.url.includes('gone') ? 410 : 201;
        res.end();
    });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const PUSH = `http://127.0.0.1:${server.address().port}`;

const { vapid } = await makeVapid();
const env = {
    PROJECT_ID: PROJECT,
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    VAPID_SUBJECT: vapid.subject,
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_JWK: JSON.stringify(vapid.privateJwk),
    FIRESTORE_EMULATOR_HOST: EMULATOR,
};

async function call(body, { uid, origin = ORIGIN, token } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (origin) headers.Origin = origin;
    if (token !== undefined) headers.Authorization = `Bearer ${token}`;
    else if (uid) headers.Authorization = `Bearer ${await idToken(uid)}`;
    const response = await worker.fetch(new Request('https://push.example/notify', { method: 'POST', headers, body: JSON.stringify(body) }), env);
    return { status: response.status, headers: response.headers, data: await response.json() };
}

// --- Fixtures -------------------------------------------------------------------
const now = () => new Date();
const hourAgo = () => new Date(Date.now() - 60 * 60 * 1000);
const devices = {}; // name -> subscriber

async function subscribe(uid, name, createdAt = now()) {
    devices[name] ??= await makeSubscriber(`${PUSH}/device/${name}`);
    const { endpoint, p256dh, auth } = devices[name].subscription;
    await put(`users/${uid}/pushSubscriptions/${uid}-${name}`, { endpoint, p256dh, auth, uid, createdAt });
}

/** What each device received since the last reset, decrypted. */
async function inbox() {
    const out = {};
    for (const d of deliveries) {
        const name = d.path.split('/').pop();
        out[name] ??= [];
        out[name].push(JSON.parse((await decrypt(d.body, devices[name])).text));
    }
    return out;
}

beforeEach(async () => {
    await clear();
    deliveries.length = 0;
    const user = (displayName, role, status, createdAt = hourAgo()) => ({ email: `${displayName.toLowerCase()}@planly.test`, displayName, role, status, createdAt });
    await put('users/admin', user('Mirza', 'admin', 'approved'));
    await put('users/ali', user('Ali', 'member', 'approved'));
    await put('users/mei', { ...user('Mei', 'member', 'approved'), lang: 'ms' }); // reads Malay
    await put('users/gone', user('Gone', 'member', 'rejected'));
    await put('users/newbie', user('Newbie', 'member', 'pending', now()));
    await put('users/stale', user('Stale', 'member', 'pending', hourAgo()));

    await subscribe('admin', 'admin-phone');
    await subscribe('admin', 'admin-gone'); // expired at the push service
    await subscribe('ali', 'ali-laptop');
    await subscribe('mei', 'mei-phone');
    await subscribe('gone', 'gone-phone');
    // A shared tablet: Ali turned notifications on first, then Mei.
    await subscribe('ali', 'tablet', hourAgo());
    await subscribe('mei', 'tablet', now());
});

after(async () => {
    server.close();
    globalThis.fetch = realFetch;
});

describe('push worker', () => {
    test('new sign-up notifies the admins, once', async () => {
        const first = await call({ type: 'signup' }, { uid: 'newbie' });
        assert.equal(first.status, 200);
        assert.equal(first.headers.get('Access-Control-Allow-Origin'), ORIGIN);

        const box = await inbox();
        assert.deepEqual(Object.keys(box).sort(), ['admin-gone', 'admin-phone']);
        assert.equal(box['admin-phone'][0].title, 'New member waiting for approval');
        assert.match(box['admin-phone'][0].body, /Newbie \(newbie@planly\.test\)/);
        assert.equal(box['admin-phone'][0].url, '/members');

        // The expired device was removed.
        assert.equal(first.data.removed, 1);
        assert.equal(await exists('users/admin/pushSubscriptions/admin-admin-gone'), false);

        const again = await call({ type: 'signup' }, { uid: 'newbie' });
        assert.deepEqual(again.data, { skipped: 'already sent' });
        assert.equal(deliveries.length, 2);
    });

    test('only a fresh pending sign-up counts', async () => {
        assert.equal((await call({ type: 'signup' }, { uid: 'stale' })).status, 409);
        assert.equal((await call({ type: 'signup' }, { uid: 'ali' })).status, 409);
        assert.equal(deliveries.length, 0);
    });

    test('new proposal notifies every other approved member', async () => {
        await put('events/e1', { title: 'Camping July', status: 'proposed', proposedBy: 'ali', proposedByName: 'Ali', candidateDates: ['2026-10-17', '2026-10-18'], createdAt: now() });
        const response = await call({ type: 'proposal', eventId: 'e1' }, { uid: 'ali' });
        assert.equal(response.status, 200);

        const box = await inbox();
        // Not Ali (the proposer), not rejected users; the shared tablet now belongs to Mei.
        assert.deepEqual(Object.keys(box).sort(), ['admin-gone', 'admin-phone', 'mei-phone', 'tablet']);
        // Each in their own language: Mei reads Malay, the admin English.
        assert.deepEqual(box['mei-phone'][0], {
            title: 'Cadangan baru: Camping July',
            body: 'Ali mencadangkan 2 tarikh. Tekan untuk mengundi.',
            url: '/#event=e1',
            tag: 'planly-event-e1',
        });
        assert.equal(box['admin-phone'][0].title, 'New proposal: Camping July');
        assert.equal(box['admin-phone'][0].body, 'Ali suggested 2 dates. Tap to vote.');
        // Ali's older copy of the tablet subscription is cleaned up.
        assert.equal(await exists('users/ali/pushSubscriptions/ali-tablet'), false);
        assert.equal(await exists('users/mei/pushSubscriptions/mei-tablet'), true);
    });

    test('multi-day proposals say "date options"', async () => {
        const fields = { title: 'Camping', status: 'proposed', proposedBy: 'ali', proposedByName: 'Ali', candidateDates: ['2026-11-06', '2026-11-13'], createdAt: now() };
        const response = await realFetch(`${DOCS}/events/trip`, {
            method: 'PATCH',
            headers: owner,
            body: JSON.stringify({
                fields: {
                    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])),
                    candidateEnds: { mapValue: { fields: { '2026-11-06': { stringValue: '2026-11-08' } } } },
                },
            }),
        });
        assert.ok(response.ok);
        await call({ type: 'proposal', eventId: 'trip' }, { uid: 'ali' });
        const box = await inbox();
        assert.equal(box['mei-phone'][0].body, 'Ali mencadangkan 2 pilihan tarikh. Tekan untuk mengundi.');
        assert.equal(box['admin-phone'][0].body, 'Ali suggested 2 date options. Tap to vote.');
    });

    test('you can only announce your own, new proposal', async () => {
        await put('events/e1', { title: 'X', status: 'proposed', proposedBy: 'ali', candidateDates: [], createdAt: now() });
        await put('events/old', { title: 'X', status: 'proposed', proposedBy: 'mei', candidateDates: [], createdAt: hourAgo() });
        await put('events/done', { title: 'X', status: 'confirmed', proposedBy: 'mei', candidateDates: [], createdAt: now() });
        assert.equal((await call({ type: 'proposal', eventId: 'e1' }, { uid: 'mei' })).status, 409);
        assert.equal((await call({ type: 'proposal', eventId: 'old' }, { uid: 'mei' })).status, 409);
        assert.equal((await call({ type: 'proposal', eventId: 'done' }, { uid: 'mei' })).status, 409);
        assert.equal((await call({ type: 'proposal', eventId: 'missing' }, { uid: 'mei' })).status, 409);
        assert.equal((await call({ type: 'proposal', eventId: '../users/x' }, { uid: 'mei' })).status, 400);
        await put('events/g1', { title: 'X', status: 'proposed', proposedBy: 'gone', candidateDates: [], createdAt: now() });
        assert.equal((await call({ type: 'proposal', eventId: 'g1' }, { uid: 'gone' })).status, 403);
        assert.equal(deliveries.length, 0);
    });

    test('new chat message notifies everyone else', async () => {
        await put('chats/main/messages/m1', { senderId: 'mei', senderName: 'Mei', text: 'Siapa bawa arang?', createdAt: now() });
        assert.equal((await call({ type: 'chat', messageId: 'm1' }, { uid: 'mei' })).status, 200);

        const box = await inbox();
        assert.deepEqual(Object.keys(box).sort(), ['admin-gone', 'admin-phone', 'ali-laptop']);
        assert.deepEqual(box['ali-laptop'][0], { title: 'Mei', body: 'Siapa bawa arang?', url: '/#chat', tag: 'planly-chat' });

        // Not someone else's message, not twice.
        assert.equal((await call({ type: 'chat', messageId: 'm1' }, { uid: 'ali' })).status, 409);
        assert.deepEqual((await call({ type: 'chat', messageId: 'm1' }, { uid: 'mei' })).data, { skipped: 'already sent' });
    });

    test('long messages are shortened', async () => {
        await put('chats/main/messages/m2', { senderId: 'ali', senderName: 'Ali', text: 'a'.repeat(500), createdAt: now() });
        await call({ type: 'chat', messageId: 'm2' }, { uid: 'ali' });
        const { body } = (await inbox())['mei-phone'][0];
        assert.equal(body.length, 140);
        assert.ok(body.endsWith('…'));
    });

    test('requires a valid Firebase sign-in and an allowed site', async () => {
        assert.equal((await call({ type: 'signup' }, {})).status, 401);
        assert.equal((await call({ type: 'signup' }, { token: 'not-a-jwt' })).status, 401);
        const wrongProject = await idToken('newbie', { audience: 'someone-else' });
        assert.equal((await call({ type: 'signup' }, { token: wrongProject })).status, 401);
        assert.equal((await call({ type: 'signup' }, { uid: 'newbie', origin: 'https://evil.example' })).status, 403);
        assert.equal((await call({ type: 'signup' }, { uid: 'newbie', origin: null })).status, 403);
        assert.equal((await call({ type: 'nope' }, { uid: 'ali' })).status, 400);
        assert.equal((await call({ type: 'signup' }, { uid: 'stranger' })).status, 403);
        assert.equal(deliveries.length, 0);
    });

    test('preview channel sites are allowed; CORS preflight works', async () => {
        const preview = 'https://demo-planly--staging-abc123.web.app';
        assert.equal((await call({ type: 'signup' }, { uid: 'newbie', origin: preview })).status, 200);

        const preflight = await worker.fetch(new Request('https://push.example/notify', {
            method: 'OPTIONS',
            headers: { Origin: preview, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
        }), env);
        assert.equal(preflight.status, 204);
        assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), preview);
        assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
    });
});
