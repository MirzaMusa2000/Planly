// Realtime event data shared by the calendar, lists and sheets, plus the
// client-side "propose event" write (protected by firestore.rules).
import Alpine from 'alpinejs';
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { approvedUser } from './session';
import { notify } from './push';
import { db } from './firebase';
import { dayCount, format, formatLong, formatRange, formatRangeLong, formatShort, today } from './dates';
import { cancelEvent, confirmEvent, errorMessage, setAvailability, setRsvp } from './voting';
import { confirmDialog } from './ui';
import { t, tn } from './i18n';

// $dates in templates: $dates.short(d), $dates.long(d), $dates.range(a, b), $dates.month(d), $dates.day(d)
Alpine.magic('dates', () => ({
    today,
    short: formatShort,
    long: formatLong,
    range: formatRange,
    rangeLong: formatRangeLong,
    month: (d) => format(d, { month: 'short' }),
    day: (d) => format(d, { day: 'numeric' }),
    weekday: (d) => format(d, { weekday: 'short' }),
}));

// dates: options per proposal; rangeDays: longest multi-day option.
export const LIMITS = { title: 120, description: 2000, location: 200, dates: 31, rangeDays: 14 };

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
        // Each option is keyed by its first day; multi-day options end on candidateEnds[start].
        candidateDates: [...(d.candidateDates ?? [])].sort(),
        candidateEnds: d.candidateEnds ?? {},
        finalDate: d.finalDate ?? null,
        finalEndDate: d.finalEndDate ?? d.finalDate ?? null,
        availabilitySummary: d.availabilitySummary ?? {},
        rsvpSummary: { join: 0, notAvailable: 0, ...(d.rsvpSummary ?? {}) },
    };
}

const toast = (message, type) => Alpine.store('toast').show(message, type);

Alpine.store('planner', {
    events: [],
    /** Approved users: { uid, displayName, photoUrl } (js/people.js). */
    get members() {
        return Alpine.store('people').list;
    },
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

    // --- Date options (one day, or several: first day -> candidateEnds) ------

    endOf(event, start) {
        return event.candidateEnds?.[start] ?? start;
    },

    optionDays(event, start) {
        return start ? dayCount(start, this.endOf(event, start)) : 0;
    },

    /** "Fri, 2 Oct" or "Fri–Sun, 2–4 Oct". */
    optionLabel(event, start) {
        return formatRange(start, this.endOf(event, start));
    },

    /** The option (its first day) that covers `date`, or null. */
    optionAt(event, date) {
        return event.candidateDates.find((s) => s <= date && date <= this.endOf(event, s)) ?? null;
    },

    /** When a confirmed event happens, e.g. "Friday 2 – Sunday 4 October 2026". */
    whenLong(event) {
        return formatRangeLong(event.finalDate, event.finalEndDate);
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
        const base = t('{count}/{total} free', { count, total: this.approvedCount });
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
        const days = this.optionDays(event, date);
        return confirmDialog({
            title: days > 1 ? t('Confirm these dates?') : t('Confirm this date?'),
            message: t('Voting closes and everyone can RSVP.'),
            detail: event.title,
            detailSub: `${formatRangeLong(date, this.endOf(event, date))} · ${this.freeLine(event, date)}`,
            confirmLabel: days > 1 ? t('Confirm {n} days', { n: days }) : t('Confirm date'),
            tone: 'success',
            icon: 'calendar-check',
            action: () => this.run(`${event.id}:manage`, () => confirmEvent(event, date), (r) => r.message),
        });
    },

    cancel(event) {
        return confirmDialog({
            title: t('Cancel this event?'),
            message: t('It disappears from everyone’s calendar. This can’t be undone.'),
            detail: event.title,
            detailSub: event.status === 'confirmed'
                ? this.whenLong(event)
                : `${t('Proposed')} · ${tn(event.candidateDates.length, '{n} date option', '{n} date options')}`,
            confirmLabel: t('Cancel event'),
            cancelLabel: t('Keep it'),
            tone: 'danger',
            icon: 'calendar-x',
            action: () => this.run(`${event.id}:manage`, async () => {
                const result = await cancelEvent(event);
                this.close();
                return result;
            }, (r) => r.message),
        });
    },

    get selected() {
        return this.events.find((e) => e.id === this.selectedId) ?? null;
    },

    /** Confirmed events not over yet (including ones happening now), soonest first. */
    get upcoming() {
        const t = today();
        return this.events
            .filter((e) => e.status === 'confirmed' && e.finalDate && e.finalEndDate >= t)
            .sort((a, b) => a.finalDate.localeCompare(b.finalDate));
    },

    /** Proposals that still have a date option ending today or later. */
    get proposals() {
        const t = today();
        return this.events
            .filter((e) => e.status === 'proposed' && e.candidateDates.some((d) => this.endOf(e, d) >= t))
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

/** "/#event=ID" (e.g. from a notification) opens that event's sheet on Home. */
function openLinkedEvent() {
    const id = window.location.hash.match(/^#event=([\w-]+)$/)?.[1];
    if (!id || document.body.dataset.page !== 'home') return;
    const store = Alpine.store('planner');
    if (store.loading) return; // tried again once events arrive
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (store.events.some((e) => e.id === id)) store.open(id);
    else toast(t('That event is no longer open.'), 'error');
}
window.addEventListener('hashchange', openLinkedEvent);

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
        store.error = t('Couldn’t load events. Check your connection and refresh.');
        store.loading = false;
    };

    onSnapshot(
        query(collection(db, 'events'), where('status', 'in', ['proposed', 'confirmed'])),
        (snapshot) => {
            store.events = snapshot.docs.map(normalise);
            store.loading = false;
            store.error = null;
            syncMyVoteListeners(store.events.map((e) => e.id));
            openLinkedEvent();

            // The open event was cancelled (or deleted) by someone else.
            if (store.selectedId && !store.selected) store.close();
        },
        onError,
    );
}

/**
 * Create a proposed event. `options` are the date choices people vote on:
 * [{ start, end }] (end === start for a one-day option). Throws on validation
 * or permission errors.
 */
export async function proposeEvent({ title, description, location, options }) {
    const me = window.Planly.user;
    const sorted = [...options].sort((a, b) => a.start.localeCompare(b.start));
    const dates = sorted.map((o) => o.start);

    if (!title.trim()) throw new Error(t('Give your event a title.'));
    if (dates.length === 0) throw new Error(t('Pick at least one date.'));
    if (dates.length > LIMITS.dates) throw new Error(t('Pick at most {n} date options.', { n: LIMITS.dates }));
    sorted.forEach((o, i) => {
        if (o.end < o.start || dayCount(o.start, o.end) > LIMITS.rangeDays) throw new Error(t('A date option can be at most {n} days.', { n: LIMITS.rangeDays }));
        if (i > 0 && o.start <= sorted[i - 1].end) throw new Error(t('Date options can’t overlap.'));
    });
    const candidateEnds = Object.fromEntries(sorted.filter((o) => o.end !== o.start).map((o) => [o.start, o.end]));

    const ref = await addDoc(collection(db, 'events'), {
        title: title.trim().slice(0, LIMITS.title),
        description: description.trim().slice(0, LIMITS.description),
        location: location.trim().slice(0, LIMITS.location),
        status: 'proposed',
        proposedBy: me.uid,
        proposedByName: (me.displayName || '').slice(0, 60),
        createdAt: serverTimestamp(),
        candidateDates: dates,
        candidateEnds,
        finalDate: null,
        finalEndDate: null,
        availabilitySummary: {},
        rsvpSummary: { join: 0, notAvailable: 0 },
    });

    notify('proposal', { eventId: ref.id });
    return ref.id;
}
