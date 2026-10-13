// End-to-end tests: the real pages in a real browser, against the Firebase
// emulators (never the live project).
//
//   npm run test:e2e              starts the emulators, runs tests/e2e/*.spec.js
//   npm run test:e2e -- --headed  watch it happen
//   npm run test:system           the whole system as one video (videos/)
//
// Uses the Microsoft Edge that comes with Windows (no browser download). Set
// PW_CHANNEL=chrome for Google Chrome, or PW_CHANNEL= (empty) after
// `npx playwright install chromium` for Playwright's own browser.
import { defineConfig, devices } from '@playwright/test';

const PORT = 5174; // not 5173, so it can run next to `npm run dev:emulators`
const channel = process.env.PW_CHANNEL ?? 'msedge';

export default defineConfig({
    testDir: 'tests/e2e',
    // One shared emulator database, so one test at a time.
    workers: 1,
    fullyParallel: false,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
    outputDir: 'test-results',
    timeout: 60_000,
    expect: { timeout: 10_000 },

    use: {
        baseURL: `http://localhost:${PORT}`,
        channel: channel || undefined,
        locale: 'en-GB',
        timezoneId: 'Asia/Kuala_Lumpur',
        actionTimeout: 15_000,
        navigationTimeout: 30_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },

    projects: [
        { name: 'desktop', testIgnore: /system\.spec/, use: { ...devices['Desktop Chrome'], channel: channel || undefined } },
        { name: 'phone', testIgnore: /system\.spec/, use: { ...devices['Pixel 7'], channel: channel || undefined } },
        // The whole system as one recorded story (npm run test:system -> videos/).
        {
            name: 'system',
            testMatch: /system\.spec/,
            use: {
                ...devices['Desktop Chrome'],
                channel: channel || undefined,
                viewport: { width: 1280, height: 720 },
                video: { mode: 'on', size: { width: 1280, height: 720 } },
                launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 150) },
            },
        },
    ],

    webServer: {
        // The real build (like production), pointed at the emulators, in its own folder.
        command: `npx vite build --mode emulators --outDir ../dist-e2e --emptyOutDir && npx vite preview --mode emulators --outDir ../dist-e2e --port ${PORT} --strictPort`,
        url: `http://localhost:${PORT}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        // No push notifications from tests (they'd call the real worker).
        env: { VITE_PUSH_URL: '' },
    },
});
