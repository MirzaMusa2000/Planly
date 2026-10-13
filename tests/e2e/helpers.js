// Seeding and sign-in helpers for the e2e tests. Everything goes to the
// emulators started by `npm run test:e2e` (demo-planly, never the live project).
import { expect } from '@playwright/test';

const PROJECT = 'demo-planly';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const owner = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

export const PASSWORD = 'planly-test-pw';

/** Empty Auth and Firestore. */
export async function resetEmulators() {
    await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
    await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}

const encode = (v) => {
    if (v === null) return { nullValue: null };
    if (v instanceof Date) return { timestampValue: v.toISOString() };
    if (typeof v === 'boolean') return { booleanValue: v };
    return { stringValue: String(v) };
};

/** Write a document directly (the emulator's owner token bypasses the rules). */
export async function putDoc(path, fields) {
    const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])) };
    const response = await fetch(`${FIRESTORE}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`putDoc ${path}: ${response.status} ${await response.text()}`);
}

export async function getDoc(path) {
    const response = await fetch(`${FIRESTORE}/${path}`, { headers: owner });
    return response.ok ? response.json() : null;
}

/**
 * A user with an Auth account and a profile.
 * @param {{ name: string, role?: 'admin'|'member', status?: 'approved'|'pending' }} options
 */
export async function createUser({ name, role = 'member', status = 'approved' }) {
    const email = `${name.toLowerCase()}@example.com`;
    const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    });
    if (!response.ok) throw new Error(`createUser ${email}: ${response.status} ${await response.text()}`);
    const { localId: uid } = await response.json();
    await putDoc(`users/${uid}`, {
        email,
        displayName: name,
        photoUrl: null,
        role,
        status,
        createdAt: new Date(),
        approvedAt: status === 'approved' ? new Date() : null,
        approvedBy: null,
        lastReadChatAt: null,
    });
    return { uid, email, name };
}

/** Open the sign-in page once its form is live (typing earlier would be wiped by Alpine). */
export async function openLogin(page) {
    await page.goto('/login');
    await page.waitForFunction(() => Boolean(document.querySelector('[x-data="loginForm"]')?._x_dataStack));
}

/** Sign in through the real form and wait for the page it lands on. */
export async function signIn(page, user, landing = '/') {
    await openLogin(page);
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL(landing);
    await ready(page);
}

/** Wait until the page is usable: the loading splash goes once Alpine has started (js/app.js). */
export async function ready(page) {
    await expect(page.locator('#boot-splash')).toHaveCount(0);
}
