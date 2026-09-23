// Realtime event data shared by the calendar, lists and sheets, plus the
// client-side "propose event" write (protected by firestore.rules).
import Alpine from 'alpinejs';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { approvedUser } from './auth';
import { db } from './firebase';
import { format, formatLong, formatShort, today } from './dates';

// $dates in templates: $dates.short(d), $dates.long(d), $dates.month(d), $dates.day(d)
Alpine.magic('dates', () => ({
    today,
    short: formatShort,
    long: formatLong,
    month: (d) => format(d, { month: 'short' }),
    day: (d) => format(d, { day: 'numeric' }),
    weekday: (d) => format(d, { weekday: 'short' }),
}));

export const LIMITS = { title: 120, description: 2000, location: 200, dates: 31 };

function normalise(snap) {
    const d = snap.data({ serverTimestamps: 'estimate' });
    return {
        id: snap.id,
        title: d.title ?? '',
        description: d.description ?? '',
        location: d.location ?? '',
        status: d.status,
        proposedBy: d.proposedBy,
        proposedByName: d.proposedByName ?? '',
        createdAt: d.createdAt?.toDate?.() ?? null,
        candidateDates: [...(d.candidateDates ?? [])].sort(),
        finalDate: d.finalDate ?? null,
        availabilitySummary: d.availabilitySummary ?? {},
        rsvpSummary: { join: 0, notAvailable: 0, ...(d.rsvpSummary ?? {}) },
    };
}

Alpine.store('planner', {
    events: [],
    members: [], // approved users: { uid, displayName }
    loading: true,
    error: null,
    selectedId: null,

    get approvedCount() {
        return this.members.length;
    },

    get selected() {
        return this.events.find((e) => e.id === this.selectedId) ?? null;
    },

    /** Confirmed events from today onwards, soonest first. */
    get upcoming() {
        const t = today();
        return this.events
            .filter((e) => e.status === 'confirmed' && e.finalDate && e.finalDate >= t)
            .sort((a, b) => a.finalDate.localeCompare(b.finalDate));
    },

    /** Proposals that still have a candidate date today or later. */
    get proposals() {
        const t = today();
        return this.events
            .filter((e) => e.status === 'proposed' && e.candidateDates.some((d) => d >= t))
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    },

    availableCount(event, date) {
        return event.availabilitySummary?.[date] ?? 0;
    },

    /** ⭐ Every approved member is free on this candidate date. */
    everyoneFree(event, date) {
        return this.approvedCount > 0 && this.availableCount(event, date) >= this.approvedCount;
    },

    hasEveryoneFreeDate(event) {
        return event.candidateDates.some((d) => this.everyoneFree(event, d));
    },

    open(id) {
        this.selectedId = id;
    },

    close() {
        this.selectedId = null;
    },
});

let started = false;

/** Attach the Firestore listeners once per page. */
export async function startEventsFeed() {
    if (started) return;
    started = true;

    const store = Alpine.store('planner');
    const user = await approvedUser();
    if (!user) return;

    const onError = (error) => {
        console.error(error);
        store.error = 'Couldn’t load events. Check your connection and refresh.';
        store.loading = false;
    };

    onSnapshot(
        query(collection(db, 'events'), where('status', 'in', ['proposed', 'confirmed'])),
        (snapshot) => {
            store.events = snapshot.docs.map(normalise);
            store.loading = false;
            store.error = null;
        },
        onError,
    );

    onSnapshot(
        query(collection(db, 'users'), where('status', '==', 'approved')),
        (snapshot) => {
            store.members = snapshot.docs.map((doc) => ({
                uid: doc.id,
                displayName: doc.data().displayName || doc.data().email || 'Someone',
            }));
        },
        onError,
    );
}

/** Create a proposed event. Throws on validation or permission errors. */
export async function proposeEvent({ title, description, location, candidateDates }) {
    const me = window.Planly.user;
    const dates = [...new Set(candidateDates)].sort();

    if (!title.trim()) throw new Error('Give your event a title.');
    if (dates.length === 0) throw new Error('Pick at least one date.');
    if (dates.length > LIMITS.dates) throw new Error(`Pick at most ${LIMITS.dates} dates.`);

    const ref = await addDoc(collection(db, 'events'), {
        title: title.trim().slice(0, LIMITS.title),
        description: description.trim().slice(0, LIMITS.description),
        location: location.trim().slice(0, LIMITS.location),
        status: 'proposed',
        proposedBy: me.uid,
        proposedByName: (me.displayName || '').slice(0, 60),
        createdAt: serverTimestamp(),
        candidateDates: dates,
        finalDate: null,
        availabilitySummary: {},
        rsvpSummary: { join: 0, notAvailable: 0 },
    });

    return ref.id;
}
