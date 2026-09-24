import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';

// Feature modules register their Alpine components/stores on import.
import './ui';
import './push';
import './people';
import './profile';
import { boot } from './session';
import './auth';
import './events';
import './calendar';
import './propose';
import './itinerary';
import './itinerary-page';
import './expenses-page';
import './chat';
import './members';

Alpine.plugin(focus);
window.Alpine = Alpine;

// The service worker caches pages and assets (fast page switches) and shows
// push notifications. Registering again is a no-op.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// Check sign-in and page access first, then render. If boot() redirects, the
// page never renders (the loading splash stays up until the browser leaves).
// "planly:boot" in DevTools > Performance shows how long that took.
(async () => {
    performance.mark('planly:boot-start');
    let allowed = false;
    try {
        allowed = await boot();
    } catch (e) {
        console.error(e);
        document.querySelector('#boot-splash p').textContent = 'Couldn’t reach Planly. Check your connection and refresh.';
        return;
    }
    if (!allowed) return;

    Alpine.start();
    document.getElementById('boot-splash')?.remove();
    performance.measure('planly:boot', 'planly:boot-start');
})();
