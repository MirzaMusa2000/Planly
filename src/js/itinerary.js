// Itineraries of confirmed events. Any approved member can add, edit, delete
// and reorder items. The editing logic (itineraryEditor) is shared by the day
// panel on the dashboard and the Itinerary page.
import Alpine from 'alpinejs';
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    orderBy,
    query,
    updateDoc,
    where,
    writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { addDays, daysInRange, format, today, toUtcDate } from './dates';
import { errorMessage } from './voting';
import { confirmDialog } from './ui';
import { t } from './i18n';
import { sameExpiryAs } from './retention';

export const ITEM_LIMITS = { activity: 200, location: 200, notes: 1000 };

// Pastel blocks, cycled per item (like the mockup's timeline).
const PALETTE = [
    'bg-brand-50 border-brand-400 text-brand-800',
    'bg-emerald-50 border-emerald-400 text-emerald-800',
    'bg-rose-50 border-rose-400 text-rose-800',
    'bg-amber-50 border-amber-400 text-amber-800',
    'bg-violet-50 border-violet-400 text-violet-800',
    'bg-sky-50 border-sky-400 text-sky-800',
];

const emptyForm = () => ({ id: null, eventId: null, date: null, startTime: '', endTime: '', activity: '', location: '', notes: '' });

const itineraryRef = (eventId) => collection(db, 'events', eventId, 'itinerary');

/**
 * State and methods for showing and editing event itineraries, mixed into an
 * Alpine component. A multi-day event has one itinerary per day, so items are
 * keyed by event and day. Templates use partials/itinerary-timeline.html with
 * `e` (a confirmed event) and `day` (one of its dates) in scope.
 */
export function itineraryEditor() {
    // Outside reactive state: listener handles. Key "eventId|date".
    const listeners = new Map();

    return {
        ITEM_LIMITS,
        items: {}, // "eventId|date" -> items, sorted by startTime, order
        form: emptyForm(),
        formError: '',
        busy: false,

        /** Keep exactly one live listener per [eventId, date] pair. */
        watchItineraries(pairs) {
            const wanted = new Set(pairs.map(([eventId, date]) => `${eventId}|${date}`));

            for (const [key, unsubscribe] of listeners) {
                if (!wanted.has(key)) {
                    unsubscribe();
                    listeners.delete(key);
                }
            }

            for (const key of wanted) {
                if (listeners.has(key)) continue;
                const [eventId, date] = key.split('|');
                const q = query(itineraryRef(eventId), where('date', '==', date), orderBy('startTime'), orderBy('order'));

                listeners.set(key, onSnapshot(q, (snapshot) => {
                    if (!listeners.has(key)) return; // stale listener
                    this.items = {
                        ...this.items,
                        [key]: snapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
                    };
                }, (error) => {
                    console.error(error);
                    Alpine.store('toast').show(t('Couldn’t load the itinerary.'), 'error');
                }));
            }
        },

        itemsFor(eventId, day) {
            return this.items[`${eventId}|${day}`] ?? [];
        },

        isLoading(eventId, day) {
            return !(`${eventId}|${day}` in this.items);
        },

        /** All items of an event across its days (for counts). */
        itemCount(eventId) {
            return Object.entries(this.items)
                .filter(([key]) => key.startsWith(`${eventId}|`))
                .reduce((n, [, list]) => n + list.length, 0);
        },

        colour(index) {
            return PALETTE[index % PALETTE.length];
        },

        timeRange(item) {
            return item.endTime ? `${item.startTime} – ${item.endTime}` : item.startTime;
        },

        addedBy(item) {
            return Alpine.store('planner').members.find((m) => m.uid === item.createdBy)?.displayName ?? '';
        },

        // --- Add / edit -------------------------------------------------------

        isEditing(eventId, day, itemId = null) {
            return this.form.eventId === eventId && this.form.date === day && this.form.id === itemId;
        },

        /** A new item on one of the event's confirmed days. */
        startAdd(event, day) {
            const items = this.itemsFor(event.id, day);
            const last = items[items.length - 1];
            this.formError = '';
            this.form = {
                ...emptyForm(),
                eventId: event.id,
                date: day,
                startTime: last?.endTime || last?.startTime || '09:00',
            };
            this.$nextTick(() => this.$root.querySelector('[data-item-form] input[type=time]')?.focus());
        },

        startEdit(eventId, item) {
            this.formError = '';
            this.form = {
                id: item.id,
                eventId,
                date: item.date,
                startTime: item.startTime,
                endTime: item.endTime ?? '',
                activity: item.activity,
                location: item.location ?? '',
                notes: item.notes ?? '',
            };
        },

        cancelForm() {
            this.form = emptyForm();
            this.formError = '';
        },

        validate() {
            const f = this.form;
            if (!/^\d{2}:\d{2}$/.test(f.startTime)) return t('Pick a start time.');
            if (f.endTime && f.endTime <= f.startTime) return t('End time must be after the start time.');
            if (!f.activity.trim()) return t('What’s the activity?');
            return '';
        },

        async save() {
            if (this.busy) return;
            this.formError = this.validate();
            if (this.formError) return;

            const f = this.form;
            const data = {
                startTime: f.startTime,
                endTime: f.endTime || null,
                activity: f.activity.trim().slice(0, ITEM_LIMITS.activity),
                location: f.location.trim().slice(0, ITEM_LIMITS.location),
                notes: f.notes.trim().slice(0, ITEM_LIMITS.notes),
            };

            this.busy = true;
            try {
                if (f.id) {
                    await updateDoc(doc(itineraryRef(f.eventId), f.id), data);
                } else {
                    const orders = this.itemsFor(f.eventId, f.date).map((i) => i.order ?? 0);
                    await addDoc(itineraryRef(f.eventId), {
                        ...data,
                        date: f.date,
                        order: orders.length ? Math.max(...orders) + 1 : 0,
                        createdBy: window.Planly.user.uid,
                        ...sameExpiryAs(Alpine.store('planner').events.find((e) => e.id === f.eventId)),
                    });
                }
                this.cancelForm();
            } catch (e) {
                this.formError = errorMessage(e);
            } finally {
                this.busy = false;
            }
        },

        remove(eventId, item) {
            return confirmDialog({
                title: t('Remove from the plan?'),
                message: t('It’s removed from the itinerary for everyone.'),
                detail: item.activity,
                detailSub: [this.timeRange(item), item.location].filter(Boolean).join(' · '),
                confirmLabel: t('Remove'),
                tone: 'danger',
                icon: 'trash',
                action: async () => {
                    try {
                        await deleteDoc(doc(itineraryRef(eventId), item.id));
                        if (this.form.id === item.id) this.cancelForm();
                    } catch (e) {
                        Alpine.store('toast').show(errorMessage(e), 'error');
                    }
                },
            });
        },

        // --- Reorder (items are sorted by start time, then order) --------------

        canMove(eventId, day, index, dir) {
            const items = this.itemsFor(eventId, day);
            const other = items[index + dir];
            return Boolean(other) && other.startTime === items[index].startTime;
        },

        async move(eventId, day, index, dir) {
            if (!this.canMove(eventId, day, index, dir)) return;
            const items = this.itemsFor(eventId, day);
            const a = items[index];
            const b = items[index + dir];
            // Same order values (e.g. legacy data) would make a swap a no-op.
            const [orderA, orderB] = a.order === b.order ? [index, index + dir] : [a.order, b.order];

            try {
                const batch = writeBatch(db);
                batch.update(doc(itineraryRef(eventId), a.id), { order: orderB });
                batch.update(doc(itineraryRef(eventId), b.id), { order: orderA });
                await batch.commit();
            } catch (e) {
                Alpine.store('toast').show(errorMessage(e), 'error');
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Day panel: what's on a date, plus the itinerary of each confirmed event
// that day.
// ---------------------------------------------------------------------------
Alpine.data('dayPanel', () => ({
    ...itineraryEditor(),
    open: false,
    date: null,

    init() {
        window.addEventListener('date-selected', (e) => this.show(e.detail.date));
        window.addEventListener('open-day', (e) => this.show(e.detail.date));
    },

    get store() {
        return Alpine.store('planner');
    },

    show(date) {
        this.cancelForm();
        if (date !== this.date) this.items = {}; // don't flash the previous day's plan
        this.date = date;
        this.open = true;
    },

    close() {
        this.cancelForm();
        this.open = false;
    },

    /** Escape closes the top layer only: an overlay above us, then the form, then the panel. */
    onEscape() {
        const overlays = Alpine.store('overlays');
        if (!this.open || overlays.propose || overlays.chat || overlays.dialog || this.store.selected) return;
        if (this.form.eventId) this.cancelForm();
        else this.close();
    },

    shiftDay(n) {
        this.show(addDays(this.date, n));
    },

    // --- What's on a day ------------------------------------------------------

    eventsOn(date) {
        return this.store.events.filter((e) =>
            (e.status === 'confirmed' && e.finalDate <= date && date <= e.finalEndDate)
            || (e.status === 'proposed' && this.store.optionAt(e, date)));
    },

    /** "Day 2 of 3" for a multi-day event, else ''. */
    dayOf(event, date) {
        const days = daysInRange(event.finalDate, event.finalEndDate);
        return days.length > 1 ? t('Day {n} of {total}', { n: days.indexOf(date) + 1, total: days.length }) : '';
    },

    get confirmedEvents() {
        return this.eventsOn(this.date).filter((e) => e.status === 'confirmed');
    },

    get proposedEvents() {
        return this.eventsOn(this.date).filter((e) => e.status === 'proposed');
    },

    get isEmpty() {
        return this.eventsOn(this.date).length === 0;
    },

    get isPast() {
        return this.date < today();
    },

    /** "Saturday, 10 October" (the year is omitted to fit phone widths). */
    get title() {
        return this.date ? format(this.date, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    },

    /** Sunday..Saturday of the selected date's week. */
    get week() {
        if (!this.date) return [];
        const start = addDays(this.date, -toUtcDate(this.date).getUTCDay());
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    },

    weekday: (d) => format(d, { weekday: 'short' }),
    dayNumber: (d) => Number(d.slice(8)),

    dotClass(date) {
        const events = this.eventsOn(date);
        if (events.some((e) => e.status === 'confirmed')) return 'bg-emerald-500';
        if (events.length) return 'bg-amber-400';
        return 'bg-transparent';
    },

    /** Live itinerary listeners (driven by x-effect). */
    syncListeners() {
        this.watchItineraries(this.open && this.date ? this.confirmedEvents.map((e) => [e.id, this.date]) : []);
    },

    proposeOnThisDay() {
        window.dispatchEvent(new CustomEvent('propose-event', { detail: { date: this.date } }));
    },
}));
