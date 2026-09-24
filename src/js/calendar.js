// Dashboard calendar (FullCalendar) fed by the realtime planner store.
import Alpine from 'alpinejs';
import { startEventsFeed } from './events';
import { addDays } from './dates';

// FullCalendar is loaded on demand so pages without a calendar stay light.
const loadFullCalendar = () =>
    Promise.all([
        import('@fullcalendar/core'),
        import('@fullcalendar/daygrid'),
        import('@fullcalendar/list'),
        import('@fullcalendar/interaction'),
    ]).then(([core, dayGrid, list, interaction]) => ({
        Calendar: core.Calendar,
        plugins: [dayGrid.default, list.default, interaction.default],
    }));

const COLOURS = {
    proposed: { backgroundColor: '#fef3c7', borderColor: '#f59e0b', textColor: '#92400e' },
    confirmed: { backgroundColor: '#d1fae5', borderColor: '#10b981', textColor: '#065f46' },
};

/**
 * Map store events to FullCalendar events: proposals on every date option,
 * confirmed ones on their final day(s). FullCalendar's all-day `end` is
 * exclusive, hence the +1 day.
 */
function toCalendarEvents(store) {
    const items = [];

    for (const event of store.events) {
        if (event.status === 'confirmed' && event.finalDate) {
            items.push({
                id: event.id,
                title: event.title,
                start: event.finalDate,
                end: addDays(event.finalEndDate, 1),
                allDay: true,
                classNames: ['ev', 'ev-confirmed'],
                extendedProps: { eventId: event.id, kind: 'confirmed', star: false },
                ...COLOURS.confirmed,
            });
        }

        if (event.status === 'proposed') {
            for (const date of event.candidateDates) {
                const star = store.everyoneFree(event, date);
                items.push({
                    id: `${event.id}:${date}`,
                    title: event.title,
                    start: date,
                    end: addDays(store.endOf(event, date), 1),
                    allDay: true,
                    classNames: ['ev', 'ev-proposed', ...(star ? ['ev-star'] : [])],
                    extendedProps: { eventId: event.id, kind: 'proposed', star },
                    ...COLOURS.proposed,
                });
            }
        }
    }

    return items;
}

/** Event label built with textContent (never innerHTML) so titles can't inject markup. */
function renderEventContent(arg) {
    const { kind, star } = arg.event.extendedProps;
    const wrap = document.createElement('span');
    wrap.className = 'ev-label';

    if (star) {
        const badge = document.createElement('span');
        badge.className = 'ev-star-badge';
        badge.textContent = '⭐';
        badge.title = 'Everyone free';
        wrap.append(badge);
    }

    const title = document.createElement('span');
    title.className = 'ev-title';
    title.textContent = arg.event.title;
    wrap.append(title);

    if (kind === 'proposed') {
        const suffix = document.createElement('span');
        suffix.className = 'ev-suffix';
        suffix.textContent = ' (proposed)';
        wrap.append(suffix);
    }

    return { domNodes: [wrap] };
}

Alpine.data('calendarView', () => {
    // Kept outside Alpine's reactive state: proxying FullCalendar breaks it.
    let calendar = null;

    return {
        title: '',
        view: 'dayGridMonth',
        views: [
            { id: 'dayGridMonth', label: 'Month' },
            { id: 'dayGridWeek', label: 'Week' },
            { id: 'listMonth', label: 'List' },
        ],

        async init() {
            const store = Alpine.store('planner');
            const compact = window.matchMedia('(max-width: 639px)').matches;

            startEventsFeed();
            const { Calendar, plugins } = await loadFullCalendar();

            calendar = new Calendar(this.$refs.calendar, {
                plugins,
                initialView: this.view,
                headerToolbar: false,
                height: 'auto',
                firstDay: 0,
                fixedWeekCount: false,
                dayMaxEvents: compact ? 2 : 3,
                eventDisplay: 'block',
                eventContent: renderEventContent,
                eventClick: (info) => {
                    info.jsEvent.preventDefault();
                    store.open(info.event.extendedProps.eventId);
                },
                dateClick: (info) => {
                    window.dispatchEvent(new CustomEvent('date-selected', { detail: { date: info.dateStr } }));
                },
                datesSet: () => {
                    this.title = calendar.view.title;
                    this.view = calendar.view.type;
                },
                noEventsContent: 'Nothing planned in this period',
            });
            calendar.render();

            // Re-render whenever the store's events or member count change.
            Alpine.effect(() => {
                const items = toCalendarEvents(store);
                calendar.batchRendering(() => {
                    calendar.removeAllEvents();
                    items.forEach((item) => calendar.addEvent(item));
                });
            });
        },

        prev() {
            calendar?.prev();
        },
        next() {
            calendar?.next();
        },
        goToday() {
            calendar?.today();
        },
        changeView(id) {
            calendar?.changeView(id);
        },
    };
});
