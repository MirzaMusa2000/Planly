import './bootstrap';
import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';

// Feature modules register their Alpine components/stores on import, before
// Alpine starts. Later phases add: voting, itinerary, chat.
import './toast';
import './auth';
import './events';
import './calendar';
import './propose';

Alpine.plugin(focus);
window.Alpine = Alpine;
Alpine.start();
