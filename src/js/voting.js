// Voting writes. Each vote change and the matching summary change are written
// in one transaction; firestore.rules verifies the summary moved by exactly
// the amount the caller's own vote changed.
import { doc, FieldPath, increment, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { t } from './i18n';

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
            throw new Error(t('Voting has closed for this event.'));
        }
        if (!(eventSnap.data().candidateDates ?? []).includes(date)) {
            throw new Error(t('That date is no longer an option.'));
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
            throw new Error(t('This event isn’t confirmed any more.'));
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

/**
 * Confirm / cancel. firestore.rules allow these only for the admin or the
 * proposer: confirm only a proposed event onto one of its date options (a
 * multi-day option also sets finalEndDate to its last day),
 * cancel only a proposed or confirmed event. The transaction re-reads the
 * event so two people acting at once get a clear message.
 */
export async function confirmEvent(event, date) {
    const ref = doc(db, 'events', event.id);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const status = snap.data()?.status;
        if (status !== 'proposed') throw new Error(status === 'confirmed' ? t('This event is already confirmed.') : t('This event was cancelled.'));
        if (!snap.data().candidateDates?.includes(date)) throw new Error(t('That date is not one of the candidate dates.'));
        tx.update(ref, { status: 'confirmed', finalDate: date, finalEndDate: snap.data().candidateEnds?.[date] ?? date });
    });
    return { message: t('Confirmed “{title}”.', { title: event.title }) };
}

export async function cancelEvent(event) {
    const ref = doc(db, 'events', event.id);
    await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().status === 'cancelled') throw new Error(t('This event is already cancelled.'));
        tx.update(ref, { status: 'cancelled' });
    });
    return { message: t('Cancelled “{title}”.', { title: event.title }) };
}

/** Friendly message for a failed vote/confirm/cancel. */
export function errorMessage(error) {
    if (error?.code === 'permission-denied') return t('That change wasn’t allowed. Only the admin or the proposer can do that.');
    if (error?.code === 'aborted' || error?.code === 'failed-precondition') return t('Someone voted at the same time. Try again.');
    return error?.message || t('Something went wrong. Please try again.');
}
