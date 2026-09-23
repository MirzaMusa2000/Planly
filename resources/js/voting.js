// Voting writes. Each vote change and the matching summary change are written
// in one transaction; firestore.rules verifies the summary moved by exactly
// the amount the caller's own vote changed.
import { doc, FieldPath, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const RSVP_FIELD = { join: 'join', not_available: 'notAvailable' };

function me() {
    return window.Planly.user;
}

function refs(eventId) {
    const eventRef = doc(db, 'events', eventId);
    return { eventRef, voteRef: doc(eventRef, 'votes', me().uid) };
}

/** Mark yourself free (or not) on one candidate date of a proposed event. */
export async function setAvailability(eventId, date, free) {
    const { eventRef, voteRef } = refs(eventId);

    await runTransaction(db, async (tx) => {
        const eventSnap = await tx.get(eventRef);
        const voteSnap = await tx.get(voteRef);

        if (!eventSnap.exists() || eventSnap.data().status !== 'proposed') {
            throw new Error('Voting has closed for this event.');
        }
        if (!(eventSnap.data().candidateDates ?? []).includes(date)) {
            throw new Error('That date is no longer an option.');
        }

        const old = voteSnap.exists() ? voteSnap.data() : { availableDates: [], rsvp: null };
        const wasFree = old.availableDates.includes(date);
        if (wasFree === free) return; // nothing to change

        const availableDates = free
            ? [...old.availableDates, date].sort()
            : old.availableDates.filter((d) => d !== date);

        tx.set(voteRef, {
            displayName: (me().displayName || '').slice(0, 60),
            availableDates,
            rsvp: old.rsvp ?? null,
            updatedAt: serverTimestamp(),
        });
        tx.update(eventRef, new FieldPath('availabilitySummary', date), increment(free ? 1 : -1));
    });
}

/** RSVP to a confirmed event: 'join' | 'not_available'. */
export async function setRsvp(eventId, choice) {
    const { eventRef, voteRef } = refs(eventId);

    await runTransaction(db, async (tx) => {
        const eventSnap = await tx.get(eventRef);
        const voteSnap = await tx.get(voteRef);

        if (!eventSnap.exists() || eventSnap.data().status !== 'confirmed') {
            throw new Error('This event isn’t confirmed any more.');
        }

        const old = voteSnap.exists() ? voteSnap.data() : { availableDates: [], rsvp: null };
        if (old.rsvp === choice) return;

        tx.set(voteRef, {
            displayName: (me().displayName || '').slice(0, 60),
            availableDates: old.availableDates, // unchanged (rules require it)
            rsvp: choice,
            updatedAt: serverTimestamp(),
        });

        const changes = [];
        if (old.rsvp) changes.push(`rsvpSummary.${RSVP_FIELD[old.rsvp]}`, increment(-1));
        if (choice) changes.push(`rsvpSummary.${RSVP_FIELD[choice]}`, increment(1));
        tx.update(eventRef, ...changes);
    });
}

/** Server-side (permission-checked) state changes. */
export async function confirmEvent(eventId, date) {
    const { data } = await window.axios.post(`/events/${encodeURIComponent(eventId)}/confirm`, { date });
    return data;
}

export async function cancelEvent(eventId) {
    const { data } = await window.axios.post(`/events/${encodeURIComponent(eventId)}/cancel`);
    return data;
}

/** Friendly message for a failed vote/confirm/cancel. */
export function errorMessage(error) {
    if (error?.response?.data?.message) return error.response.data.message;
    if (error?.code === 'permission-denied') return 'That change wasn’t allowed. Refresh and try again.';
    if (error?.code === 'aborted' || error?.code === 'failed-precondition') return 'Someone voted at the same time. Try again.';
    return error?.message || 'Something went wrong. Please try again.';
}
