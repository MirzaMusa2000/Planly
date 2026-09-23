// Shared setup for the Firestore security-rules tests.
// Run with: npm run test:rules (starts the Firestore emulator for the run).
import fs from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/firestore';

// Denied writes are the point of most tests; don't log each one.
setLogLevel('silent');

export { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

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

/** Firestore as a signed-in user with the given custom claims. */
export const as = (env, uid, claims = { approved: true }) => env.authenticatedContext(uid, claims).firestore();
export const asAdmin = (env, uid = 'admin') => as(env, uid, { approved: true, admin: true });
export const asPending = (env, uid = 'pending') => as(env, uid, {});
export const asGuest = (env) => env.unauthenticatedContext().firestore();

/** Write fixtures as the server (rules bypassed). */
export async function seed(env, fn) {
    await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
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
