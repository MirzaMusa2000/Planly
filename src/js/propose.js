// "Propose event" sheet with a date-option picker. Each option people vote on
// is one day, or several consecutive days (e.g. a Fri–Sun camping trip).
import Alpine from 'alpinejs';
import { dayCount, daysInRange, format, formatRange, formatShort, monthGrid, today, toUtcDate } from './dates';
import { LIMITS, proposeEvent } from './events';
import { t } from './i18n';

Alpine.data('proposeModal', () => ({
    LIMITS,
    open: false,
    busy: false,
    error: '',
    title: '',
    description: '',
    location: '',
    mode: 'day', // 'day': each tap is an option · 'range': tap the first, then the last day
    options: [], // [{ start, end }] sorted, never overlapping
    rangeStart: null, // first tap of a range in progress
    hover: null, // date under the pointer (range preview)
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
        this.mode = 'day';
        this.options = start ? [{ start, end: start }] : [];
        this.rangeStart = null;
        this.hover = null;
        this.setCursor(start ?? t);
        this.open = true;
    },

    close() {
        if (!this.busy) this.open = false;
    },

    setMode(mode) {
        this.mode = mode;
        this.rangeStart = null;
        this.error = '';
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

    get hint() {
        if (this.mode === 'day') return t('Tap every date that could work.');
        if (!this.rangeStart) return t('Tap the first day, then the last day. Add as many options as you like.');
        return t('From {date}: now tap the last day (or the same day again for one day).', { date: formatShort(this.rangeStart) });
    },

    isPast(date) {
        return date < today();
    },

    isToday(date) {
        return date === today();
    },

    optionAt(date) {
        return this.options.find((o) => o.start <= date && date <= o.end) ?? null;
    },

    /** The range the pointer would create (desktop preview). */
    get preview() {
        if (!this.rangeStart || !this.hover || this.hover < this.rangeStart) return null;
        return { start: this.rangeStart, end: this.hover, ok: this.rangeProblem(this.rangeStart, this.hover) === '' };
    },

    rangeProblem(start, end) {
        if (dayCount(start, end) > LIMITS.rangeDays) return t('An option can be at most {n} days.', { n: LIMITS.rangeDays });
        if (daysInRange(start, end).some((d) => this.optionAt(d))) return t('Options can’t overlap. Remove the other one first.');
        return '';
    },

    /** Classes for one calendar cell. */
    cellClass(date) {
        if (this.isPast(date)) return 'rounded-xl text-slate-600 cursor-not-allowed';

        const option = this.optionAt(date);
        if (option) {
            if (option.start === option.end) return 'rounded-xl bg-brand-500 font-bold text-white shadow-lift';
            if (date === option.start) return 'rounded-l-xl bg-brand-500 font-bold text-white';
            if (date === option.end) return 'rounded-r-xl bg-brand-500 font-bold text-white';
            return 'bg-brand-500/35 font-semibold text-white';
        }
        if (date === this.rangeStart) return 'rounded-xl bg-brand-400 font-bold text-white ring-2 ring-brand-200 ring-offset-2 ring-offset-ink-800';

        const p = this.preview;
        if (p && p.start <= date && date <= p.end) {
            const ends = `${date === p.end ? 'rounded-r-xl' : ''}`;
            return p.ok ? `${ends} bg-brand-500/20 text-brand-100` : `${ends} bg-rose-500/20 text-rose-200`;
        }
        return `rounded-xl text-slate-200 hover:bg-white/10 ${this.isToday(date) ? 'ring-1 ring-brand-400' : ''}`;
    },

    tap(date) {
        if (!date || this.isPast(date)) return;
        this.error = '';

        // Tapping a chosen option removes it (in either mode).
        const existing = this.optionAt(date);
        if (existing && !this.rangeStart) {
            this.remove(existing);
            return;
        }

        if (this.mode === 'day') return this.add({ start: date, end: date });

        if (!this.rangeStart || date < this.rangeStart) {
            if (existing) return; // can't start inside another option
            this.rangeStart = date;
            return;
        }

        const problem = this.rangeProblem(this.rangeStart, date);
        if (problem) {
            this.error = `${problem} ${t('Pick the first day again.')}`;
            this.rangeStart = null;
            return;
        }
        this.add({ start: this.rangeStart, end: date });
        this.rangeStart = null;
        this.hover = null;
    },

    add(option) {
        if (this.options.length >= LIMITS.dates) {
            this.error = t('You can add up to {n} date options.', { n: LIMITS.dates });
            return;
        }
        this.options = [...this.options, option].sort((a, b) => a.start.localeCompare(b.start));
    },

    remove(option) {
        this.options = this.options.filter((o) => o !== option);
    },

    optionLabel(option) {
        return formatRange(option.start, option.end);
    },

    optionDays(option) {
        return dayCount(option.start, option.end);
    },

    cellLabel(date) {
        const option = this.optionAt(date);
        return option ? t('{date}, selected ({option})', { date: formatShort(date), option: this.optionLabel(option) }) : formatShort(date);
    },

    dayNumber(date) {
        return Number(date.slice(8));
    },

    get submitLabel() {
        if (this.busy) return t('Saving…');
        return this.options.length > 1 ? t('Propose {n} options', { n: this.options.length }) : t('Propose event');
    },

    async submit() {
        if (this.busy) return;
        this.error = '';
        this.busy = true;

        try {
            await proposeEvent({
                title: this.title,
                description: this.description,
                location: this.location,
                options: this.options,
            });
            this.busy = false;
            this.open = false;
            Alpine.store('toast').show(t('Event proposed! Friends can now vote on dates.'));
        } catch (e) {
            this.error = e?.code === 'permission-denied'
                ? t('You don’t have permission to propose events. Try signing out and in again.')
                : e?.message || t('Couldn’t save the event. Please try again.');
            this.busy = false;
        }
    },
}));
