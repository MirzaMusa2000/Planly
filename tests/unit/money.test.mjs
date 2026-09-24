// Expense maths. Run with: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { balances, formatRM, parseRM, settleUp, splitCents } from '../../src/js/money.js';

const net = (rows) => Object.fromEntries(rows.map((r) => [r.uid, r.net]));

describe('money', () => {
    test('formats ringgit', () => {
        assert.equal(formatRM(63400), 'RM634.00');
        assert.equal(formatRM(15850), 'RM158.50');
        assert.equal(formatRM(123456789), 'RM1,234,567.89');
        assert.equal(formatRM(-1250), '-RM12.50');
        assert.equal(formatRM(0), 'RM0.00');
    });

    test('parses what people type', () => {
        assert.equal(parseRM('270'), 27000);
        assert.equal(parseRM('12.5'), 1250);
        assert.equal(parseRM('12.50'), 1250);
        assert.equal(parseRM('RM 1,234.05'), 123405);
        assert.equal(parseRM(' rm8 '), 800);
        for (const bad of ['', '0', '0.00', '-5', '1.234', 'abc', '12,5.0.1', null]) assert.equal(parseRM(bad), null, String(bad));
    });

    test('splits evenly; leftover sen go to the first uids', () => {
        assert.deepEqual([...splitCents(63400, ['a', 'b', 'c', 'd'])], [['a', 15850], ['b', 15850], ['c', 15850], ['d', 15850]]);
        assert.deepEqual([...splitCents(8600, ['z', 'm', 's'])], [['m', 2867], ['s', 2867], ['z', 2866]]); // RM86 / 3
        assert.deepEqual([...splitCents(100, ['a', 'a', 'b'])], [['a', 50], ['b', 50]]); // duplicates ignored
        assert.equal(splitCents(100, []).size, 0);
    });

    test('the costing sheet: RM634 across 4 people', () => {
        const all = ['mirza', 'zikri', 'safwan', 'norman'];
        const rows = [
            ['sewa glamping', 'mirza', 270], ['Torch + Butane', 'mirza', 24], ['tmpt bbq', 'mirza', 12],
            ['bahan perap', 'zikri', 16], ['Maggi/ayam..etc', 'mirza', 80], ['Arang/..etc', 'mirza', 18],
            ['Makan tgh hari', 'mirza', 112], ['Ice', 'zikri', 8], ['Ice', 'mirza', 4], ['minyak', 'safwan', 50],
            ['tng', 'zikri', 40],
        ].map(([, paidBy, rm]) => ({ paidBy, amountCents: rm * 100, splitWith: all }));

        const b = balances(rows);
        assert.equal(b.reduce((n, r) => n + r.paid, 0), 63400);
        assert.ok(b.every((r) => r.share === 15850));
        assert.deepEqual(net(b), { mirza: 36150, zikri: -9450, safwan: -10850, norman: -15850 });
        assert.equal(b.reduce((n, r) => n + r.net, 0), 0);

        assert.deepEqual(settleUp(b), [
            { from: 'norman', to: 'mirza', amountCents: 15850 },
            { from: 'safwan', to: 'mirza', amountCents: 10850 },
            { from: 'zikri', to: 'mirza', amountCents: 9450 },
        ]);
    });

    test('some items split among fewer people ("makan malam /3")', () => {
        const b = balances([
            { paidBy: 'a', amountCents: 40000, splitWith: ['a', 'b', 'c', 'd'] },
            { paidBy: 'b', amountCents: 8600, splitWith: ['a', 'b', 'c'] },
        ]);
        assert.deepEqual(net(b), { a: 40000 - 10000 - 2867, b: 8600 - 10000 - 2867, c: -10000 - 2866, d: -10000 });
        assert.equal(b.reduce((n, r) => n + r.net, 0), 0);
    });

    test('recorded payments reduce what is owed', () => {
        const expenses = [{ paidBy: 'mirza', amountCents: 30000, splitWith: ['mirza', 'zikri', 'norman'] }];
        const b = balances(expenses, [{ from: 'zikri', to: 'mirza', amountCents: 10000 }]);
        assert.deepEqual(net(b), { mirza: 10000, zikri: 0, norman: -10000 });
        assert.deepEqual(settleUp(b), [{ from: 'norman', to: 'mirza', amountCents: 10000 }]);

        const done = balances(expenses, [
            { from: 'zikri', to: 'mirza', amountCents: 10000 },
            { from: 'norman', to: 'mirza', amountCents: 10000 },
        ]);
        assert.deepEqual(settleUp(done), []);
    });

    test('several creditors and debtors settle with few payments', () => {
        const expenses = [
            { paidBy: 'a', amountCents: 9000, splitWith: ['a', 'b', 'c'] },
            { paidBy: 'b', amountCents: 6000, splitWith: ['a', 'b', 'c', 'd'] },
            { paidBy: 'e', amountCents: 1000, splitWith: ['d', 'e'] },
        ];
        const b = balances(expenses);
        const transfers = settleUp(b);
        assert.ok(transfers.length <= b.length - 1);
        assert.ok(transfers.every((t) => t.amountCents > 0 && t.from !== t.to));
        // Recording exactly those payments settles everyone.
        assert.ok(balances(expenses, transfers).every((r) => r.net === 0));
    });
});
