import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';

// Feature modules register their Alpine components/stores on import.
import './ui';
import { boot } from './session';
import './auth';
import './events';
import './calendar';
import './propose';
import './itinerary';
import './itinerary-page';
import './chat';
import './members';

Alpine.plugin(focus);
window.Alpine = Alpine;

// Check sign-in and page access first, then render. If boot() redirects, the
// page never renders (the loading splash stays up until the browser leaves).
(async () => {
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
})();
