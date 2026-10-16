// "Excel" buttons: an event's expenses or checklist as an .xlsx file, made in
// the browser (no server). ExcelJS (~1 MB) loads only when someone exports.
import { formatRange } from './dates';
import { kindOf } from './kinds';
import { locale, t } from './i18n';

const exportedOn = () => new Intl.DateTimeFormat(locale, {
    timeZone: window.Planly?.timezone || 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric',
}).format(new Date());

const describe = (event) => ({
    title: `${kindOf(event).emoji} ${event.title}`,
    when: event.finalDate ? formatRange(event.finalDate, event.finalEndDate ?? event.finalDate) : '',
    location: event.location ?? '',
});

async function save(build, name) {
    const [{ default: ExcelJS }, sheets] = await Promise.all([import('exceljs'), import('./xlsx-sheets.js')]);
    const workbook = build(ExcelJS, sheets);
    const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const fileName = (title, what) => {
    const clean = (s) => String(s).replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    return `Planly - ${clean(title)} - ${clean(what)}.xlsx`;
};

/** Expenses, balances (live formulas), payments and settle-up. */
export function downloadExpenses({ event, members, expenses, settlements, paidDate }) {
    return save((ExcelJS, { expensesWorkbook }) => expensesWorkbook(ExcelJS, {
        event: describe(event),
        exportedOn: exportedOn(),
        members,
        expenses: expenses.map((e) => ({ item: e.item, amountCents: e.amountCents, paidBy: e.paidBy, splitWith: e.splitWith ?? [], notes: e.notes ?? '' })),
        settlements: settlements.map((s) => ({ from: s.from, to: s.to, amountCents: s.amountCents, date: paidDate(s) })),
        t,
    }), fileName(event.title, t('Expenses')));
}

/** The checklist: No / Item / Qty / PIC / Done / Notes. */
export function downloadChecklist({ event, members, items }) {
    return save((ExcelJS, { checklistWorkbook }) => checklistWorkbook(ExcelJS, {
        event: describe(event),
        exportedOn: exportedOn(),
        members,
        items: items.map((i) => ({ item: i.item, quantity: i.quantity ?? '', picUid: i.picUid ?? null, done: Boolean(i.done), notes: i.notes ?? '' })),
        t,
    }), fileName(event.title, t('Checklist')));
}
