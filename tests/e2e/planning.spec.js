// The main things members do: propose an event, vote, chat.
import { expect, test } from '@playwright/test';
import { createUser, resetEmulators, signIn } from './helpers.js';

test.beforeEach(resetEmulators);

/** Propose an event with one-day options on the 10th and 12th of next month. */
async function propose(page, title) {
    await page.getByRole('button', { name: 'Propose event' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Propose event' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Location').fill('Port Dickson');
    await dialog.getByRole('button', { name: 'Next month' }).click();
    for (const day of ['10', '12']) {
        await dialog.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${day}$`) }).click();
    }
    await expect(dialog.getByRole('list', { name: 'Chosen date options' }).getByRole('listitem')).toHaveCount(2);
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden();
}

test('a member proposes an event and the others see it', async ({ page, browser }) => {
    const mirza = await createUser({ name: 'Mirza', role: 'admin' });
    const aina = await createUser({ name: 'Aina' });

    await signIn(page, aina);
    await propose(page, 'Beach day');
    await expect(page.getByText('Beach day').first()).toBeVisible();

    const other = await browser.newContext();
    const mirzaPage = await other.newPage();
    await signIn(mirzaPage, mirza);
    await expect(mirzaPage.getByText('Beach day').first()).toBeVisible();
    await other.close();
});

test('chat messages reach the other members live', async ({ page, browser }) => {
    const mirza = await createUser({ name: 'Mirza', role: 'admin' });
    const aina = await createUser({ name: 'Aina' });

    const other = await browser.newContext();
    const mirzaPage = await other.newPage();
    await signIn(mirzaPage, mirza);
    await mirzaPage.getByRole('button', { name: /^Open chat/ }).click();

    await signIn(page, aina);
    await page.getByRole('button', { name: /^Open chat/ }).click();
    const chat = page.getByRole('dialog', { name: 'Group chat' });
    await chat.getByRole('textbox').fill('Jom pantai Sabtu ni!');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByText('Jom pantai Sabtu ni!')).toBeVisible();

    await expect(mirzaPage.getByRole('dialog', { name: 'Group chat' }).getByText('Jom pantai Sabtu ni!')).toBeVisible();
    await other.close();
});
