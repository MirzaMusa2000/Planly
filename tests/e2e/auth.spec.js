// Sign-up, approval and sign-in.
import { expect, test } from '@playwright/test';
import { PASSWORD, createUser, openLogin, resetEmulators, signIn } from './helpers.js';

test.beforeEach(resetEmulators);

test('a new sign-up waits for approval', async ({ page }) => {
    await openLogin(page);
    await page.getByRole('tab', { name: 'Create account' }).click();
    await page.getByLabel('Your name').fill('Aina');
    await page.getByLabel('Email').fill('aina@example.com');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.locator('form button[type="submit"]').click();

    await expect(page).toHaveURL('/pending');
    // The app's pages stay closed while pending.
    await page.goto('/');
    await expect(page).toHaveURL('/pending');
});

test('the admin approves a pending member, who can then get in', async ({ page, browser }) => {
    const admin = await createUser({ name: 'Mirza', role: 'admin' });
    const aina = await createUser({ name: 'Aina', status: 'pending' });

    await signIn(page, admin);
    await page.goto('/members');
    const row = page.getByRole('listitem').filter({ hasText: aina.email });
    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(row.getByRole('button', { name: 'Approve' })).toBeHidden();

    const ainaContext = await browser.newContext();
    const ainaPage = await ainaContext.newPage();
    await signIn(ainaPage, aina, '/');
    await ainaContext.close();
});

test('members can’t open the admin page', async ({ page }) => {
    const member = await createUser({ name: 'Redz' });
    await signIn(page, member);
    await expect(page.getByRole('link', { name: 'Members' }).filter({ visible: true })).toHaveCount(0);
    await page.goto('/members');
    await expect(page).toHaveURL('/');
});

test('a wrong password shows an error', async ({ page }) => {
    const member = await createUser({ name: 'Redz' });
    await openLogin(page);
    await page.getByLabel('Email').fill(member.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL('/login');
});

test('the sign-in page switches to Bahasa Melayu and remembers it', async ({ page }) => {
    await openLogin(page);
    await page.getByRole('button', { name: 'Bahasa Melayu' }).click();
    await expect(page.getByRole('tab', { name: 'Daftar akaun' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Daftar akaun' })).toBeVisible();
    await expect(page).toHaveTitle(/Log masuk/);
});
