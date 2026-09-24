#!/usr/bin/env node
// One-time: create the VAPID key pair that signs Web Push messages.
//
//   node scripts/generate-vapid.mjs
//
// Writes secrets/vapid.json (gitignored). The public key goes in .env
// (VITE_VAPID_PUBLIC_KEY); the private JWK is uploaded to the push worker as
// the VAPID_PRIVATE_JWK secret. Changing keys later means every device has to
// turn notifications on again.
import fs from 'node:fs';

const out = new URL('../secrets/vapid.json', import.meta.url);
if (fs.existsSync(out)) {
    console.error('secrets/vapid.json already exists; delete it first if you really want new keys.');
    process.exit(1);
}

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const raw = Buffer.from(await crypto.subtle.exportKey('raw', publicKey)).toString('base64url');
const jwk = await crypto.subtle.exportKey('jwk', privateKey);

fs.writeFileSync(out, `${JSON.stringify({ publicKey: raw, privateJwk: jwk }, null, 2)}\n`);
console.log('Wrote secrets/vapid.json');
console.log(`VITE_VAPID_PUBLIC_KEY=${raw}`);
