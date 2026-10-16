// The Excel exports (src/js/xlsx-sheets.js): the sheets, the live formulas,
// and figures that match the app's maths (money.js) to the sen.
// Excel's own recalculation of these formulas was checked against money.js too
// (leftover sen, partial splits, payments, a former member): same results.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { checklistWorkbook, col, expensesWorkbook } from '../../src/js/xlsx-sheets.js';
import { balances } from '../../src/js/money.js';

const t = (s, vars = {}) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k]);
const members = [
    { uid: 'zMirza', displayName: 'Mirza' },
    { uid: 'aRedz', displayName: 'Redz' },
    { uid: 'mMirani', displayName: 'Mirani' },
    { uid: 'bHakim', displayName: 'Hakim' },
];
const expenses = [
    { item: 'Sewa hotel', amountCents: 64001, paidBy: 'zMirza', splitWith: ['zMirza', 'aRedz', 'mMirani'] },
    { item: 'BBQ', amountCents: 18003, paidBy: 'aRedz', splitWith: ['zMirza', 'aRedz', 'mMirani', 'bHakim'] },
    { item: 'Minyak', amountCents: 9607, paidBy: 'gone', splitWith: ['mMirani', 'bHakim', 'gone'] },
];
const settlements = [{ from: 'bHakim', to: 'zMirza', amountCents: 5000, date: '13 Oct' }];
const event = { title: 'Trip PD', when: 'Tue–Thu, 10–12 Nov', location: 'Port Dickson' };

/** Write and read back, like opening the downloaded file. */
async function roundTrip(wb) {
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(await wb.xlsx.writeBuffer());
    return back;
}
// A formula's saved result (ExcelJS leaves out a 0).
const value = (cell) => (cell.value && typeof cell.value === 'object' && 'formula' in cell.value ? cell.value.result ?? 0 : cell.value);

test('column letters', () => {
    assert.deepEqual([1, 26, 27, 52, 53].map(col), ['A', 'Z', 'AA', 'AZ', 'BA']);
});

test('expenses: four sheets, live formulas, the app’s figures', async () => {
    const wb = await roundTrip(expensesWorkbook(ExcelJS, { event, exportedOn: '16 Oct 2026', members, expenses, settlements, t }));
    assert.deepEqual(wb.worksheets.map((w) => w.name), ['Expenses', 'Balances', 'Payments made', 'Settle up']);

    // People by name: Former member, Hakim, Mirani, Mirza, Redz -> flags G..K, shares L..P.
    const ex = wb.getWorksheet('Expenses');
    assert.equal(ex.getCell('G5').value, 'Former member');
    assert.equal(ex.getCell('L5').value, 'Former member');
    assert.equal(ex.getRow(6).hidden, true); // uid order, for the leftover sen
    assert.match(ex.getCell('E7').value.formula, /^COUNTIF\(\$G7:\$K7,"✓"\)$/);
    assert.match(ex.getCell('N7').value.formula, /INT\(ROUND\(\$D7\*100,0\)\/\$E7\)/);
    // RM640.01 / 3: the leftover 2 sen go to Redz and Mirani (first by uid), not Mirza.
    assert.deepEqual(['N7', 'O7', 'P7'].map((a) => value(ex.getCell(a))), [213.34, 213.33, 213.34]);
    assert.equal(ex.getCell('J7').value, '✓');
    assert.equal(ex.getCell('H7').value, null);

    // Balances: formulas, and the same numbers as the app.
    const bal = wb.getWorksheet('Balances');
    const expected = new Map(balances(expenses, settlements).map((b) => [b.uid, b]));
    const rows = { 'Former member': 'gone', Hakim: 'bHakim', Mirani: 'mMirani', Mirza: 'zMirza', Redz: 'aRedz' };
    for (let r = 5; r <= 9; r++) {
        const b = expected.get(rows[bal.getCell(r, 1).value]);
        assert.match(bal.getCell(r, 2).value.formula, /^SUMIF\('Expenses'!\$C\$7:\$C\$\d+,A\d+,'Expenses'!\$D\$7:\$D\$\d+\)$/);
        assert.equal(bal.getCell(r, 6).value.formula, `ROUND(B${r}-C${r}+D${r}-E${r},2)`);
        assert.deepEqual([2, 3, 4, 5, 6].map((c) => value(bal.getCell(r, c))), [b.paid, b.share, b.sent, b.received, b.net].map((x) => x / 100));
    }

    // Payments made and settle up.
    const pay = wb.getWorksheet('Payments made');
    assert.deepEqual([2, 3, 4, 5].map((c) => pay.getCell(5, c).value), ['Hakim', 'Mirza', 50, '13 Oct']);
    const settle = wb.getWorksheet('Settle up');
    const total = [5, 6, 7, 8].reduce((n, r) => n + (settle.getCell(r, 3).value ?? 0), 0);
    assert.equal(Math.round(total * 100), [...expected.values()].filter((b) => b.net > 0).reduce((n, b) => n + b.net, 0));
});

test('checklist: rows, ✓ for done, a live done count', async () => {
    const items = [
        { item: 'Tikar', quantity: '2', picUid: 'aRedz', done: true },
        { item: 'Arang', quantity: '3 beg', picUid: 'zMirza', done: false, notes: 'Beli di Tesco' },
    ];
    const wb = await roundTrip(checklistWorkbook(ExcelJS, { event, exportedOn: '16 Oct 2026', members, items, t }));
    const ws = wb.getWorksheet('Checklist');
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((c) => ws.getCell(6, c).value), [1, 'Tikar', '2', 'Redz', '✓', null]);
    assert.deepEqual([2, 4, 5, 6].map((c) => ws.getCell(7, c).value), ['Arang', 'Mirza', null, 'Beli di Tesco']);
    const sum = ws.getCell(13, 5).value; // 2 items + 5 spare rows, then the count
    assert.match(sum.formula, /^COUNTIF\(E6:E12,"✓"\)&" \/ "&COUNTA\(B6:B12\)$/);
    assert.equal(sum.result, '1 / 2');
    assert.equal(wb.getWorksheet('Members').state, 'hidden');
});
