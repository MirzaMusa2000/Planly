// Shared setup for the Firestore security-rules tests.
// Run with: npm run test:rules (starts the Firestore emulator for the run).
import fs from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, setLogLevel } from 'firebase/firestore';

export { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

// Denied writes are the point of most tests; don't log each one.
setLogLevel('silent');

export const D1 = '2026-10-10';
export const D2 = '2026-10-11';

export async function setupEnv() {
    return initializeTestEnvironment({
        projectId: 'demo-planly',
        firestore: {
            rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
            host: '127.0.0.1',
            port: 8080,
        },
    });
}

/** Firestore as a signed-in user (access comes from their users/{uid} doc). */
export const as = (env, uid) => env.authenticatedContext(uid, { email: `${uid}@planly.test` }).firestore();
export const asAdmin = (env) => as(env, 'admin');
export const asPending = (env) => as(env, 'pending');
export const asGuest = (env) => env.unauthenticatedContext().firestore();

/** Write fixtures as the server (rules bypassed). */
export async function seed(env, fn) {
    await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

/** Everyone the tests act as. Users without a doc (e.g. "stranger") have no access. */
export const MEMBERS = {
    ali: { displayName: 'Ali', role: 'member', status: 'approved' },
    mei: { displayName: 'Mei Lin', role: 'member', status: 'approved' },
    boss: { displayName: 'Boss', role: 'member', status: 'approved' },
    admin: { displayName: 'Admin', role: 'admin', status: 'approved' },
    pending: { displayName: 'Newbie', role: 'member', status: 'pending' },
    rejected: { displayName: 'Gone', role: 'member', status: 'rejected' },
};

export async function seedMembers(env) {
    await seed(env, async (db) => {
        for (const [uid, data] of Object.entries(MEMBERS)) {
            await setDoc(doc(db, 'users', uid), { email: `${uid}@planly.test`, lastReadChatAt: null, ...data });
        }
    });
}

/** A valid new proposal, as the browser creates it. */
export function newEvent(proposedBy, overrides = {}) {
    return {
        title: 'Beach day',
        description: '',
        location: 'PD',
        status: 'proposed',
        proposedBy,
        proposedByName: proposedBy,
        candidateDates: [D1, D2],
        finalDate: null,
        availabilitySummary: {},
        rsvpSummary: { join: 0, notAvailable: 0 },
        ...overrides,
    };
}
