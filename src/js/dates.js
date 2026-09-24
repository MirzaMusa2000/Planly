// Date helpers. App dates are "YYYY-MM-DD" strings in the app timezone
// (Asia/Kuala_Lumpur). To avoid off-by-one-day bugs, date strings are only
// ever turned into Date objects at UTC midnight and formatted in UTC.

import { locale } from './i18n';

const TIMEZONE = window.Planly?.timezone || 'Asia/Kuala_Lumpur';

const pad = (n) => String(n).padStart(2, '0');

/** Today's date in the app timezone, as YYYY-MM-DD. */
export function today() {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}

export function isDateString(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function toUtcDate(dateString) {
    const [y, m, d] = dateString.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

export function fromParts(year, monthIndex, day) {
    return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

export function addDays(dateString, days) {
    const date = toUtcDate(dateString);
    date.setUTCDate(date.getUTCDate() + days);
    return fromParts(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Format a YYYY-MM-DD string, e.g. format(d, { weekday: 'short', day: 'numeric', month: 'short' }). */
export function format(dateString, options) {
    // Templates often format optional fields (e.g. finalDate is null while proposed).
    if (!isDateString(dateString)) return '';
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(toUtcDate(dateString));
}

export const formatShort = (d) => format(d, { weekday: 'short', day: 'numeric', month: 'short' });
export const formatLong = (d) => format(d, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** Every date from start to end, inclusive. */
export function daysInRange(start, end) {
    const days = [];
    for (let d = start; d <= (end || start); d = addDays(d, 1)) days.push(d);
    return days;
}

export const dayCount = (start, end) => daysInRange(start, end).length;

/** "Fri, 2 Oct" · "Fri–Sun, 1–3 Oct" · "Wed 30 Sept – Fri 2 Oct" */
export function formatRange(start, end) {
    if (!end || end === start) return formatShort(start);
    const weekday = (d) => format(d, { weekday: 'short' });
    const day = (d) => format(d, { day: 'numeric' });
    const month = (d) => format(d, { month: 'short' });
    if (start.slice(0, 7) === end.slice(0, 7)) return `${weekday(start)}–${weekday(end)}, ${day(start)}–${day(end)} ${month(end)}`;
    return `${weekday(start)} ${day(start)} ${month(start)} – ${weekday(end)} ${day(end)} ${month(end)}`;
}

/** "Friday, 2 October 2026" · "Friday 2 – Sunday 4 October 2026" · across months/years. */
export function formatRangeLong(start, end) {
    if (!end || end === start) return formatLong(start);
    // Weekday then day, the same way round in both languages.
    const dayName = (d) => `${format(d, { weekday: 'long' })} ${format(d, { day: 'numeric' })}`;
    if (start.slice(0, 7) === end.slice(0, 7)) return `${dayName(start)} – ${dayName(end)} ${format(end, { month: 'long', year: 'numeric' })}`;
    const withMonth = (d) => `${dayName(d)} ${format(d, { month: 'long' })}`;
    if (start.slice(0, 4) === end.slice(0, 4)) return `${withMonth(start)} – ${withMonth(end)} ${end.slice(0, 4)}`;
    return `${formatLong(start)} – ${formatLong(end)}`;
}

/**
 * Weeks for a month grid (Sunday first). Days outside the month are null.
 * @returns {Array<Array<string|null>>}
 */
export function monthGrid(year, monthIndex) {
    const first = new Date(Date.UTC(year, monthIndex, 1));
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const cells = Array(first.getUTCDay()).fill(null);

    for (let day = 1; day <= daysInMonth; day++) {
        cells.push(fromParts(year, monthIndex, day));
    }
    while (cells.length % 7) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}
