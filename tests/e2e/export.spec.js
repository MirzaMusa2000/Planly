// "Excel" buttons: the downloaded files open and hold the right figures.
import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';
import { createUser, ready, resetEmulators, signIn } from './helpers.js';

test.beforeEach(resetEmulators);

async function workbookFrom(download) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(await download.path());
    return wb;
}

test('expenses and checklist download as Excel', async ({ page }) => {
    await createUser({ name: 'Mirza', role: 'admin' });
    const aina = await createUser({ name: 'Aina' });
    await signIn(page, aina);

    // A confirmed trip next month.
    await page.getByRole('button', { name: 'Propose event' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Propose event' });
    await dialog.getByLabel('Title').fill('Trip PD');
    await dialog.getByRole('button', { name: 'Next month' }).click();
    await dialog.locator('button[aria-pressed]').filter({ hasText: /^10$/ }).click();
    await dialog.locator('button[type="submit"]').click();
    await page.getByRole('button', { name: /Trip PD/ }).filter({ visible: true }).first().click();
    await page.getByRole('dialog', { name: /Trip PD/ }).getByRole('button', { name: 'Confirm this date →' }).click();
    await page.getByRole('alertdialog').getByRole('button').last().click();
    await page.keyboard.press('Escape');

    // Two expenses split between both members.
    await page.getByRole('link', { name: 'Expenses' }).filter({ visible: true }).first().click();
    await ready(page);
    for (const [what, amount] of [['Hotel', '300'], ['BBQ', '100.01']]) {
        const form = page.locator('form[data-expense-form]');
        if (!(await form.isVisible())) await page.getByRole('button', { name: 'Add expense' }).click();
        await form.getByLabel('Item').fill(what);
        await form.getByLabel('Amount').fill(amount);
        if (await form.getByRole('button', { name: 'Everyone' }).isVisible()) await form.getByRole('button', { name: 'Everyone' }).click();
        await form.locator('button[type="submit"]').click();
        await expect(page.getByRole('button', { name: `Edit ${what}` })).toBeVisible();
        await expect(form.getByLabel('Item')).toHaveValue('');
    }

    const [expenses] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Excel/ }).click()]);
    expect(expenses.suggestedFilename()).toMatch(/^Planly - .*Trip PD - Expenses\.xlsx$/);
    const wb = await workbookFrom(expenses);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Expenses', 'Balances', 'Payments made', 'Settle up']);
    const ex = wb.getWorksheet('Expenses');
    expect([ex.getCell('B7').value, ex.getCell('D7').value, ex.getCell('B8').value, ex.getCell('D8').value]).toEqual(['Hotel', 300, 'BBQ', 100.01]);
    expect(ex.getCell('D14').value.result).toBe(400.01); // total, under 2 rows + 5 spare
    const bal = wb.getWorksheet('Balances');
    // Aina paid all RM400.01, half each: she should receive about RM200, Mirza owes it; the two cancel out.
    const nets = [5, 6].map((r) => bal.getCell(r, 6).value.result ?? 0);
    expect(Math.round((nets[0] + nets[1]) * 100)).toBe(0);
    expect(Math.max(...nets)).toBeGreaterThan(199.99);

    // Checklist.
    await page.getByRole('link', { name: 'Itinerary' }).filter({ visible: true }).first().click();
    await ready(page);
    await page.getByRole('button', { name: 'Add item' }).click();
    const item = page.locator('form[data-checklist-form]');
    await item.getByLabel('Item', { exact: true }).fill('Tikar');
    await item.getByLabel('Qty').fill('2');
    await item.locator('button[type="submit"]').click();
    await expect(page.getByRole('button', { name: 'Mark done: Tikar' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark done: Tikar' }).click();
    await expect(page.getByRole('button', { name: 'Mark not done: Tikar' })).toBeVisible();

    const [checklist] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as Excel' }).click()]);
    expect(checklist.suggestedFilename()).toMatch(/Trip PD - Checklist\.xlsx$/);
    const list = (await workbookFrom(checklist)).getWorksheet('Checklist');
    expect([list.getCell('B6').value, list.getCell('C6').value, list.getCell('E6').value]).toEqual(['Tikar', '2', '✓']);
    expect(list.getCell('E12').value.result).toBe('1 / 1');
});
