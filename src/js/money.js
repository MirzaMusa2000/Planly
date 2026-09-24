// Money maths for shared expenses. Amounts are whole sen (cents) so sums and
// splits never drift; everything here is pure (unit-tested in tests/unit).

const rm = new Intl.NumberFormat('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 63400 -> "RM634.00" (negative: "-RM12.50"). */
export function formatRM(cents) {
    const sign = cents < 0 ? '-' : '';
    return `${sign}RM${rm.format(Math.abs(cents) / 100)}`;
}

/** "12", "12.5", "RM 1,234.50" -> cents; null if it isn't a positive amount. */
export function parseRM(text) {
    const clean = String(text ?? '').replace(/rm/i, '').replace(/[\s,]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
    const [whole, fraction = ''] = clean.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    return cents > 0 ? cents : null;
}

/**
 * Split an amount between people as evenly as possible. The leftover sen go
 * one each to the first people by uid, so everyone computes the same split.
 * @returns {Map<string, number>} uid -> cents
 */
export function splitCents(amountCents, uids) {
    const people = [...new Set(uids)].sort();
    const shares = new Map();
    if (people.length === 0) return shares;
    const base = Math.floor(amountCents / people.length);
    const leftover = amountCents - base * people.length;
    people.forEach((uid, i) => shares.set(uid, base + (i < leftover ? 1 : 0)));
    return shares;
}

/**
 * Where everyone stands. `net` > 0: others owe them; < 0: they owe.
 * Recorded payments (settlements) move money from `from` to `to`.
 * @param {{ amountCents: number, paidBy: string, splitWith: string[] }[]} expenses
 * @param {{ from: string, to: string, amountCents: number }[]} settlements
 */
export function balances(expenses, settlements = []) {
    const rows = new Map();
    const row = (uid) => {
        if (!rows.has(uid)) rows.set(uid, { uid, paid: 0, share: 0, sent: 0, received: 0, net: 0 });
        return rows.get(uid);
    };

    for (const e of expenses) {
        row(e.paidBy).paid += e.amountCents;
        for (const [uid, cents] of splitCents(e.amountCents, e.splitWith)) row(uid).share += cents;
    }
    for (const s of settlements) {
        row(s.from).sent += s.amountCents;
        row(s.to).received += s.amountCents;
    }
    for (const r of rows.values()) r.net = r.paid - r.share + r.sent - r.received;

    return [...rows.values()].sort((a, b) => b.net - a.net || a.uid.localeCompare(b.uid));
}

/**
 * The fewest simple payments that settle everyone: the biggest debtor pays
 * the biggest creditor, repeatedly.
 * @returns {{ from: string, to: string, amountCents: number }[]}
 */
export function settleUp(rows) {
    const creditors = rows.filter((r) => r.net > 0).map((r) => ({ uid: r.uid, left: r.net }));
    const debtors = rows.filter((r) => r.net < 0).map((r) => ({ uid: r.uid, left: -r.net }));
    const byAmount = (a, b) => b.left - a.left || a.uid.localeCompare(b.uid);
    const transfers = [];

    creditors.sort(byAmount);
    debtors.sort(byAmount);
    while (creditors.length && debtors.length) {
        const creditor = creditors[0];
        const debtor = debtors[0];
        const amountCents = Math.min(creditor.left, debtor.left);
        transfers.push({ from: debtor.uid, to: creditor.uid, amountCents });
        creditor.left -= amountCents;
        debtor.left -= amountCents;
        if (creditor.left === 0) creditors.shift();
        if (debtor.left === 0) debtors.shift();
        creditors.sort(byAmount);
        debtors.sort(byAmount);
    }
    return transfers;
}
