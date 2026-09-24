// Web Push with only WebCrypto (runs in Cloudflare Workers and Node 20+):
// VAPID authentication (RFC 8292) and aes128gcm payload encryption (RFC 8291).

const encoder = new TextEncoder();

export function b64urlEncode(bytes) {
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text) {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function concat(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

export async function hkdf(salt, ikm, info, length) {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8);
    return new Uint8Array(bits);
}

const RECORD_SIZE = 4096;

/**
 * Encrypt a payload for one subscription (RFC 8291, single aes128gcm record).
 * @param {Uint8Array} payload
 * @param {{ p256dh: string, auth: string }} keys  from PushSubscription.toJSON().keys
 */
export async function encryptPayload(payload, keys) {
    if (payload.length > RECORD_SIZE - 17) throw new Error('Push payload too large');

    const uaPublic = b64urlDecode(keys.p256dh);
    const authSecret = b64urlDecode(keys.auth);
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // A fresh sender key pair per message.
    const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
    const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

    const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode('WebPush: info\0'), uaPublic, asPublic), 32);
    const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const plaintext = concat(payload, new Uint8Array([2])); // 0x02: last (only) record
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext));

    // Header: salt (16) | record size (uint32) | key id length (1) | key id (sender public key)
    const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
    header.set(salt, 0);
    new DataView(header.buffer).setUint32(16, RECORD_SIZE);
    header[20] = asPublic.length;
    header.set(asPublic, 21);

    return concat(header, ciphertext);
}

/**
 * `Authorization` header value for a push service (RFC 8292).
 * @param {string} endpoint
 * @param {{ publicKey: string, privateJwk: JsonWebKey, subject: string }} vapid
 */
export async function vapidAuthorization(endpoint, vapid) {
    const json = (o) => b64urlEncode(encoder.encode(JSON.stringify(o)));
    const header = json({ typ: 'JWT', alg: 'ES256' });
    const claims = json({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
    });
    const { d, x, y, kty, crv } = vapid.privateJwk;
    const key = await crypto.subtle.importKey('jwk', { d, x, y, kty, crv }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    // WebCrypto ECDSA signatures are already raw r|s, as JWS expects.
    const signature = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`)));
    return `vapid t=${header}.${claims}.${b64urlEncode(signature)}, k=${vapid.publicKey}`;
}

/**
 * Send one notification. Resolves to { ok, gone, status }: `gone` means the
 * subscription no longer exists and should be deleted.
 */
export async function sendPush(subscription, message, vapid, { ttl = 24 * 60 * 60, urgency = 'normal' } = {}) {
    const body = await encryptPayload(encoder.encode(JSON.stringify(message)), subscription);
    const response = await fetch(subscription.endpoint, {
        method: 'POST',
        headers: {
            Authorization: await vapidAuthorization(subscription.endpoint, vapid),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: String(ttl),
            Urgency: urgency,
        },
        body,
    });
    return { ok: response.ok, gone: response.status === 404 || response.status === 410, status: response.status };
}
