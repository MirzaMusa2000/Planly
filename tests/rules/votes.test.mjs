// Votes and their cached summaries. The app writes a vote and the matching
// summary change together; the rules check the summary moved by exactly the
// caller's own vote change.
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteDoc, doc, FieldPath, getDoc, increment, runTransaction, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { as, asPending, assertFails, assertSucceeds, D1, D2, newEvent, seed, seedMembers, setupEnv } from './helpers.mjs';

let env;
before(async () => (env = await setupEnv()));
after(async () => env.cleanup());
beforeEach(async () => {
    await env.clearFirestore();
    await seedMembers(env);
    await seed(env, async (db) => {
        await setDoc(doc(db, 'events/p'), { ...newEvent('boss'), createdAt: new Date() });
        await setDoc(doc(db, 'events/c'), { ...newEvent('boss', { status: 'confirmed', finalDate: D1 }), createdAt: new Date() });
        await setDoc(doc(db, 'events/x'), { ...newEvent('boss', { status: 'cancelled' }), createdAt: new Date() });
    });
});

/** Vote doc + summary increments in one batch, like the app. */
function vote(db, eventId, uid, { dates = [], rsvp = null, inc = {} } = {}) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'events', eventId, 'votes', uid), { displayName: uid, availableDates: dates, rsvp, updatedAt: serverTimestamp() });
    const entries = Object.entries(inc);
    if (entries.length) {
        const args = entries.flatMap(([field, n]) => [
            field.startsWith('rsvp') ? field : new FieldPath('availabilitySummary', field),
            increment(n),
        ]);
        batch.update(doc(db, 'events', eventId), ...args);
    }
    return batch.commit();
}

/** Read an event as the server (withSecurityRulesDisabled doesn't return the callback's value). */
async function summary(id) {
    let data;
    await env.withSecurityRulesDisabled(async (ctx) => {
        data = (await getDoc(doc(ctx.firestore(), 'events', id))).data();
    });
    return data;
}

describe('availability votes (proposed events)', () => {
    test('free on a date + that date +1', async () => {
        await assertSucceeds(vote(as(env, 'ali'), 'p', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
        assert.equal((await summary('p')).availabilitySummary[D1], 1);
    });

    test('toggle off: date removed + that date -1', async () => {
        await assertSucceeds(vote(as(env, 'ali'), 'p', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
        await assertSucceeds(vote(as(env, 'ali'), 'p', 'ali', { dates: [], inc: { [D1]: -1 } }));
        assert.equal((await summary('p')).availabilitySummary[D1], 0);
    });

    test('the real client transaction (read vote, write vote + summary)', async () => {
        const db = as(env, 'mei');
        await assertSucceeds(runTransaction(db, async (tx) => {
            const voteRef = doc(db, 'events/p/votes/mei');
            const old = (await tx.get(voteRef)).data() ?? { availableDates: [], rsvp: null };
            await tx.get(doc(db, 'events/p'));
            tx.set(voteRef, { displayName: 'Mei', availableDates: [...old.availableDates, D2], rsvp: null, updatedAt: serverTimestamp() });
            tx.update(doc(db, 'events/p'), new FieldPath('availabilitySummary', D2), increment(1));
        }));
    });

    test('rejects votes that do not match the summary change', async () => {
        const db = as(env, 'mei');
        await assertFails(vote(db, 'p', 'mei', { dates: [D1] })); // vote without summary
        await assertFails(vote(db, 'p', 'mei', { dates: [D1], inc: { [D1]: 2 } })); // +2
        await assertFails(vote(db, 'p', 'mei', { dates: [D1], inc: { [D2]: 1 } })); // wrong date bumped
        await assertFails(vote(db, 'p', 'mei', { dates: [D1, D2], inc: { [D1]: 1, [D2]: 1 } })); // two dates at once
        await assertFails(vote(db, 'p', 'mei', { dates: ['2026-12-25'], inc: { '2026-12-25': 1 } })); // not a candidate
    });

    test('no double counting', async () => {
        await assertSucceeds(vote(as(env, 'ali'), 'p', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
        await assertFails(vote(as(env, 'ali'), 'p', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
    });

    test("you can't vote for someone else", async () => {
        await assertFails(vote(as(env, 'mei'), 'p', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
    });

    test('summary alone cannot be changed', async () => {
        const db = as(env, 'mei');
        const batch = writeBatch(db);
        batch.update(doc(db, 'events/p'), new FieldPath('availabilitySummary', D1), increment(1));
        await assertFails(batch.commit());
    });

    test('RSVP is not allowed while proposed', async () => {
        await assertFails(vote(as(env, 'mei'), 'p', 'mei', { rsvp: 'join', inc: { 'rsvpSummary.join': 1 } }));
    });

    test('votes cannot be deleted', async () => {
        await assertSucceeds(vote(as(env, 'ali'), 'p', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
        await assertFails(deleteDoc(doc(as(env, 'ali'), 'events/p/votes/ali')));
    });

    test('pending users cannot vote', async () => {
        await assertFails(vote(asPending(env), 'p', 'pending', { dates: [D1], inc: { [D1]: 1 } }));
    });

    test('no voting on cancelled events', async () => {
        await assertFails(vote(as(env, 'ali'), 'x', 'ali', { dates: [D1], inc: { [D1]: 1 } }));
    });
});

describe('RSVP (confirmed events)', () => {
    test('join, then switch to not available', async () => {
        await assertSucceeds(vote(as(env, 'ali'), 'c', 'ali', { rsvp: 'join', inc: { 'rsvpSummary.join': 1 } }));
        await assertSucceeds(vote(as(env, 'ali'), 'c', 'ali', { rsvp: 'not_available', inc: { 'rsvpSummary.join': -1, 'rsvpSummary.notAvailable': 1 } }));
        assert.deepEqual((await summary('c')).rsvpSummary, { join: 0, notAvailable: 1 });
    });

    test('rejects inflated or invalid RSVPs', async () => {
        const db = as(env, 'mei');
        await assertFails(vote(db, 'c', 'mei', { rsvp: 'join', inc: { 'rsvpSummary.join': 5 } }));
        await assertFails(vote(db, 'c', 'mei', { rsvp: 'maybe', inc: { 'rsvpSummary.join': 1 } }));
        await assertFails(vote(db, 'c', 'mei', { rsvp: 'join' })); // no summary change
    });

    test('availability cannot change once confirmed', async () => {
        await assertFails(vote(as(env, 'mei'), 'c', 'mei', { dates: [D1], inc: { [D1]: 1 } }));
    });
});
