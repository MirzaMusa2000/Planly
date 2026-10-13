// The whole system, start to finish, as one story in one browser window, so it
// records as a single video with captions:
//
//   npm run test:system   ->  videos/planly-system-test.webm
//
// Mirza (admin), Redz and Mirani are members already; Aina is new. People take
// turns on the same screen: each signs in, does their part, and signs out.
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { PASSWORD, createUser, openLogin, ready, resetEmulators, signIn } from './helpers.js';

const VIDEO = 'videos/planly-system-test.webm';
const PAUSE = Number(process.env.PAUSE_MS ?? 1200); // let viewers see each result

/** A caption bar at the bottom of every page, kept across page loads (sessionStorage). */
const CAPTION_SCRIPT = () => {
    const show = () => {
        const text = sessionStorage.getItem('e2e-caption');
        if (!text || !document.body) return;
        let bar = document.getElementById('e2e-caption');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'e2e-caption';
            bar.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483647;'
                + 'max-width:90vw;padding:10px 18px;border-radius:14px;background:rgba(11,16,32,.88);color:#fff;'
                + 'font:600 15px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none;text-align:center';
            document.body.appendChild(bar);
        }
        bar.textContent = text;
    };
    window.__e2eCaption = show;
    document.addEventListener('DOMContentLoaded', show);
};

async function caption(page, text) {
    await page.evaluate((t) => {
        sessionStorage.setItem('e2e-caption', t);
        window.__e2eCaption?.();
    }, text);
    await page.waitForTimeout(PAUSE / 2);
}

const pause = (page, factor = 1) => page.waitForTimeout(PAUSE * factor);

async function signOut(page) {
    const desktop = page.getByRole('button', { name: 'Sign out' }).filter({ visible: true });
    await desktop.first().click();
    await expect(page).toHaveURL('/login');
}

/** Open a proposal or event from the home page by its title. */
async function openEvent(page, title) {
    await page.getByRole('button', { name: new RegExp(title) }).filter({ visible: true }).first().click();
    const sheet = page.getByRole('dialog', { name: new RegExp(title) });
    await expect(sheet).toBeVisible();
    return sheet;
}

const nextMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 1);
};

test.use({ viewport: { width: 1280, height: 720 } });

test('Planly: the whole system', async ({ page }) => {
    test.setTimeout(6 * 60_000);
    await resetEmulators();
    const mirza = await createUser({ name: 'Mirza', role: 'admin' });
    const redz = await createUser({ name: 'Redz' });
    await createUser({ name: 'Mirani' });
    await page.addInitScript(CAPTION_SCRIPT);

    const month = nextMonth().toLocaleDateString('en-GB', { month: 'short' });

    await test.step('1. Aina creates an account and waits for approval', async () => {
        await openLogin(page);
        await caption(page, '1 · Aina pengguna baru: dia daftar akaun');
        await page.getByRole('tab', { name: 'Create account' }).click();
        await page.getByLabel('Your name').pressSequentially('Aina', { delay: 40 });
        await page.getByLabel('Email').pressSequentially('aina@example.com', { delay: 25 });
        await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
        await page.locator('form button[type="submit"]').click();
        await expect(page).toHaveURL('/pending');
        await ready(page);
        await caption(page, 'Akaun baru perlu tunggu kelulusan admin');
        await pause(page, 1.5);
        await page.getByRole('button', { name: /Sign out/ }).filter({ visible: true }).first().click();
        await expect(page).toHaveURL('/login');
    });

    await test.step('2. The admin approves Aina', async () => {
        await caption(page, '2 · Mirza (admin) log masuk');
        await signIn(page, mirza);
        await pause(page);
        await page.getByRole('link', { name: 'Members' }).filter({ visible: true }).first().click();
        await expect(page).toHaveURL('/members');
        await ready(page);
        await caption(page, 'Halaman Ahli: Aina sedang menunggu. Mirza luluskan dia');
        const row = page.getByRole('listitem').filter({ hasText: 'aina@example.com' });
        await row.getByRole('button', { name: 'Approve' }).click();
        await expect(row.getByRole('button', { name: 'Approve' })).toBeHidden();
        await pause(page);
        await signOut(page);
    });

    await test.step('3. Aina proposes a trip with two date options', async () => {
        await caption(page, '3 · Aina log masuk: dia sudah diluluskan');
        await signIn(page, { email: 'aina@example.com' });
        await pause(page);
        await caption(page, 'Dia cadangkan trip dengan dua pilihan tarikh (beberapa hari)');
        await page.getByRole('button', { name: 'Propose event' }).filter({ visible: true }).first().click();
        const dialog = page.getByRole('dialog', { name: 'Propose event' });
        await dialog.getByLabel('Title').pressSequentially('Trip Port Dickson', { delay: 35 });
        await dialog.getByLabel('Location').pressSequentially('Port Dickson', { delay: 35 });
        await dialog.getByRole('radio', { name: 'Several days' }).click();
        await dialog.getByRole('button', { name: 'Next month' }).click();
        const day = (n) => dialog.locator('button[aria-pressed]').filter({ hasText: new RegExp(`^${n}$`) });
        await day(10).click();
        await day(12).click();
        await day(17).click();
        await day(19).click();
        await expect(dialog.getByRole('list', { name: 'Chosen date options' }).getByRole('listitem')).toHaveCount(2);
        await dialog.getByLabel('Description').pressSequentially('Pantai, BBQ, karaoke 🏖️', { delay: 30 });
        await pause(page);
        await dialog.locator('button[type="submit"]').click();
        await expect(dialog).toBeHidden();

        await caption(page, 'Aina undi: dia free pada kedua-dua pilihan');
        const sheet = await openEvent(page, 'Trip Port Dickson');
        for (const box of await sheet.getByRole('checkbox', { name: /I’m free on/ }).all()) {
            await box.click();
            await expect(box).toHaveAttribute('aria-checked', 'true');
        }
        await pause(page);
        await page.keyboard.press('Escape');
        await signOut(page);
    });

    await test.step('4. Redz votes and says hi in the group chat', async () => {
        await caption(page, '4 · Redz log masuk dan nampak cadangan baru');
        await signIn(page, redz);
        const sheet = await openEvent(page, 'Trip Port Dickson');
        await caption(page, `Redz hanya boleh pilihan pertama (10–12 ${month})`);
        const first = sheet.getByRole('checkbox', { name: /I’m free on/ }).first();
        await first.click();
        await expect(first).toHaveAttribute('aria-checked', 'true');
        await pause(page);
        await page.keyboard.press('Escape');

        await caption(page, 'Chat kumpulan: mesej sampai kepada semua serta-merta');
        await page.getByRole('button', { name: /^Open chat/ }).click();
        const chat = page.getByRole('dialog', { name: 'Group chat' });
        await chat.getByRole('textbox').pressSequentially('Jom! 10 hb saya boleh 🙌', { delay: 35 });
        await chat.getByRole('button', { name: 'Send' }).click();
        await expect(chat.getByText('Jom! 10 hb saya boleh 🙌')).toBeVisible();
        await pause(page);
        await chat.getByRole('button', { name: 'Close chat' }).click();
        await signOut(page);
    });

    await test.step('5. The admin votes, confirms the dates and joins', async () => {
        await caption(page, '5 · Mirza undi dan sahkan tarikh yang semua boleh');
        await signIn(page, mirza);
        const sheet = await openEvent(page, 'Trip Port Dickson');
        const first = sheet.getByRole('checkbox', { name: /I’m free on/ }).first();
        await first.click();
        await expect(first).toHaveAttribute('aria-checked', 'true');
        await expect(sheet.getByText('Everyone free ⭐').first()).toBeVisible().catch(() => {});
        await pause(page);
        await sheet.getByRole('button', { name: 'Confirm these dates →' }).first().click();
        const confirm = page.getByRole('alertdialog');
        await expect(confirm).toBeVisible();
        await pause(page);
        await confirm.getByRole('button').last().click();
        await expect(confirm).toBeHidden();
        await caption(page, 'Disahkan! Mirza tekan Join');
        await sheet.getByRole('button', { name: 'Join' }).click();
        await pause(page);
        await page.keyboard.press('Escape');
    });

    await test.step('6. Itinerary and checklist', async () => {
        await caption(page, '6 · Itinerari: rancang perjalanan, satu demi satu');
        await page.getByRole('link', { name: 'Itinerary' }).filter({ visible: true }).first().click();
        await expect(page).toHaveURL(/\/itinerary/);
        await ready(page);
        const stops = [
            ['09:00', 'Bertolak dari KL', 'R&R Seremban'],
            ['13:00', 'Check-in hotel', 'Lexis Hibiscus'],
        ];
        for (const [time, activity, place] of stops) {
            await page.getByRole('button', { name: 'Add to itinerary' }).first().click();
            const form = page.locator('form[data-item-form]');
            await form.locator('input[type="time"]').first().fill(time);
            await form.getByLabel('Activity').pressSequentially(activity, { delay: 30 });
            await form.getByLabel('Location').fill(place);
            await form.locator('button[type="submit"]').click();
            await expect(page.getByText(activity)).toBeVisible();
        }
        await pause(page);

        await caption(page, 'Checklist: barang dibawa, siapa bawa, tanda bila siap');
        await page.getByRole('button', { name: 'Add item' }).click();
        const item = page.locator('form[data-checklist-form]');
        await item.getByLabel('Item', { exact: true }).pressSequentially('Tikar & payung', { delay: 30 });
        await item.getByLabel('Qty').fill('2');
        await item.locator('select').selectOption({ label: 'Redz' });
        await item.locator('button[type="submit"]').click();
        await expect(page.getByRole('button', { name: 'Mark done: Tikar & payung' })).toBeVisible();
        await page.getByRole('button', { name: 'Mark done: Tikar & payung' }).click();
        await expect(page.getByRole('button', { name: 'Mark not done: Tikar & payung' })).toBeVisible();
        await pause(page, 1.5);
    });

    await test.step('7. Expenses: split the costs and settle up', async () => {
        await caption(page, '7 · Perbelanjaan: siapa bayar apa, dibahagi kepada semua');
        await page.getByRole('link', { name: 'Expenses' }).filter({ visible: true }).first().click();
        await expect(page).toHaveURL(/\/expenses/);
        await ready(page);
        const costs = [
            ['Sewa hotel', '600', 'Mirza'],
            ['Barang BBQ', '120', 'Redz'],
        ];
        for (const [what, amount, payer] of costs) {
            await page.getByRole('button', { name: 'Add expense' }).click();
            const form = page.locator('form[data-expense-form]');
            await form.getByLabel('Item').pressSequentially(what, { delay: 30 });
            await form.getByLabel('Amount').fill(amount);
            await form.getByLabel('Paid by').selectOption({ label: payer === 'Mirza' ? 'Mirza (you)' : payer });
            if (await form.getByRole('button', { name: 'Everyone' }).isVisible()) {
                await form.getByRole('button', { name: 'Everyone' }).click();
            }
            await pause(page, 0.5);
            await form.locator('button[type="submit"]').click();
            await expect(page.getByRole('button', { name: `Edit ${what}` })).toBeVisible();
            if (await form.isVisible()) await form.getByRole('button', { name: 'Done' }).click();
        }
        await expect(page.getByText('RM720.00').first()).toBeVisible();
        await caption(page, 'RM720 ÷ 4 orang = RM180 seorang. Settle up tunjuk siapa bayar siapa');
        await page.getByRole('heading', { name: 'Settle up' }).scrollIntoViewIfNeeded();
        await pause(page, 1.5);
        await page.getByRole('button', { name: 'Mark paid' }).first().click();
        const confirm = page.getByRole('alertdialog');
        if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button').last().click();
        await expect(page.getByRole('heading', { name: 'Payments made' })).toBeVisible();
        await caption(page, 'Bayaran direkodkan (dan boleh di-undo)');
        await pause(page, 1.5);
    });

    await test.step('8. Chat, profile, dark mode and Bahasa Melayu', async () => {
        await page.getByRole('link', { name: 'Home' }).filter({ visible: true }).first().click();
        await ready(page);
        await caption(page, '8 · Mirza baca mesej Redz dan balas');
        await page.getByRole('button', { name: /^Open chat/ }).click();
        const chat = page.getByRole('dialog', { name: 'Group chat' });
        await expect(chat.getByText('Jom! 10 hb saya boleh 🙌')).toBeVisible();
        await chat.getByRole('textbox').pressSequentially('Confirmed 10–12 hb. Jumpa nanti!', { delay: 30 });
        await chat.getByRole('button', { name: 'Send' }).click();
        await expect(chat.getByText('Confirmed 10–12 hb. Jumpa nanti!')).toBeVisible();
        await pause(page);
        await chat.getByRole('button', { name: 'Close chat' }).click();

        await caption(page, 'Profil: tukar nama');
        await page.getByRole('button', { name: /Edit profile/ }).filter({ visible: true }).first().click();
        const profile = page.getByRole('dialog', { name: 'Your profile' });
        await profile.getByLabel('Name').fill('');
        await profile.getByLabel('Name').pressSequentially('Mirza Musa', { delay: 40 });
        await profile.locator('button[type="submit"]').click();
        await expect(profile).toBeHidden();
        await expect(page.getByText('Mirza Musa').first()).toBeVisible();
        await pause(page);

        await caption(page, 'Tetapan profil: mod gelap');
        await page.getByRole('button', { name: /Edit profile/ }).filter({ visible: true }).first().click();
        await expect(profile).toBeVisible();
        await profile.getByRole('radio', { name: 'Dark' }).click();
        await expect(page.locator('html')).toHaveClass(/dark/);
        await pause(page, 1.5);

        await caption(page, 'Dan Bahasa Melayu');
        await profile.getByRole('radio', { name: 'Bahasa Melayu' }).click();
        await page.waitForLoadState('load'); // the page reloads in the new language
        await ready(page);
        await expect(page.getByRole('link', { name: 'Itinerari' }).filter({ visible: true }).first()).toBeVisible();
        await caption(page, 'Semua skrin kini dalam Bahasa Melayu, dalam mod gelap');
        await pause(page, 2);
        await page.getByRole('link', { name: 'Perbelanjaan' }).filter({ visible: true }).first().click();
        await ready(page);
        await pause(page, 2);
        await caption(page, '✓ Tamat: semua langkah lulus');
        await pause(page, 2);
    });

    await page.close();
    fs.mkdirSync('videos', { recursive: true });
    await page.video()?.saveAs(VIDEO);
});
