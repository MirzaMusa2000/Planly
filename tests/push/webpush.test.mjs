// Web Push encryption + VAPID, checked from the receiving side (what a browser
// does with the message). Run with: npm run test:push
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, test } from 'node:test';
import { encryptPayload, sendPush, vapidAuthorization } from '../../workers/push/src/webpush.js';
import { checkVapid, decrypt, makeSubscriber, makeVapid } from './helpers.mjs';

const encoder = new TextEncoder();

describe('web push', () => {
    test('payload round-trips through aes128gcm', async () => {
        const subscriber = await makeSubscriber('https://push.example/abc');
        const message = { title: 'New proposal: Camping July', body: 'Mirza suggested 2 dates. Tap to vote. ⭐', url: '/#event=abc' };
        const body = await encryptPayload(encoder.encode(JSON.stringify(message)), subscriber.subscription);
        const { recordSize, idLength, text } = await decrypt(body, subscriber);
        assert.equal(recordSize, 4096);
        assert.equal(idLength, 65);
        assert.deepEqual(JSON.parse(text), message);
    });

    test('each message uses a fresh salt and sender key', async () => {
        const subscriber = await makeSubscriber('https://push.example/abc');
        const a = await encryptPayload(encoder.encode('hi'), subscriber.subscription);
        const b = await encryptPayload(encoder.encode('hi'), subscriber.subscription);
        assert.notDeepEqual(a.slice(0, 86), b.slice(0, 86));
    });

    test('oversized payloads are refused', async () => {
        const subscriber = await makeSubscriber('https://push.example/abc');
        await assert.rejects(encryptPayload(new Uint8Array(5000), subscriber.subscription));
    });

    test('VAPID header is a valid ES256 JWT for the push service origin', async () => {
        const keys = await makeVapid();
        const endpoint = 'https://fcm.googleapis.com/fcm/send/xyz';
        await checkVapid(await vapidAuthorization(endpoint, keys.vapid), endpoint, keys);
    });

    describe('sendPush against a fake push service', () => {
        let server;
        let base;
        const received = [];

        before(async () => {
            server = http.createServer((req, res) => {
                const chunks = [];
                req.on('data', (c) => chunks.push(c));
                req.on('end', () => {
                    received.push({ url: req.url, headers: req.headers, body: new Uint8Array(Buffer.concat(chunks)) });
                    res.statusCode = req.url.includes('gone') ? 410 : 201;
                    res.end();
                });
            });
            await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
            base = `http://127.0.0.1:${server.address().port}`;
        });
        after(() => server.close());

        test('delivers an encrypted, authenticated message', async () => {
            const keys = await makeVapid();
            const subscriber = await makeSubscriber(`${base}/push/device1`);
            const result = await sendPush(subscriber.subscription, { title: 'Zikri', body: 'Dah sampai!' }, keys.vapid);
            assert.deepEqual(result, { ok: true, gone: false, status: 201 });

            const request = received.at(-1);
            assert.equal(request.headers['content-encoding'], 'aes128gcm');
            assert.equal(request.headers.ttl, '86400');
            await checkVapid(request.headers.authorization, subscriber.subscription.endpoint, keys);
            assert.deepEqual(JSON.parse((await decrypt(request.body, subscriber)).text), { title: 'Zikri', body: 'Dah sampai!' });
        });

        test('reports expired subscriptions as gone', async () => {
            const keys = await makeVapid();
            const subscriber = await makeSubscriber(`${base}/push/gone`);
            const result = await sendPush(subscriber.subscription, { title: 'x' }, keys.vapid);
            assert.deepEqual(result, { ok: false, gone: true, status: 410 });
        });
    });
});
