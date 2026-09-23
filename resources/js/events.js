// Realtime event data shared by the calendar, lists and sheets, plus the
// client-side "propose event" write (protected by firestore.rules).
import Alpine from 'alpinejs';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { approvedUser } from './auth';
import { db } from './firebase';
import { format, formatLong, formatShort, today } from './dates';
import { cancelEvent, confirmEvent, errorMessage, setAvailability, setRsvp } from './voting';

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

const toast = (message, type) => Alpine.store('toast').show(message, type);

Alpine.store('planner', {
    events: [],
    members: [], // approved users: { uid, displayName }
    loading: true,
    error: null,
    selectedId: null,
    myVotes: {}, // eventId -> { availableDates, rsvp } (my own vote per listed event)
    selectedVotes: [], // all votes of the selected event: { uid, displayName, availableDates, rsvp }
    votesLoading: false,
    pending: {}, // in-flight writes, keyed "eventId:date" / "eventId:rsvp" / "eventId:manage"

    get approvedCount() {
        return this.members.length;
    },

    get me() {
        return window.Planly.user;
    },

    /** Admin or the proposer may confirm / cancel. */
    canManage(event) {
        return this.me?.role === 'admin' || event?.proposedBy === this.me?.uid;
    },

    myVote(eventId) {
        return this.myVotes[eventId] ?? { availableDates: [], rsvp: null };
    },

    iAmFree(eventId, date) {
        return this.myVote(eventId).availableDates.includes(date);
    },

    hasVoted(eventId) {
        return this.myVote(eventId).availableDates.length > 0;
    },

    isPending(key) {
        return Boolean(this.pending[key]);
    },

    // --- Names, from the selected event's votes (current members only) ------

    memberVotes() {
        const members = new Map(this.members.map((m) => [m.uid, m.displayName]));
        return this.selectedVotes
            .filter((v) => members.has(v.uid))
            .map((v) => ({ ...v, displayName: members.get(v.uid) }));
    },

    freeNames(date) {
        return this.memberVotes().filter((v) => v.availableDates.includes(date)).map((v) => v.displayName).sort();
    },

    /** "3/4 free: Ali, Mei, Raj" */
    freeLine(event, date) {
        const names = this.votesLoading ? null : this.freeNames(date);
        const count = names ? names.length : this.availableCount(event, date);
        const base = `${count}/${this.approvedCount} free`;
        return names?.length ? `${base}: ${names.join(', ')}` : base;
    },

    /** Everyone-free check for the open sheet, from live votes (falls back to the cached summary). */
    everyoneFreeLive(event, date) {
        if (this.votesLoading) return this.everyoneFree(event, date);
        return this.approvedCount > 0 && this.freeNames(date).length >= this.approvedCount;
    },

    rsvpNames(choice) {
        return this.memberVotes().filter((v) => v.rsvp === choice).map((v) => v.displayName).sort();
    },

    noResponseNames() {
        const answered = new Set(this.memberVotes().filter((v) => v.rsvp).map((v) => v.uid));
        return this.members.filter((m) => !answered.has(m.uid)).map((m) => m.displayName).sort();
    },

    // --- Actions ------------------------------------------------------------

    async run(key, fn, success) {
        if (this.pending[key]) return;
        this.pending = { ...this.pending, [key]: true };
        try {
            const result = await fn();
            if (success) toast(typeof success === 'function' ? success(result) : success);
        } catch (e) {
            toast(errorMessage(e), 'error');
        } finally {
            const { [key]: _, ...rest } = this.pending;
            this.pending = rest;
        }
    },

    toggleFree(event, date) {
        return this.run(`${event.id}:${date}`, () => setAvailability(event.id, date, !this.iAmFree(event.id, date)));
    },

    rsvp(event, choice) {
        return this.run(`${event.id}:rsvp`, () => setRsvp(event.id, choice));
    },

    confirmDate(event, date) {
        if (!window.confirm(`Confirm ${formatLong(date)} for “${event.title}”? Voting will close and people can RSVP.`)) return;
        return this.run(`${event.id}:manage`, () => confirmEvent(event.id, date), (r) => r.message);
    },

    cancel(event) {
        if (!window.confirm(`Cancel “${event.title}”? It will disappear from everyone’s calendar.`)) return;
        return this.run(`${event.id}:manage`, async () => {
            const result = await cancelEvent(event.id);
            this.close();
            return result;
        }, (r) => r.message);
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
        watchSelectedVotes(id);
    },

    close() {
        this.selectedId = null;
        watchSelectedVotes(null);
    },
});

// --- Vote listeners ----------------------------------------------------------

let unsubscribeSelectedVotes = null;

/** Listen to every vote of the event whose sheet is open (names + live counts). */
function watchSelectedVotes(eventId) {
    const store = Alpine.store('planner');
    unsubscribeSelectedVotes?.();
    unsubscribeSelectedVotes = null;
    store.selectedVotes = [];

    if (!eventId) return;

    store.votesLoading = true;
    unsubscribeSelectedVotes = onSnapshot(
        collection(db, 'events', eventId, 'votes'),
        (snapshot) => {
            store.selectedVotes = snapshot.docs.map((d) => ({
                uid: d.id,
                displayName: d.data().displayName ?? '',
                availableDates: d.data().availableDates ?? [],
                rsvp: d.data().rsvp ?? null,
            }));
            store.votesLoading = false;
        },
        (error) => {
            console.error(error);
            store.votesLoading = false;
        },
    );
}

const myVoteListeners = new Map(); // eventId -> unsubscribe

/** Keep one listener on my own vote doc for every listed event. */
function syncMyVoteListeners(eventIds) {
    const store = Alpine.store('planner');
    const uid = window.Planly.user.uid;
    const wanted = new Set(eventIds);

    for (const [id, unsubscribe] of myVoteListeners) {
        if (!wanted.has(id)) {
            unsubscribe();
            myVoteListeners.delete(id);
        }
    }

    for (const id of wanted) {
        if (myVoteListeners.has(id)) continue;
        myVoteListeners.set(id, onSnapshot(doc(db, 'events', id, 'votes', uid), (snap) => {
            store.myVotes = {
                ...store.myVotes,
                [id]: snap.exists()
                    ? { availableDates: snap.data().availableDates ?? [], rsvp: snap.data().rsvp ?? null }
                    : { availableDates: [], rsvp: null },
            };
        }, (error) => console.error(error)));
    }
}

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
            syncMyVoteListeners(store.events.map((e) => e.id));

            // The open event was cancelled (or deleted) by someone else.
            if (store.selectedId && !store.selected) store.close();
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
