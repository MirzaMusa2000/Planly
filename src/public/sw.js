// Planly service worker: makes switching pages fast, shows push notifications
// and opens the right page when one is tapped. Served at /sw.js with no-cache
// so updates are picked up on the next visit.
//
// Caching (not on localhost, so the dev server stays live):
//  - /assets/* (hashed, never change): cache first.
//  - pages: served from the cache at once, refreshed in the background, so a
//    new deploy shows from the next page on. Their assets stay cached too,
//    so an older page never points at missing files.

const PAGES = 'planly-pages-v1';
const ASSETS = 'planly-assets-v1';
const MAX_ASSETS = 60;
const caching = !['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil((async () => {
    const keep = new Set([PAGES, ASSETS]);
    for (const name of await caches.keys()) if (!keep.has(name)) await caches.delete(name);
    await self.clients.claim();
})()));

async function trim(cache, max) {
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

async function assetFirst(request) {
    const cache = await caches.open(ASSETS);
    const hit = await cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) {
        await cache.put(request, response.clone());
        trim(cache, MAX_ASSETS);
    }
    return response;
}

async function pageFromCache(event) {
    const url = new URL(event.request.url);
    const key = url.origin + url.pathname; // ?event=… and #… share one copy
    const cache = await caches.open(PAGES);
    const refresh = fetch(event.request).then(async (response) => {
        if (response.ok && !response.redirected) await cache.put(key, response.clone());
        return response;
    });
    const hit = await cache.match(key);
    if (hit) {
        event.waitUntil(refresh.catch(() => {}));
        return hit;
    }
    return refresh;
}

self.addEventListener('fetch', (event) => {
    if (!caching || event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(assetFirst(event.request));
    } else if (event.request.mode === 'navigate') {
        event.respondWith(pageFromCache(event));
    }
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { body: event.data?.text() };
    }

    event.waitUntil(self.registration.showNotification(data.title || 'Planly', {
        body: data.body || '',
        tag: data.tag,
        renotify: Boolean(data.tag), // still buzz when replacing an older one
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        data: { url: data.url || '/' },
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || '/', self.location.origin).href;

    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
        if (open) {
            await open.focus();
            try {
                await open.navigate(url);
                return;
            } catch {
                // Not controlled by this worker yet: open a new window instead.
            }
        }
        await self.clients.openWindow(url);
    })());
});
