// "Propose event" sheet with a multi-date picker.
import Alpine from 'alpinejs';
import { format, formatShort, monthGrid, today, toUtcDate } from './dates';
import { LIMITS, proposeEvent } from './events';

Alpine.data('proposeModal', () => ({
    LIMITS,
    open: false,
    busy: false,
    error: '',
    title: '',
    description: '',
    location: '',
    dates: [],
    cursor: { year: 0, month: 0 },

    init() {
        this.$watch('open', (value) => (Alpine.store('overlays').propose = value));

        // Opened from the calendar, sidebar, mobile "+" and the day panel's
        // "propose on this date" shortcut (which passes the date).
        window.addEventListener('propose-event', (e) => this.show(e.detail?.date));

        if (window.location.hash === '#propose') {
            history.replaceState(null, '', window.location.pathname + window.location.search);
            this.show();
        }
    },

    show(date = null) {
        const t = today();
        const start = date && date >= t ? date : null;

        this.error = '';
        this.title = '';
        this.description = '';
        this.location = '';
        this.dates = start ? [start] : [];
        this.setCursor(start ?? t);
        this.open = true;
    },

    close() {
        if (!this.busy) this.open = false;
    },

    setCursor(dateString) {
        const d = toUtcDate(dateString);
        this.cursor = { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    },

    /** Flat list of the month's grid cells (null = padding). */
    get days() {
        return monthGrid(this.cursor.year, this.cursor.month).flat();
    },

    get monthLabel() {
        return format(`${this.cursor.year}-${String(this.cursor.month + 1).padStart(2, '0')}-01`, {
            month: 'long',
            year: 'numeric',
        });
    },

    get canGoBack() {
        const t = toUtcDate(today());
        return this.cursor.year > t.getUTCFullYear()
            || (this.cursor.year === t.getUTCFullYear() && this.cursor.month > t.getUTCMonth());
    },

    shiftMonth(delta) {
        const m = this.cursor.month + delta;
        this.cursor = { year: this.cursor.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    },

    isPast(date) {
        return date < today();
    },

    isToday(date) {
        return date === today();
    },

    isSelected(date) {
        return this.dates.includes(date);
    },

    toggle(date) {
        if (!date || this.isPast(date)) return;
        this.error = '';
        if (this.isSelected(date)) {
            this.dates = this.dates.filter((d) => d !== date);
        } else if (this.dates.length >= LIMITS.dates) {
            this.error = `You can pick up to ${LIMITS.dates} dates.`;
        } else {
            this.dates = [...this.dates, date].sort();
        }
    },

    dayNumber(date) {
        return Number(date.slice(8));
    },

    formatShort,

    async submit() {
        if (this.busy) return;
        this.error = '';
        this.busy = true;

        try {
            await proposeEvent({
                title: this.title,
                description: this.description,
                location: this.location,
                candidateDates: this.dates,
            });
            this.busy = false;
            this.open = false;
            Alpine.store('toast').show('Event proposed! Friends can now vote on dates.');
        } catch (e) {
            this.error = e?.code === 'permission-denied'
                ? 'You don’t have permission to propose events. Try signing out and in again.'
                : e?.message || 'Couldn’t save the event. Please try again.';
            this.busy = false;
        }
    },
}));
