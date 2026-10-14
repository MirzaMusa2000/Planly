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

test('the proposer can change the location afterwards; others cannot', async ({ page, browser }) => {
    await createUser({ name: 'Mirza', role: 'admin' });
    const aina = await createUser({ name: 'Aina' });
    const redz = await createUser({ name: 'Redz' });

    await signIn(page, aina);
    await propose(page, 'Beach day');
    await page.getByRole('button', { name: /Beach day/ }).filter({ visible: true }).first().click();
    const sheet = page.getByRole('dialog', { name: /Beach day/ });
    await expect(sheet.getByText('Port Dickson')).toBeVisible();

    await sheet.getByRole('button', { name: 'Edit location' }).click();
    const input = sheet.getByRole('textbox', { name: 'Location' });
    await expect(input).toBeFocused();
    await input.fill('Teluk Kemang, Port Dickson');
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet.getByText('Teluk Kemang, Port Dickson')).toBeVisible();
    await expect(input).toBeHidden();

    // Escape leaves the editor without closing the event.
    await sheet.getByRole('button', { name: 'Edit location' }).click();
    await input.fill('Somewhere else');
    await input.press('Escape');
    await expect(sheet.getByText('Teluk Kemang, Port Dickson')).toBeVisible();
    await expect(sheet).toBeVisible();

    // Another member sees the new location but cannot edit it.
    const other = await browser.newContext();
    const redzPage = await other.newPage();
    await signIn(redzPage, redz);
    await redzPage.getByRole('button', { name: /Beach day/ }).filter({ visible: true }).first().click();
    const redzSheet = redzPage.getByRole('dialog', { name: /Beach day/ });
    await expect(redzSheet.getByText('Teluk Kemang, Port Dickson')).toBeVisible();
    await expect(redzSheet.getByRole('button', { name: 'Edit location' })).toHaveCount(0);
    await other.close();
});

test('the next event: kind, countdown, Waze / Maps and the weather', async ({ page }) => {
    await createUser({ name: 'Mirza', role: 'admin' });
    const aina = await createUser({ name: 'Aina' });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(Date.now() + 3 * 864e5);
    const thisMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(Date.now()).slice(0, 7);

    // Open-Meteo, stubbed: Port Dickson, 31°/25°, 40% rain.
    await page.route('**/geocoding-api.open-meteo.com/**', (route) => route.fulfill({
        json: { results: [{ name: 'Port Dickson', latitude: 2.52, longitude: 101.8 }] },
    }));
    await page.route('**/api.open-meteo.com/**', (route) => route.fulfill({
        json: { daily: { time: [day], weather_code: [61], temperature_2m_max: [31.2], temperature_2m_min: [24.8], precipitation_probability_max: [40] } },
    }));

    await signIn(page, aina);
    await page.getByRole('button', { name: 'Propose event' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Propose event' });
    await dialog.getByLabel('Title').fill('Beach day');
    // The kind follows the title until one is picked.
    await expect(dialog.getByRole('radio', { name: /Beach/ })).toHaveAttribute('aria-checked', 'true');
    await dialog.getByLabel('Location').fill('Port Dickson');
    if (day.slice(0, 7) !== thisMonth) await dialog.getByRole('button', { name: 'Next month' }).click();
    await dialog.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${Number(day.slice(8))}$`) }).click();
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden();

    // Confirm it (Aina proposed it).
    await page.getByRole('button', { name: /Beach day/ }).filter({ visible: true }).first().click();
    const sheet = page.getByRole('dialog', { name: /Beach day/ });
    await sheet.getByRole('button', { name: 'Confirm this date →' }).click();
    await page.getByRole('alertdialog').getByRole('button').last().click();

    // Waze / Google Maps and the forecast in the event.
    await expect(sheet.getByRole('link', { name: 'Open Port Dickson in Waze' })).toHaveAttribute('href', 'https://waze.com/ul?q=Port%20Dickson&navigate=yes');
    await expect(sheet.getByRole('link', { name: 'Open Port Dickson in Google Maps' })).toHaveAttribute('href', /google\.com\/maps\/search\/\?api=1&query=Port%20Dickson/);
    await expect(sheet.getByText('31° / 25°')).toBeVisible();
    await expect(sheet.getByText('Forecast for Port Dickson')).toBeVisible();

    // Change the kind: the emoji follows everywhere.
    await sheet.getByRole('button', { name: /Change the kind of plan/ }).click();
    await sheet.getByRole('radio', { name: /Food/ }).click();
    await expect(sheet.getByRole('button', { name: /Change the kind of plan \(Food\)/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // The home page counts down to it, and asks for an answer right there.
    await expect(page.getByText('Next up')).toBeVisible();
    await expect(page.getByText('In 3 days')).toBeVisible();
    await expect(page.getByText('🍽️ Beach day').first()).toBeVisible();
    const hero = page.locator('section', { has: page.getByText('Next up') });
    await hero.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(hero.getByText('✓ You’re going')).toBeVisible();
    await expect(hero.getByText('Are you coming?')).toBeHidden();

    // Saying you can't come takes it off your countdown (it stays in the list).
    await page.getByRole('button', { name: /^Not available ·/ }).click();
    await expect(page.getByText('Next up')).toBeHidden();
    await expect(page.getByText('Plan it together, one date at a time.')).toBeVisible();
    await expect(page.getByText('🍽️ Beach day').first()).toBeVisible();
});
