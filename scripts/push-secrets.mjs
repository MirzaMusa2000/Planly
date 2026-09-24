#!/usr/bin/env node
// Upload the push worker's secrets to Cloudflare (run once, and again after
// rotating a key). Values are piped straight to wrangler and never printed.
//
//   npm run push:secrets
//
// Reads secrets/service-account.json and secrets/vapid.json (both gitignored).
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (file) => {
    const url = new URL(`../secrets/${file}`, import.meta.url);
    if (!fs.existsSync(url)) {
        console.error(`Missing secrets/${file}.`);
        process.exit(1);
    }
    return JSON.parse(fs.readFileSync(url, 'utf8'));
};

const serviceAccount = read('service-account.json');
const vapid = read('vapid.json');

const secrets = {
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify(serviceAccount),
    VAPID_PRIVATE_JWK: JSON.stringify(vapid.privateJwk),
};

for (const [name, value] of Object.entries(secrets)) {
    console.log(`→ ${name}`);
    const result = spawnSync('npx', ['wrangler', 'secret', 'put', name, '--config', 'workers/push/wrangler.toml'], {
        input: value,
        stdio: ['pipe', 'inherit', 'inherit'],
        shell: process.platform === 'win32',
    });
    if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('Secrets uploaded.');
