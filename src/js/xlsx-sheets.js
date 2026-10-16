// Excel workbooks for an event's expenses and checklist (js/export.js).
// Pure: takes the ExcelJS library, the data and a translate function, so the
// same code runs in the browser and in tests (tests/unit/xlsx.test.mjs).
//
// The expenses workbook keeps the app's maths as live formulas, so editing an
// amount or a ✓ in Excel recalculates everything:
//  - each share is the amount split in whole sen, the leftover sen going one
//    each to the first people in the split by uid (money.js splitCents): a
//    hidden row holds each member's uid order for that;
//  - balance = paid - share + payments sent - payments received.
// "Settle up" is worked out when exporting (fewest payments; no formula can
// do that), with a note to recheck Balances after changes.
import { balances, settleUp, splitCents } from './money.js';

const BRAND = 'FF5B5BD6';
const BRAND_TINT = 'FFECEBFD';
const LINE = 'FFD5D8E3';
const MUTED = 'FF5F6578';
const RM = '"RM"#,##0.00';
const RM_HIDE_ZERO = '"RM"#,##0.00;-"RM"#,##0.00;""';
const RM_SIGNED = '[Color10]"+RM"#,##0.00;[Red]"-RM"#,##0.00;"RM"0.00';
const TICK = '✓';
const SPARE_ROWS = 5; // empty, ready-to-fill rows under the data

/** 1 -> "A", 27 -> "AA" */
export function col(n) {
    let s = '';
    for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
}
const ref = (sheet, address) => `'${sheet.replace(/'/g, "''")}'!${address}`;
const quote = (text) => `"${String(text).replace(/"/g, '""')}"`;
const cents = (amount) => Math.round(amount) / 100;

// --- Look -----------------------------------------------------------------------
function heading(ws, { title, subtitle, note }) {
    ws.getCell('A1').value = title;
    ws.getCell('A1').font = { size: 16, bold: true, color: { argb: BRAND } };
    ws.getCell('A2').value = subtitle;
    ws.getCell('A2').font = { size: 11, color: { argb: MUTED } };
    ws.getCell('A3').value = note;
    ws.getCell('A3').font = { size: 9, italic: true, color: { argb: MUTED } };
}

function headerCell(cell, text) {
    cell.value = text;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = box();
}

function box() {
    const side = { style: 'thin', color: { argb: LINE } };
    return { top: side, left: side, bottom: side, right: side };
}

function bodyCell(cell, { numFmt, center, bold, fill } = {}) {
    cell.border = box();
    if (numFmt) cell.numFmt = numFmt;
    if (center) cell.alignment = { horizontal: 'center' };
    if (bold) cell.font = { bold: true };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
}

/** People in the sheets: members plus anyone the data mentions, by name; unique names. */
function people(members, uids, t) {
    const known = new Map(members.map((m) => [m.uid, m.displayName]));
    const all = [...new Set([...members.map((m) => m.uid), ...uids])].filter(Boolean);
    const list = all.map((uid) => ({ uid, name: known.get(uid) || t('Former member') }));
    list.sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
    const seen = new Map();
    for (const p of list) {
        const n = (seen.get(p.name) ?? 0) + 1;
        seen.set(p.name, n);
        if (n > 1) p.name = `${p.name} (${n})`;
    }
    // Order of uids as money.js sorts them: who gets a leftover sen first.
    [...all].sort().forEach((uid, i) => (list.find((p) => p.uid === uid).order = i + 1));
    return list;
}

// --- Expenses -------------------------------------------------------------------
/**
 * @param {*} ExcelJS
 * @param {{ event: { title, when, location }, exportedOn: string, members: {uid, displayName}[],
 *   expenses: { item, amountCents, paidBy, splitWith: string[], notes? }[],
 *   settlements: { from, to, amountCents, date? }[], t: (s, vars?) => string }} data
 */
export function expensesWorkbook(ExcelJS, { event, exportedOn, members, expenses, settlements, t }) {
    const uids = [...expenses.flatMap((e) => [e.paidBy, ...e.splitWith]), ...settlements.flatMap((s) => [s.from, s.to])];
    const crew = people(members, uids, t);
    const nameOf = new Map(crew.map((p) => [p.uid, p.name]));
    const n = crew.length;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Planly';
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true; // Excel works every formula out when the file opens
    const names = { expenses: t('Expenses'), balances: t('Balances'), payments: t('Payments made'), settle: t('Settle up') };
    const subtitle = [event.when, event.location].filter(Boolean).join(' · ');
    const note = t('Exported from Planly on {date}', { date: exportedOn });

    // Sheet 1: the expenses, with each person's share --------------------------------
    const ws = wb.addWorksheet(names.expenses, {
        views: [{ state: 'frozen', xSplit: 2, ySplit: 6 }],
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    heading(ws, { title: `${event.title} · ${t('Expenses')}`, subtitle, note });

    const C = { no: 1, item: 2, paidBy: 3, amount: 4, people: 5, each: 6 };
    const flag0 = 7; // first "split between" column
    const share0 = flag0 + n; // first "share" column
    const notesCol = share0 + n;
    const flagCol = (i) => col(flag0 + i);
    const shareCol = (i) => col(share0 + i);
    const lastFlag = flagCol(n - 1);
    const GROUP = 4;
    const HEAD = 5;
    const ORDER = 6; // hidden: each member's uid order
    const first = 7;
    const last = first + expenses.length + SPARE_ROWS - 1;
    const total = last + 1;

    // Group headers + headers
    ws.mergeCells(GROUP, flag0, GROUP, share0 - 1);
    headerCell(ws.getCell(GROUP, flag0), t('Split between (✓)'));
    ws.mergeCells(GROUP, share0, GROUP, notesCol - 1);
    headerCell(ws.getCell(GROUP, share0), t('Share (RM)'));
    const heads = [t('No'), t('Item'), t('Paid by'), t('Amount (RM)'), t('People'), t('Each (RM)')];
    heads.forEach((h, i) => headerCell(ws.getCell(HEAD, i + 1), h));
    crew.forEach((p, i) => {
        headerCell(ws.getCell(HEAD, flag0 + i), p.name);
        headerCell(ws.getCell(HEAD, share0 + i), p.name);
        ws.getCell(ORDER, flag0 + i).value = p.order;
    });
    headerCell(ws.getCell(HEAD, notesCol), t('Notes'));
    ws.getRow(HEAD).height = 30;
    ws.getRow(ORDER).hidden = true;

    const memberList = ref(names.balances, `$A$5:$A$${4 + n}`); // names, for drop-downs

    for (let r = first; r <= last; r++) {
        const e = expenses[r - first];
        const shares = e ? splitCents(e.amountCents, e.splitWith) : new Map();
        const amount = `$${col(C.amount)}${r}`;
        const count = `$${col(C.people)}${r}`;
        const flags = `$${col(flag0)}${r}:$${lastFlag}${r}`;
        const orders = `$${col(flag0)}$${ORDER}:$${lastFlag}$${ORDER}`;

        ws.getCell(r, C.no).value = e ? r - first + 1 : null;
        ws.getCell(r, C.item).value = e ? e.item : null;
        ws.getCell(r, C.paidBy).value = e ? nameOf.get(e.paidBy) : null;
        ws.getCell(r, C.paidBy).dataValidation = { type: 'list', allowBlank: true, formulae: [memberList] };
        ws.getCell(r, C.amount).value = e ? cents(e.amountCents) : null;
        ws.getCell(r, C.people).value = { formula: `COUNTIF(${flags},"${TICK}")`, result: e ? new Set(e.splitWith).size : 0 };
        ws.getCell(r, C.each).value = {
            formula: `IF(${count}=0,0,${amount}/${count})`,
            result: e && e.splitWith.length ? e.amountCents / 100 / new Set(e.splitWith).size : 0,
        };
        crew.forEach((p, i) => {
            const flag = ws.getCell(r, flag0 + i);
            flag.value = e && e.splitWith.includes(p.uid) ? TICK : null;
            flag.dataValidation = { type: 'list', allowBlank: true, formulae: [`"${TICK}"`] };
            const mine = `${flagCol(i)}${r}`;
            const myOrder = `${flagCol(i)}$${ORDER}`;
            ws.getCell(r, share0 + i).value = {
                formula: `IF(${mine}="${TICK}",(INT(ROUND(${amount}*100,0)/${count})`
                    + `+IF(SUMPRODUCT(--(${flags}="${TICK}"),--(${orders}<=${myOrder}))<=MOD(ROUND(${amount}*100,0),${count}),1,0))/100,0)`,
                result: cents(shares.get(p.uid) ?? 0),
            };
        });
        ws.getCell(r, notesCol).value = e?.notes || null;

        for (let c = 1; c <= notesCol; c++) {
            const isShare = c >= share0 && c < notesCol;
            bodyCell(ws.getCell(r, c), {
                numFmt: c === C.amount ? RM : c === C.each || isShare ? RM_HIDE_ZERO : c === C.people ? '0;-0;""' : undefined,
                center: c === C.no || c === C.people || (c >= flag0 && c < share0),
                fill: c >= flag0 && c < share0 ? BRAND_TINT : undefined,
            });
        }
    }

    // Totals
    const all = balances(expenses, []);
    const shareOf = new Map(all.map((b) => [b.uid, b.share]));
    const totalCents = expenses.reduce((s, e) => s + e.amountCents, 0);
    const participants = new Set(expenses.flatMap((e) => e.splitWith)).size;
    ws.mergeCells(total, 1, total, 3);
    ws.getCell(total, 1).value = t('Total overall');
    ws.getCell(total, C.amount).value = { formula: `SUM(${col(C.amount)}${first}:${col(C.amount)}${last})`, result: cents(totalCents) };
    ws.getCell(total, C.people).value = { formula: `COUNTIF(${col(share0)}${total}:${shareCol(n - 1)}${total},">0")`, result: participants };
    ws.getCell(total, C.each).value = {
        formula: `IF(${col(C.people)}${total}=0,0,${col(C.amount)}${total}/${col(C.people)}${total})`,
        result: participants ? totalCents / 100 / participants : 0,
    };
    crew.forEach((p, i) => {
        ws.getCell(total, share0 + i).value = {
            formula: `SUM(${shareCol(i)}${first}:${shareCol(i)}${last})`,
            result: cents(shareOf.get(p.uid) ?? 0),
        };
    });
    for (let c = 1; c <= notesCol; c++) {
        bodyCell(ws.getCell(total, c), {
            numFmt: c === C.amount || c === C.each || (c >= share0 && c < notesCol) ? RM : c === C.people ? '0' : undefined,
            center: c === C.people,
            bold: true,
            fill: BRAND_TINT,
        });
    }
    ws.getCell(total + 2, 1).value = t('Add rows above the total: type the item and amount, pick who paid, and put ✓ under everyone who shares it.');
    ws.getCell(total + 2, 1).font = { size: 9, italic: true, color: { argb: MUTED } };

    ws.getColumn(C.no).width = 5;
    ws.getColumn(C.item).width = 26;
    ws.getColumn(C.paidBy).width = 16;
    ws.getColumn(C.amount).width = 13;
    ws.getColumn(C.people).width = 8;
    ws.getColumn(C.each).width = 12;
    crew.forEach((_, i) => {
        ws.getColumn(flag0 + i).width = 10;
        ws.getColumn(share0 + i).width = 12;
    });
    ws.getColumn(notesCol).width = 30;

    // Payments sheet rows (Balances refers to them)
    const PAY_HEAD = 4;
    const payFirst = 5;
    const payLast = payFirst + settlements.length + 10 - 1;

    // Sheet 2: balances -----------------------------------------------------------------
    const bal = wb.addWorksheet(names.balances, { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    heading(bal, { title: `${event.title} · ${t('Balances')}`, subtitle, note: t('Balance = paid − share + payments sent − payments received. Green: should receive; red: should pay.') });
    const BAL_HEAD = 4;
    [t('Member'), t('Paid'), t('Share'), t('Sent'), t('Received'), t('Balance'), t('Status')].forEach((h, i) => headerCell(bal.getCell(BAL_HEAD, i + 1), h));
    const withPayments = new Map(balances(expenses, settlements).map((b) => [b.uid, b]));
    const payRange = (c) => ref(names.payments, `$${c}$${payFirst}:$${c}$${payLast}`);
    crew.forEach((p, i) => {
        const r = BAL_HEAD + 1 + i;
        const b = withPayments.get(p.uid) ?? { paid: 0, share: 0, sent: 0, received: 0, net: 0 };
        bal.getCell(r, 1).value = p.name;
        bal.getCell(r, 2).value = {
            formula: `SUMIF(${ref(names.expenses, `$C$${first}:$C$${last}`)},A${r},${ref(names.expenses, `$D$${first}:$D$${last}`)})`,
            result: cents(b.paid),
        };
        bal.getCell(r, 3).value = { formula: ref(names.expenses, `${shareCol(i)}${total}`), result: cents(b.share) };
        bal.getCell(r, 4).value = { formula: `SUMIF(${payRange('B')},A${r},${payRange('D')})`, result: cents(b.sent) };
        bal.getCell(r, 5).value = { formula: `SUMIF(${payRange('C')},A${r},${payRange('D')})`, result: cents(b.received) };
        bal.getCell(r, 6).value = { formula: `ROUND(B${r}-C${r}+D${r}-E${r},2)`, result: cents(b.net) };
        const status = b.net > 0 ? t('Should receive') : b.net < 0 ? t('Should pay') : t('Settled');
        bal.getCell(r, 7).value = {
            formula: `IF(F${r}>0,${quote(t('Should receive'))},IF(F${r}<0,${quote(t('Should pay'))},${quote(t('Settled'))}))`,
            result: status,
        };
        for (let c = 1; c <= 7; c++) {
            bodyCell(bal.getCell(r, c), { numFmt: c === 6 ? RM_SIGNED : c >= 2 && c <= 5 ? RM : undefined, bold: c === 1 || c === 6 });
        }
    });
    bal.getColumn(1).width = 20;
    [2, 3, 4, 5, 6].forEach((c) => (bal.getColumn(c).width = 13));
    bal.getColumn(7).width = 16;

    // Sheet 3: payments made ----------------------------------------------------------------
    const pay = wb.addWorksheet(names.payments, { views: [{ state: 'frozen', ySplit: 4 }], pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    heading(pay, { title: `${event.title} · ${t('Payments made')}`, subtitle, note: t('Payments recorded in Planly. Add any made since; Balances updates.') });
    [t('No'), t('From'), t('To'), t('Amount (RM)'), t('Date')].forEach((h, i) => headerCell(pay.getCell(PAY_HEAD, i + 1), h));
    for (let r = payFirst; r <= payLast; r++) {
        const s = settlements[r - payFirst];
        pay.getCell(r, 1).value = s ? r - payFirst + 1 : null;
        pay.getCell(r, 2).value = s ? nameOf.get(s.from) : null;
        pay.getCell(r, 3).value = s ? nameOf.get(s.to) : null;
        pay.getCell(r, 4).value = s ? cents(s.amountCents) : null;
        pay.getCell(r, 5).value = s?.date ?? null;
        pay.getCell(r, 2).dataValidation = { type: 'list', allowBlank: true, formulae: [memberList] };
        pay.getCell(r, 3).dataValidation = { type: 'list', allowBlank: true, formulae: [memberList] };
        for (let c = 1; c <= 5; c++) bodyCell(pay.getCell(r, c), { numFmt: c === 4 ? RM : undefined, center: c === 1 });
    }
    pay.getColumn(1).width = 5;
    pay.getColumn(2).width = 18;
    pay.getColumn(3).width = 18;
    pay.getColumn(4).width = 14;
    pay.getColumn(5).width = 14;

    // Sheet 4: settle up (worked out now) ----------------------------------------------------
    const set = wb.addWorksheet(names.settle, { pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    heading(set, {
        title: `${event.title} · ${t('Settle up')}`,
        subtitle,
        note: t('The fewest payments that settle everyone, worked out when exported. After changing the sheets, check Balances.'),
    });
    [t('From'), t('To'), t('Amount (RM)')].forEach((h, i) => headerCell(set.getCell(4, i + 1), h));
    const transfers = settleUp(balances(expenses, settlements));
    if (transfers.length === 0) {
        set.getCell(5, 1).value = expenses.length ? t('All settled up ✅') : t('Nothing to settle yet.');
    }
    transfers.forEach((tr, i) => {
        const r = 5 + i;
        set.getCell(r, 1).value = nameOf.get(tr.from);
        set.getCell(r, 2).value = nameOf.get(tr.to);
        set.getCell(r, 3).value = cents(tr.amountCents);
        for (let c = 1; c <= 3; c++) bodyCell(set.getCell(r, c), { numFmt: c === 3 ? RM : undefined });
    });
    set.getColumn(1).width = 20;
    set.getColumn(2).width = 20;
    set.getColumn(3).width = 14;

    return wb;
}

// --- Checklist ------------------------------------------------------------------
/**
 * @param {{ event: { title, when, location }, exportedOn: string, members: {uid, displayName}[],
 *   items: { item, quantity?, picUid?, done?, notes? }[], t }} data
 */
export function checklistWorkbook(ExcelJS, { event, exportedOn, members, items, t }) {
    const crew = people(members, items.map((i) => i.picUid).filter(Boolean), t);
    const nameOf = new Map(crew.map((p) => [p.uid, p.name]));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Planly';
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true; // Excel works every formula out when the file opens
    const ws = wb.addWorksheet(t('Checklist'), {
        views: [{ state: 'frozen', ySplit: 5 }],
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
    });
    heading(ws, {
        title: `${event.title} · ${t('Checklist')}`,
        subtitle: [event.when, event.location].filter(Boolean).join(' · '),
        note: t('Exported from Planly on {date}', { date: exportedOn }),
    });

    // People, for the PIC drop-down
    const list = wb.addWorksheet(t('Members'), { state: 'hidden' });
    crew.forEach((p, i) => (list.getCell(i + 1, 1).value = p.name));
    const pics = ref(t('Members'), `$A$1:$A$${Math.max(1, crew.length)}`);

    const HEAD = 5;
    const first = 6;
    const last = first + items.length + SPARE_ROWS - 1;
    [t('No'), t('Item'), t('Qty'), t('PIC'), t('Done'), t('Notes')].forEach((h, i) => headerCell(ws.getCell(HEAD, i + 1), h));
    for (let r = first; r <= last; r++) {
        const it = items[r - first];
        ws.getCell(r, 1).value = it ? r - first + 1 : null;
        ws.getCell(r, 2).value = it?.item ?? null;
        ws.getCell(r, 3).value = it?.quantity || null;
        ws.getCell(r, 4).value = it?.picUid ? nameOf.get(it.picUid) : null;
        ws.getCell(r, 4).dataValidation = { type: 'list', allowBlank: true, formulae: [pics] };
        ws.getCell(r, 5).value = it?.done ? TICK : null;
        ws.getCell(r, 5).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${TICK}"`] };
        ws.getCell(r, 6).value = it?.notes || null;
        for (let c = 1; c <= 6; c++) bodyCell(ws.getCell(r, c), { center: c === 1 || c === 3 || c === 5 });
    }
    // Done rows: green and struck through.
    ws.addConditionalFormatting({
        ref: `A${first}:F${last}`,
        rules: [{
            type: 'expression',
            priority: 1,
            formulae: [`$E${first}="${TICK}"`],
            style: { font: { strike: true, color: { argb: 'FF047857' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFD1FAE5' } } },
        }],
    });

    const sum = last + 1;
    ws.mergeCells(sum, 1, sum, 4);
    ws.getCell(sum, 1).value = t('Done');
    const done = items.filter((i) => i.done).length;
    ws.getCell(sum, 5).value = {
        formula: `COUNTIF(E${first}:E${last},"${TICK}")&" / "&COUNTA(B${first}:B${last})`,
        result: `${done} / ${items.length}`,
    };
    for (let c = 1; c <= 6; c++) bodyCell(ws.getCell(sum, c), { bold: true, fill: BRAND_TINT, center: c === 5 });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 8;
    ws.getColumn(6).width = 36;
    return wb;
}
