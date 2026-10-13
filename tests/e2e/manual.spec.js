// Screenshots for the user manual, in Bahasa Melayu, from the real app on the
// emulators with sample data:
//
//   npm run test:manual   ->  screenshots/*.png
//
// The data is made through the English UI (the same steps as system.spec.js),
// then every screen is captured in Malay.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { PASSWORD, createUser, openLogin, ready, resetEmulators, signIn } from './helpers.js';

const OUT = 'screenshots';

test.use({ viewport: { width: 1280, height: 800 } });

async function signOut(page) {
    await page.getByRole('button', { name: /Sign out|Log keluar/ }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL('/login');
}

async function openEvent(page, title) {
    await page.getByRole('button', { name: new RegExp(title) }).filter({ visible: true }).first().click();
    const sheet = page.getByRole('dialog', { name: new RegExp(title) });
    await expect(sheet).toBeVisible();
    return sheet;
}

/** Propose an event: one-day options (days) or ranges ([[start, end], …]) next month. */
async function propose(page, { title, location, description, days, ranges }) {
    await page.getByRole('button', { name: 'Propose event' }).filter({ visible: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Propose event' });
    await dialog.getByLabel('Title').fill(title);
    await dialog.getByLabel('Location').fill(location);
    if (ranges) await dialog.getByRole('radio', { name: 'Several days' }).click();
    await dialog.getByRole('button', { name: 'Next month' }).click();
    const day = (n) => dialog.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${n}$`) });
    for (const d of ranges ? ranges.flat() : days) await day(d).click();
    if (description) await dialog.getByLabel('Description').fill(description);
    return dialog;
}

async function vote(page, title, which) {
    const sheet = await openEvent(page, title);
    const boxes = await sheet.getByRole('checkbox', { name: /I’m free on/ }).all();
    for (const i of which) {
        await boxes[i].click();
        await expect(boxes[i]).toHaveAttribute('aria-checked', 'true');
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
}

async function chat(page, text) {
    await page.getByRole('button', { name: /^Open chat/ }).click();
    const panel = page.getByRole('dialog', { name: 'Group chat' });
    await panel.getByRole('textbox').fill(text);
    await panel.getByRole('button', { name: 'Send' }).click();
    await expect(panel.getByText(text)).toBeVisible();
    await panel.getByRole('button', { name: 'Close chat' }).click();
}

/** Switch this browser to Malay (kept in localStorage) and reload. */
async function malay(page) {
    await page.evaluate(() => localStorage.setItem('planly.lang', 'ms'));
    await page.reload();
    await ready(page);
}

const settle = (page) => page.waitForTimeout(600); // let transitions finish
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

/** A tall page in one picture: grow the window to fit it (a full-page capture leaves the fixed sidebar short). */
async function tallShot(page, name) {
    const size = page.viewportSize();
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: size.width, height: Math.max(size.height, height) });
    await settle(page);
    await shot(page, name);
    await page.setViewportSize(size);
}

test('manual screenshots', async ({ page, browser }) => {
    test.setTimeout(8 * 60_000);
    fs.mkdirSync(OUT, { recursive: true });
    await resetEmulators();
    const mirza = await createUser({ name: 'Mirza', role: 'admin' });
    const redz = await createUser({ name: 'Redz' });
    const mirani = await createUser({ name: 'Mirani' });
    await createUser({ name: 'Hakim' });

    // --- Sample data (English UI) ---------------------------------------------
    await signIn(page, mirza);
    let dialog = await propose(page, {
        title: 'Trip Port Dickson',
        location: 'Port Dickson',
        description: 'Pantai, BBQ dan karaoke. Anggaran RM200 seorang.',
        ranges: [[10, 12], [17, 19]],
    });
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden();
    await vote(page, 'Trip Port Dickson', [0, 1]);
    await signOut(page);

    for (const [user, options, message] of [
        [redz, [0], 'Saya boleh 10–12 hb sahaja.'],
        [mirani, [0, 1], 'Dua-dua tarikh saya ok!'],
    ]) {
        await signIn(page, user);
        await vote(page, 'Trip Port Dickson', options);
        await chat(page, message);
        await signOut(page);
    }

    await signIn(page, redz);
    dialog = await propose(page, {
        title: 'Makan malam hari jadi Mirani',
        location: 'Bangsar',
        days: [5, 6, 7],
    });
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog).toBeHidden();
    await vote(page, 'Makan malam hari jadi Mirani', [1, 2]);
    await signOut(page);

    await signIn(page, mirza);
    let sheet = await openEvent(page, 'Trip Port Dickson');
    await sheet.getByRole('button', { name: 'Confirm these dates →' }).first().click();
    await page.getByRole('alertdialog').getByRole('button').last().click();
    await sheet.getByRole('button', { name: 'Join' }).click();
    await page.keyboard.press('Escape');
    await vote(page, 'Makan malam hari jadi Mirani', [1]);

    await page.getByRole('link', { name: 'Itinerary' }).filter({ visible: true }).first().click();
    await ready(page);
    for (const [time, end, activity, place] of [
        ['08:30', '10:00', 'Bertolak dari KL', 'R&R Seremban'],
        ['12:00', '13:00', 'Makan tengah hari', 'Restoran Pantai'],
        ['15:00', '', 'Check-in hotel', 'Lexis Hibiscus'],
        ['20:00', '22:30', 'BBQ tepi pantai', 'Lexis Hibiscus'],
    ]) {
        await page.getByRole('button', { name: 'Add to itinerary' }).first().click();
        const form = page.locator('form[data-item-form]');
        await form.locator('input[type="time"]').first().fill(time);
        if (end) await form.locator('input[type="time"]').nth(1).fill(end);
        await form.getByLabel('Activity').fill(activity);
        await form.getByLabel('Location').fill(place);
        await form.locator('button[type="submit"]').click();
        await expect(page.getByText(activity)).toBeVisible();
        await expect(form).toBeHidden();
    }
    for (const [item, qty, pic, done] of [
        ['Tikar & payung', '2', 'Redz', true],
        ['Arang BBQ', '3 beg', 'Mirza', true],
        ['Speaker', '1', 'Mirani', false],
        ['Air mineral', '2 kotak', 'Hakim', false],
    ]) {
        if (!(await page.locator('form[data-checklist-form]').isVisible())) {
            await page.getByRole('button', { name: 'Add item' }).click();
        }
        const form = page.locator('form[data-checklist-form]');
        await form.getByLabel('Item', { exact: true }).fill(item);
        await form.getByLabel('Qty').fill(qty);
        await form.locator('select').selectOption({ label: pic });
        await form.locator('button[type="submit"]').click();
        const toggle = page.getByRole('button', { name: `Mark done: ${item}` });
        await expect(toggle).toBeVisible();
        await expect(form.getByLabel('Item', { exact: true })).toHaveValue('');
        if (done) {
            await toggle.click();
            await expect(page.getByRole('button', { name: `Mark not done: ${item}` })).toBeVisible();
        }
    }

    await page.getByRole('link', { name: 'Expenses' }).filter({ visible: true }).first().click();
    await ready(page);
    for (const [what, amount, payer] of [
        ['Sewa hotel 2 malam', '640', 'Mirza (you)'],
        ['Barang BBQ', '180', 'Redz'],
        ['Minyak & tol', '96', 'Mirani'],
    ]) {
        const form = page.locator('form[data-expense-form]');
        if (!(await form.isVisible())) await page.getByRole('button', { name: 'Add expense' }).click();
        await form.getByLabel('Item').fill(what);
        await form.getByLabel('Amount').fill(amount);
        await form.getByLabel('Paid by').selectOption({ label: payer });
        if (await form.getByRole('button', { name: 'Everyone' }).isVisible()) {
            await form.getByRole('button', { name: 'Everyone' }).click();
        }
        await form.locator('button[type="submit"]').click();
        await expect(page.getByRole('button', { name: `Edit ${what}` })).toBeVisible();
        await expect(form.getByLabel('Item')).toHaveValue('');
    }
    await page.locator('form[data-expense-form]').getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Mark paid' }).first().click();
    const confirm = page.getByRole('alertdialog');
    if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button').last().click();
    await expect(page.getByRole('heading', { name: 'Payments made' })).toBeVisible();
    await chat(page, 'Hotel dah booking. Jumpa 10 hb!');

    // --- Screenshots (Malay) ---------------------------------------------------
    await malay(page);

    await page.getByRole('link', { name: 'Utama' }).filter({ visible: true }).first().click();
    await ready(page);
    await settle(page);
    await shot(page, '03-utama');

    await page.getByRole('button', { name: 'Cadang acara' }).filter({ visible: true }).first().click();
    dialog = page.getByRole('dialog', { name: 'Cadang acara' });
    await dialog.getByLabel('Tajuk').fill('Hiking Bukit Broga');
    await dialog.getByLabel('Lokasi').fill('Semenyih');
    await dialog.getByRole('button', { name: 'Bulan seterusnya' }).click();
    for (const d of [14, 21]) await dialog.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${d}$`) }).click();
    await settle(page);
    await shot(page, '05-cadang-acara');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    sheet = await openEvent(page, 'Makan malam hari jadi Mirani');
    await settle(page);
    await shot(page, '06-undi');
    await page.keyboard.press('Escape');

    sheet = await openEvent(page, 'Trip Port Dickson');
    await settle(page);
    await shot(page, '07-acara-disahkan');
    await page.keyboard.press('Escape');

    await page.getByRole('link', { name: 'Itinerari' }).filter({ visible: true }).first().click();
    await ready(page);
    await settle(page);
    await tallShot(page, '08-itinerari');

    await page.getByRole('link', { name: 'Perbelanjaan' }).filter({ visible: true }).first().click();
    await ready(page);
    await settle(page);
    await tallShot(page, '09-perbelanjaan');

    await page.getByRole('link', { name: 'Utama' }).filter({ visible: true }).first().click();
    await ready(page);
    await page.getByRole('button', { name: /^Buka sembang/ }).click();
    await expect(page.getByRole('dialog', { name: 'Sembang kumpulan' })).toBeVisible();
    await settle(page);
    await shot(page, '10-sembang');
    await page.getByRole('dialog', { name: 'Sembang kumpulan' }).getByRole('button', { name: 'Tutup sembang' }).click();

    await page.getByRole('button', { name: /Edit profil/ }).filter({ visible: true }).first().click();
    await expect(page.getByRole('dialog', { name: 'Profil anda' })).toBeVisible();
    await settle(page);
    await shot(page, '11-profil');
    await page.keyboard.press('Escape');

    // Dark mode, for the profile section.
    await page.evaluate(() => localStorage.setItem('planly.theme', 'dark'));
    await page.reload();
    await ready(page);
    await settle(page);
    await shot(page, '11b-mod-gelap');
    await page.evaluate(() => localStorage.setItem('planly.theme', 'light'));
    await signOut(page);

    // Sign-up and pending, as Aina (Malay, signed out).
    await openLogin(page);
    await settle(page);
    await shot(page, '01-log-masuk');
    await page.getByRole('tab', { name: 'Daftar akaun' }).click();
    await page.getByLabel('Nama anda').fill('Aina');
    await page.getByLabel('E-mel').fill('aina@example.com');
    await page.getByLabel('Kata laluan', { exact: true }).fill(PASSWORD);
    await page.locator('form button[type="submit"]').click();
    await expect(page).toHaveURL('/pending');
    await ready(page);
    await settle(page);
    await shot(page, '02-menunggu-kelulusan');
    await page.getByRole('button', { name: 'Log keluar' }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL('/login');

    // The admin's Members page, with Aina waiting.
    await signIn(page, mirza);
    await page.getByRole('link', { name: 'Ahli' }).filter({ visible: true }).first().click();
    await ready(page);
    await expect(page.getByText('aina@example.com')).toBeVisible();
    await settle(page);
    await shot(page, '12-ahli');

    // Phone: home and the profile menu.
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mobile = await phone.newPage();
    await mobile.addInitScript(() => localStorage.setItem('planly.lang', 'ms'));
    await signIn(mobile, mirani);
    await settle(mobile);
    await mobile.screenshot({ path: `${OUT}/04-telefon-utama.png` });
    await mobile.locator('button[aria-controls="profile-menu"]').click();
    await settle(mobile);
    await mobile.screenshot({ path: `${OUT}/04b-telefon-menu.png` });
    await phone.close();
});
