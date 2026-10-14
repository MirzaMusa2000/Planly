// The "what's new" popup (once per release) and the "new version ready" bar.
import { expect, test } from '@playwright/test';
import { createUser, ready, resetEmulators, signIn } from './helpers.js';

test.beforeEach(resetEmulators);

test('what’s new shows once, then stays away', async ({ page }) => {
    const aina = await createUser({ name: 'Aina' });
    await signIn(page, aina, '/', { whatsNew: true });

    const dialog = page.getByRole('dialog', { name: 'What’s new in Planly' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Kinds of plan')).toBeVisible();
    await expect(page.getByText('A new version of Planly is ready.')).toBeHidden(); // this build is the deployed one
    await dialog.getByRole('button', { name: 'Got it' }).click();
    await expect(dialog).toBeHidden();

    await page.reload();
    await ready(page);
    await page.waitForTimeout(1500);
    await expect(dialog).toBeHidden();
});

test('a newer deploy offers a refresh', async ({ page }) => {
    const aina = await createUser({ name: 'Aina' });
    await page.route('**/version.json', (route) => route.fulfill({ json: { build: 'a-newer-build' } }));
    await signIn(page, aina);

    const bar = page.getByRole('status').filter({ hasText: 'A new version of Planly is ready.' });
    await expect(bar).toBeVisible();
    const reloaded = page.waitForEvent('load');
    await bar.getByRole('button', { name: 'Refresh' }).click();
    await reloaded;
    await ready(page);

    // "Later" hides it.
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: 'Later' }).click();
    await expect(bar).toBeHidden();
});
