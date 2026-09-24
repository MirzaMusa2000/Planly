// Planly service worker: shows push notifications and opens the right page when
// one is tapped. (No offline caching yet.) Served at /sw.js with no-cache so
// updates are picked up on the next visit.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

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
