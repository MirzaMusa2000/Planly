// Browser-side halves of Web Push, for tests: a subscription's keys, and
// decrypting what the push service delivers (RFC 8291 / RFC 8188).
import assert from 'node:assert/strict';
import { b64urlDecode, b64urlEncode, concat, hkdf } from '../../workers/push/src/webpush.js';

const encoder = new TextEncoder();

/** A browser-side subscription: its ECDH key pair and auth secret. */
export async function makeSubscriber(endpoint) {
    const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    return {
        privateKey: keys.privateKey,
        publicRaw,
        authRaw: auth,
        subscription: { endpoint, p256dh: b64urlEncode(publicRaw), auth: b64urlEncode(auth) },
    };
}

/** Decrypt an aes128gcm body the way the browser does. */
export async function decrypt(body, subscriber) {
    const salt = body.slice(0, 16);
    const recordSize = new DataView(body.buffer, body.byteOffset).getUint32(16);
    const idLength = body[20];
    const asPublic = body.slice(21, 21 + idLength);
    const ciphertext = body.slice(21 + idLength);

    const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, subscriber.privateKey, 256));
    const ikm = await hkdf(subscriber.authRaw, ecdh, concat(encoder.encode('WebPush: info\0'), subscriber.publicRaw, asPublic), 32);
    const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext));

    assert.equal(plain.at(-1), 2, 'last-record delimiter');
    return { recordSize, idLength, text: new TextDecoder().decode(plain.slice(0, -1)) };
}

export async function makeVapid() {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    return {
        verifyKey: publicKey,
        vapid: {
            publicKey: b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey))),
            privateJwk: await crypto.subtle.exportKey('jwk', privateKey),
            subject: 'https://planly.example',
        },
    };
}

/** Check a `vapid t=…, k=…` header: signature, audience, expiry, key. */
export async function checkVapid(header, endpoint, { vapid, verifyKey }) {
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
    assert.equal(k, vapid.publicKey);
    const [h, c, s] = token.split('.');
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verifyKey, b64urlDecode(s), encoder.encode(`${h}.${c}`));
    assert.ok(ok, 'VAPID signature verifies');
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
    assert.equal(claims.aud, new URL(endpoint).origin);
    assert.equal(claims.sub, vapid.subject);
    assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
}
