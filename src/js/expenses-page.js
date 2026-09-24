// /expenses: shared costs of a confirmed event, like the group's "costing"
// sheet: who paid what, each person's share, and who should pay whom.
// Maths in money.js; firestore.rules guard expenses/ and settlements/.
import Alpine from 'alpinejs';
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { startEventsFeed } from './events';
import { formatRange, today } from './dates';
import { balances, formatRM, parseRM, settleUp, splitCents } from './money';
import { errorMessage } from './voting';
import { confirmDialog } from './ui';
import { locale, t } from './i18n';


export const EXPENSE_LIMITS = { item: 120, notes: 300 };

const eventRef = (eventId) => doc(db, 'events', eventId);
const paidDate = new Intl.DateTimeFormat(locale, { timeZone: window.Planly?.timezone || 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short' });
const toast = (message, type) => Alpine.store('toast').show(message, type);

const emptyForm = () => ({ id: null, item: '', amount: '', paidBy: '', splitWith: [], notes: '' });

Alpine.data('expensesPage', () => {
    // Live listeners for the shown event, outside reactive state.
    let watchedId = null;
    let unsubscribers = [];

    return {
        EXPENSE_LIMITS,
        formatRM,
        selectedId: new URLSearchParams(window.location.search).get('event'),

        expenses: [],
        settlements: [],
        joined: [], // uids who RSVP'd "Join"
        loading: true,

        form: emptyForm(),
        formOpen: false,
        formError: '',
        formBusy: false,

        init() {
            startEventsFeed();
        },

        destroy() {
            unsubscribers.forEach((u) => u());
        },

        get store() {
            return Alpine.store('planner');
        },

        get me() {
            return window.Planly.user;
        },

        // --- Which event --------------------------------------------------------

        /**
         * Confirmed events: ongoing and upcoming ones first, nearest to today
         * first; then past ones, most recent first.
         */
        get events() {
            const t = today();
            const confirmed = this.store.events.filter((e) => e.status === 'confirmed' && e.finalDate);
            const upcoming = confirmed.filter((e) => e.finalEndDate >= t).sort((a, b) => a.finalDate.localeCompare(b.finalDate));
            const past = confirmed.filter((e) => e.finalEndDate < t).sort((a, b) => b.finalDate.localeCompare(a.finalDate));
            return [...upcoming, ...past];
        },

        /** The chosen one, else the nearest upcoming (or the latest past) event. */
        get event() {
            return this.events.find((e) => e.id === this.selectedId) ?? this.events[0] ?? null;
        },

        isPast(e) {
            return e.finalEndDate < today();
        },

        select(id) {
            if (id === this.event?.id) return;
            this.selectedId = id;
            this.closeForm();
            const url = new URL(window.location.href);
            url.searchParams.set('event', id);
            window.history.replaceState(null, '', url);
        },

        when(e) {
            return formatRange(e.finalDate, e.finalEndDate);
        },

        /** Live data for the shown event (driven by x-effect). */
        sync() {
            const id = this.event?.id ?? null;
            if (id === watchedId) return;
            unsubscribers.forEach((u) => u());
            unsubscribers = [];
            watchedId = id;
            this.expenses = [];
            this.settlements = [];
            this.joined = [];
            this.loading = Boolean(id);
            if (!id) return;

            const onError = (error) => {
                console.error(error);
                this.loading = false;
                toast(t('Couldn’t load expenses.'), 'error');
            };
            const rows = (snapshot) => snapshot.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

            unsubscribers.push(onSnapshot(query(collection(eventRef(id), 'expenses'), orderBy('createdAt')), (snapshot) => {
                if (watchedId !== id) return;
                this.expenses = rows(snapshot);
                this.loading = false;
            }, onError));
            unsubscribers.push(onSnapshot(query(collection(eventRef(id), 'settlements'), orderBy('createdAt')), (snapshot) => {
                if (watchedId === id) this.settlements = rows(snapshot);
            }, onError));
            unsubscribers.push(onSnapshot(collection(eventRef(id), 'votes'), (snapshot) => {
                if (watchedId === id) this.joined = snapshot.docs.filter((d) => d.data().rsvp === 'join').map((d) => d.id);
            }, () => {}));
        },

        // --- People -------------------------------------------------------------

        get members() {
            return [...this.store.members].sort((a, b) => a.displayName.localeCompare(b.displayName));
        },

        memberName(uid) {
            if (uid === this.me.uid) return t('You');
            return this.store.members.find((m) => m.uid === uid)?.displayName ?? t('Former member');
        },

        /** Who shares a new expense by default: everyone joining, else every member. */
        get defaultSplit() {
            const approved = new Set(this.store.members.map((m) => m.uid));
            const joining = this.joined.filter((uid) => approved.has(uid));
            return joining.length ? joining : [...approved];
        },

        // --- The sheet ----------------------------------------------------------

        get rows() {
            return this.expenses.map((e, i) => ({
                ...e,
                no: i + 1,
                eachCents: Math.round(e.amountCents / Math.max(1, e.splitWith.length)),
            }));
        },

        get totalCents() {
            return this.expenses.reduce((n, e) => n + e.amountCents, 0);
        },

        get participants() {
            return new Set(this.expenses.flatMap((e) => e.splitWith));
        },

        /** Average per person, like the sheet's "Total per person". */
        get eachCents() {
            return this.participants.size ? Math.round(this.totalCents / this.participants.size) : 0;
        },

        /** Every expense shared by the same people: the per-person figure is exact, not an average. */
        get evenSplit() {
            return this.expenses.every((e) => e.splitWith.length === this.participants.size);
        },

        /** "RM158.50 each" or "RM180.00 avg" */
        get eachLabel() {
            return this.evenSplit ? t('{amount} each', { amount: formatRM(this.eachCents) }) : t('{amount} avg', { amount: formatRM(this.eachCents) });
        },

        splitLabel(e) {
            const n = e.splitWith.length;
            if (n === this.participants.size) return n === 1 ? t('{n} person', { n }) : t('{n} people', { n });
            return e.splitWith.map((uid) => this.memberName(uid)).join(', ');
        },

        canEdit(e) {
            return e.createdBy === this.me.uid || e.paidBy === this.me.uid || this.me.role === 'admin';
        },

        // --- Balances & settling up ---------------------------------------------

        get balanceRows() {
            const rows = balances(this.expenses, this.settlements);
            const max = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
            return rows.map((r) => ({ ...r, bar: Math.round((Math.abs(r.net) / max) * 100) }));
        },

        /** "Paid RM150.00 · Share RM187.16 · Sent RM37.16" */
        balanceLine(r) {
            const parts = [t('Paid {amount}', { amount: formatRM(r.paid) }), t('Share {amount}', { amount: formatRM(r.share) })];
            if (r.sent) parts.push(t('Sent {amount}', { amount: formatRM(r.sent) }));
            if (r.received) parts.push(t('Received {amount}', { amount: formatRM(r.received) }));
            return parts.join(' · ');
        },

        get myNet() {
            return this.balanceRows.find((r) => r.uid === this.me.uid)?.net ?? 0;
        },

        get transfers() {
            return settleUp(this.balanceRows);
        },

        /** The two people involved, or the admin, can say a payment happened. */
        canRecord(t) {
            return t.from === this.me.uid || t.to === this.me.uid || this.me.role === 'admin';
        },

        canUndo(s) {
            return s.createdBy === this.me.uid || this.me.role === 'admin';
        },

        paidOn(s) {
            const date = s.createdAt?.toDate?.();
            return date ? paidDate.format(date) : '';
        },

        markPaid(transfer) {
            const eventId = this.event.id;
            return confirmDialog({
                title: t('Record this payment?'),
                message: t('It counts towards settling up for everyone.'),
                detail: t('{from} paid {to}', { from: this.memberName(transfer.from), to: this.memberName(transfer.to) }),
                detailSub: formatRM(transfer.amountCents),
                confirmLabel: t('Mark as paid'),
                tone: 'success',
                icon: 'wallet',
                action: async () => {
                    try {
                        await addDoc(collection(eventRef(eventId), 'settlements'), {
                            from: transfer.from,
                            to: transfer.to,
                            amountCents: transfer.amountCents,
                            createdBy: this.me.uid,
                            createdAt: serverTimestamp(),
                        });
                        toast(t('Recorded {amount} from {from} to {to}.', { amount: formatRM(transfer.amountCents), from: this.memberName(transfer.from), to: this.memberName(transfer.to) }));
                    } catch (e) {
                        toast(errorMessage(e), 'error');
                    }
                },
            });
        },

        undoPayment(s) {
            const eventId = this.event.id;
            return confirmDialog({
                title: t('Undo this payment?'),
                message: t('The amount goes back to being owed.'),
                detail: t('{from} paid {to}', { from: this.memberName(s.from), to: this.memberName(s.to) }),
                detailSub: formatRM(s.amountCents),
                confirmLabel: t('Undo payment'),
                tone: 'danger',
                icon: 'alert',
                action: async () => {
                    try {
                        await deleteDoc(doc(eventRef(eventId), 'settlements', s.id));
                    } catch (e) {
                        toast(errorMessage(e), 'error');
                    }
                },
            });
        },

        // --- Add / edit ---------------------------------------------------------

        isEditing(id) {
            return this.formOpen && this.form.id === id;
        },

        openAdd() {
            this.formError = '';
            this.form = { ...emptyForm(), paidBy: this.me.uid, splitWith: this.defaultSplit };
            this.formOpen = true;
            this.$nextTick(() => this.$root.querySelector('[data-expense-form] input')?.focus());
        },

        openEdit(e) {
            if (!this.canEdit(e)) return;
            this.formError = '';
            this.form = {
                id: e.id,
                item: e.item,
                amount: (e.amountCents / 100).toFixed(2),
                paidBy: e.paidBy,
                splitWith: [...e.splitWith],
                notes: e.notes ?? '',
            };
            this.formOpen = true;
        },

        closeForm() {
            this.formOpen = false;
            this.form = emptyForm();
            this.formError = '';
        },

        isSplit(uid) {
            return this.form.splitWith.includes(uid);
        },

        toggleSplit(uid) {
            this.form.splitWith = this.isSplit(uid)
                ? this.form.splitWith.filter((u) => u !== uid)
                : [...this.form.splitWith, uid];
        },

        get allSplit() {
            return this.members.every((m) => this.isSplit(m.uid));
        },

        splitEveryone() {
            this.form.splitWith = this.allSplit ? [] : this.members.map((m) => m.uid);
        },

        /** "RM67.50 each" preview while typing. */
        get formEach() {
            const cents = parseRM(this.form.amount);
            const people = this.form.splitWith.length;
            if (!cents || !people) return '';
            const shares = [...splitCents(cents, this.form.splitWith).values()];
            const low = Math.min(...shares);
            const high = Math.max(...shares);
            return t('{amount} each · {people}', { amount: low === high ? formatRM(low) : `${formatRM(low)}–${formatRM(high)}`, people: people === 1 ? t('{n} person', { n: people }) : t('{n} people', { n: people }) });
        },

        async save() {
            if (this.formBusy || !this.event) return;
            const f = this.form;
            const amountCents = parseRM(f.amount);
            if (!f.item.trim()) return (this.formError = t('What was it for?'));
            if (!amountCents) return (this.formError = t('Enter an amount, like 12.50.'));
            if (amountCents > 100000000) return (this.formError = t('That amount is too large.'));
            if (!f.paidBy) return (this.formError = t('Who paid?'));
            if (f.splitWith.length === 0) return (this.formError = t('Pick at least one person to split with.'));

            const data = {
                item: f.item.trim().slice(0, EXPENSE_LIMITS.item),
                amountCents,
                paidBy: f.paidBy,
                splitWith: [...new Set(f.splitWith)],
                notes: f.notes.trim().slice(0, EXPENSE_LIMITS.notes),
            };

            this.formBusy = true;
            this.formError = '';
            try {
                if (f.id) {
                    await updateDoc(doc(eventRef(this.event.id), 'expenses', f.id), data);
                    this.closeForm();
                } else {
                    await addDoc(collection(eventRef(this.event.id), 'expenses'), {
                        ...data,
                        createdBy: this.me.uid,
                        createdAt: serverTimestamp(),
                    });
                    // Ready for the next line, like the sheet (payer and split kept).
                    this.form = { ...emptyForm(), paidBy: f.paidBy, splitWith: f.splitWith };
                    this.$nextTick(() => this.$root.querySelector('[data-expense-form] input')?.focus());
                }
            } catch (e) {
                this.formError = errorMessage(e);
            } finally {
                this.formBusy = false;
            }
        },

        remove() {
            const f = this.form;
            if (!f.id || !this.event) return;
            const eventId = this.event.id;
            return confirmDialog({
                title: t('Remove this expense?'),
                message: t('Everyone’s shares are recalculated.'),
                detail: f.item,
                detailSub: t('{amount} · paid by {name}', { amount: formatRM(parseRM(f.amount) ?? 0), name: this.memberName(f.paidBy) }),
                confirmLabel: t('Remove'),
                tone: 'danger',
                icon: 'trash',
                action: async () => {
                    try {
                        await deleteDoc(doc(eventRef(eventId), 'expenses', f.id));
                        this.closeForm();
                    } catch (e) {
                        this.formError = errorMessage(e);
                    }
                },
            });
        },

        // --- Share --------------------------------------------------------------

        /** Plain-text summary for the group chat / WhatsApp. */
        get summaryText() {
            const e = this.event;
            const name = (uid) => (uid === this.me.uid ? this.me.displayName : this.memberName(uid));
            const lines = [`${e.title} (${this.when(e)}): ${t('expenses')}`, ''];
            this.rows.forEach((r) => lines.push(`${r.no}. ${r.item}: ${formatRM(r.amountCents)} (${name(r.paidBy)})`));
            lines.push('', `${t('Total')}: ${formatRM(this.totalCents)} · ${this.eachLabel} (${t('{n} people', { n: this.participants.size })})`);
            if (this.transfers.length) {
                lines.push('', t('To settle up:'));
                this.transfers.forEach((t) => lines.push(`${name(t.from)} → ${name(t.to)}: ${formatRM(t.amountCents)}`));
            } else if (this.expenses.length) {
                lines.push('', t('All settled up ✅'));
            }
            return lines.join('\n');
        },

        async copySummary() {
            try {
                await navigator.clipboard.writeText(this.summaryText);
                toast(t('Summary copied. Paste it in the chat or WhatsApp.'));
            } catch {
                toast(t('Couldn’t copy. Your browser blocked it.'), 'error');
            }
        },
    };
});
