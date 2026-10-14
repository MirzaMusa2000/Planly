// "What's new" popup, shown once per release on each device when Planly opens,
// and a "new version ready" bar when this page is older than what's deployed
// (pages come from the service worker's cache first, so a release usually
// shows from the second open: the bar offers it straight away).
//
// Releasing something people should hear about: add an entry at the top of
// RELEASES (id = release date). Every deploy gets a new build id
// (vite.config.js writes it into the code and /version.json).
import Alpine from 'alpinejs';
import { N_, t } from './i18n';

const SEEN_KEY = 'planly.seenRelease';
const PAGES_CACHE = 'planly-pages-v1'; // public/sw.js

/** Newest first. Each item: [emoji, title, one line]. */
export const RELEASES = [
    {
        id: '2026-10-14',
        items: [
            ['🏖️', N_('Kinds of plan'), N_('Every event has an emoji and colour: beach, food, trip and more. Pick one when proposing, or change it from the event.')],
            ['⏳', N_('Countdown on Home'), N_('Your next event and how many days to go. Not answered yet? Join or say you can’t, right there.')],
            ['🗺️', N_('Waze and Google Maps'), N_('Tap Waze or Google Maps under a location for directions.')],
            ['🌦️', N_('Weather'), N_('The forecast for each day of an event, up to 16 days ahead.')],
            ['✏️', N_('Change the location'), N_('Whoever proposed an event, or the admin, can change where it is.')],
            ['🔔', N_('Event reminders'), N_('A notification a week and a day before each event you’re coming to.')],
        ],
    },
];

const storage = {
    get(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            // private mode: the popup may show again next time, that's all
        }
    },
};

Alpine.data('whatsNew', () => ({
    open: false,
    updateReady: false,
    release: RELEASES[0],

    init() {
        this.$watch('open', (value) => (Alpine.store('overlays').whatsNew = value));
        if (storage.get(SEEN_KEY) !== this.release.id) setTimeout(() => (this.open = true), 800);
        this.checkVersion();
        // Phones keep the app open for days: check again when it comes back.
        document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && this.checkVersion());
    },

    get items() {
        return this.release.items.map(([emoji, title, body]) => ({ emoji, title: t(title), body: t(body) }));
    },

    close() {
        this.open = false;
        storage.set(SEEN_KEY, this.release.id);
    },

    /** Is a newer build deployed than the one running? (Not in dev, which has no version.json.) */
    async checkVersion() {
        if (import.meta.env.DEV || this.updateReady) return;
        try {
            const response = await fetch('/version.json', { cache: 'no-store' });
            if (!response.ok) return;
            const { build } = await response.json();
            if (build && build !== __PLANLY_BUILD__) this.updateReady = true;
        } catch {
            // offline: try again next time
        }
    },

    /** Drop the cached pages so this load comes from the server, then reload. */
    async refresh() {
        try {
            if ('caches' in window) await caches.delete(PAGES_CACHE);
        } catch {
            // no cache access: a plain reload still gets there on the next open
        }
        window.location.reload();
    },
}));
