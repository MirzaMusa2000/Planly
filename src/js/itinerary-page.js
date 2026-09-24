// /itinerary: the itinerary and the shared checklist ("who brings what") of
// upcoming confirmed events. Any approved member can edit both; firestore.rules
// guards the checklist like the itinerary.
import Alpine from 'alpinejs';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { startEventsFeed } from './events';
import { itineraryEditor } from './itinerary';
import { daysInRange, format, today, toUtcDate } from './dates';
import { errorMessage } from './voting';
import { confirmDialog } from './ui';

export const CHECKLIST_LIMITS = { item: 120, quantity: 40, notes: 500 };

const checklistRef = (eventId) => collection(db, 'events', eventId, 'checklist');

const emptyListForm = () => ({ id: null, item: '', quantity: '', picUid: '', notes: '' });

const toast = (message, type) => Alpine.store('toast').show(message, type);

Alpine.data('itineraryPage', () => {
    let checklistEventId = null;
    let unsubscribeChecklist = null;

    return {
        ...itineraryEditor(),
        CHECKLIST_LIMITS,
        selectedId: new URLSearchParams(window.location.search).get('event'),

        checklist: [],
        checklistLoading: true,
        filter: 'all', // 'all' | 'todo' | 'mine'
        listForm: emptyListForm(),
        listFormOpen: false,
        listError: '',
        listBusy: false,
        toggling: {}, // itemId -> true while its status is saving

        init() {
            startEventsFeed();
        },

        destroy() {
            unsubscribeChecklist?.();
        },

        get store() {
            return Alpine.store('planner');
        },

        /** Confirmed events not over yet, soonest first. */
        get events() {
            return this.store.upcoming;
        },

        get event() {
            return this.events.find((e) => e.id === this.selectedId) ?? this.events[0] ?? null;
        },

        select(id) {
            if (id === this.event?.id) return;
            this.selectedId = id;
            this.cancelForm();
            this.closeListForm();
            this.filter = 'all';
            const url = new URL(window.location.href);
            url.searchParams.set('event', id);
            window.history.replaceState(null, '', url);
        },

        /** Live listeners for the shown event (driven by x-effect). */
        sync() {
            const e = this.event;
            this.watchItineraries(e ? this.eventDays(e).map((day) => [e.id, day]) : []);
            this.watchChecklist(e?.id ?? null);
        },

        // --- Event header -------------------------------------------------------

        eventDays(e) {
            return daysInRange(e.finalDate, e.finalEndDate);
        },

        isMultiDay(e) {
            return e.finalEndDate !== e.finalDate;
        },

        /** "Day 2 · Sat 3 Oct" */
        dayHeading(e, day) {
            return `Day ${this.eventDays(e).indexOf(day) + 1} · ${format(day, { weekday: 'short', day: 'numeric', month: 'short' })}`;
        },

        countdown(e) {
            const t = today();
            if (e.finalDate <= t && t <= e.finalEndDate) {
                return this.isMultiDay(e) ? `Happening now · Day ${this.eventDays(e).indexOf(t) + 1}` : 'Today';
            }
            const days = Math.round((toUtcDate(e.finalDate) - toUtcDate(t)) / 86_400_000);
            if (days === 1) return 'Tomorrow';
            return `In ${days} days`;
        },

        /** "Oct" or "Sept–Oct" for the date badge. */
        monthBadge(e) {
            const month = (d) => format(d, { month: 'short' });
            return e.finalDate.slice(0, 7) === e.finalEndDate.slice(0, 7) ? month(e.finalDate) : `${month(e.finalDate)}–${month(e.finalEndDate)}`;
        },

        /** "2" or "2–4" for the date badge. */
        dayBadge(e) {
            const day = (d) => format(d, { day: 'numeric' });
            return this.isMultiDay(e) ? `${day(e.finalDate)}–${day(e.finalEndDate)}` : day(e.finalDate);
        },

        memberName(uid) {
            return this.store.members.find((m) => m.uid === uid)?.displayName ?? '';
        },

        get sortedMembers() {
            return [...this.store.members].sort((a, b) => a.displayName.localeCompare(b.displayName));
        },

        // --- Checklist ----------------------------------------------------------

        watchChecklist(eventId) {
            if (eventId === checklistEventId) return;
            unsubscribeChecklist?.();
            unsubscribeChecklist = null;
            checklistEventId = eventId;
            this.checklist = [];
            this.checklistLoading = Boolean(eventId);
            if (!eventId) return;

            unsubscribeChecklist = onSnapshot(query(checklistRef(eventId), orderBy('order')), (snapshot) => {
                if (checklistEventId !== eventId) return;
                this.checklist = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
                this.checklistLoading = false;
            }, (error) => {
                console.error(error);
                this.checklistLoading = false;
                toast('Couldn’t load the checklist.', 'error');
            });
        },

        get doneCount() {
            return this.checklist.filter((i) => i.done).length;
        },

        get progress() {
            return this.checklist.length ? Math.round((this.doneCount / this.checklist.length) * 100) : 0;
        },

        get mineCount() {
            return this.checklist.filter((i) => i.picUid === window.Planly.user.uid && !i.done).length;
        },

        /** Rows with their number ("No" column) kept from the full list. */
        get rows() {
            const me = window.Planly.user.uid;
            return this.checklist
                .map((item, index) => ({ ...item, no: index + 1 }))
                .filter((i) => this.filter === 'all'
                    || (this.filter === 'todo' && !i.done)
                    || (this.filter === 'mine' && i.picUid === me));
        },

        get emptyFilterText() {
            return this.filter === 'mine' ? 'Nothing assigned to you.' : 'Everything’s done! 🎉';
        },

        isEditingRow(id) {
            return this.listFormOpen && this.listForm.id === id;
        },

        openAdd() {
            this.listError = '';
            this.listForm = emptyListForm();
            this.listFormOpen = true;
            this.$nextTick(() => this.$root.querySelector('[data-checklist-form] input')?.focus());
        },

        openEdit(row) {
            this.listError = '';
            this.listForm = {
                id: row.id,
                item: row.item,
                quantity: row.quantity ?? '',
                picUid: row.picUid ?? '',
                notes: row.notes ?? '',
            };
            this.listFormOpen = true;
        },

        closeListForm() {
            this.listFormOpen = false;
            this.listForm = emptyListForm();
            this.listError = '';
        },

        async saveListItem() {
            if (this.listBusy || !this.event) return;
            const f = this.listForm;
            if (!f.item.trim()) {
                this.listError = 'What’s the item?';
                return;
            }

            const data = {
                item: f.item.trim().slice(0, CHECKLIST_LIMITS.item),
                quantity: f.quantity.trim().slice(0, CHECKLIST_LIMITS.quantity),
                picUid: f.picUid || null,
                notes: f.notes.trim().slice(0, CHECKLIST_LIMITS.notes),
            };

            this.listBusy = true;
            this.listError = '';
            try {
                if (f.id) {
                    await updateDoc(doc(checklistRef(this.event.id), f.id), data);
                    this.closeListForm();
                } else {
                    const orders = this.checklist.map((i) => i.order ?? 0);
                    await addDoc(checklistRef(this.event.id), {
                        ...data,
                        done: false,
                        order: orders.length ? Math.max(...orders) + 1 : 0,
                        createdBy: window.Planly.user.uid,
                    });
                    // Keep the form open for the next item, like adding rows in a sheet.
                    this.listForm = emptyListForm();
                    this.$nextTick(() => this.$root.querySelector('[data-checklist-form] input')?.focus());
                }
            } catch (e) {
                this.listError = errorMessage(e);
            } finally {
                this.listBusy = false;
            }
        },

        async toggleDone(row) {
            if (this.toggling[row.id] || !this.event) return;
            this.toggling = { ...this.toggling, [row.id]: true };
            try {
                await updateDoc(doc(checklistRef(this.event.id), row.id), { done: !row.done });
            } catch (e) {
                toast(errorMessage(e), 'error');
            } finally {
                const { [row.id]: _, ...rest } = this.toggling;
                this.toggling = rest;
            }
        },

        removeListItem() {
            const f = this.listForm;
            if (!f.id || !this.event) return;
            const eventId = this.event.id;
            return confirmDialog({
                title: 'Remove from the checklist?',
                message: 'It’s removed for everyone.',
                detail: f.item,
                detailSub: [f.quantity && `Qty ${f.quantity}`, this.memberName(f.picUid)].filter(Boolean).join(' · '),
                confirmLabel: 'Remove',
                tone: 'danger',
                icon: 'trash',
                action: async () => {
                    try {
                        await deleteDoc(doc(checklistRef(eventId), f.id));
                        this.closeListForm();
                    } catch (e) {
                        this.listError = errorMessage(e);
                    }
                },
            });
        },
    };
});
