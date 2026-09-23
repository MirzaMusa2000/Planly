import './bootstrap';
import Alpine from 'alpinejs';
import focus from '@alpinejs/focus';

// Feature modules register their Alpine components/stores on import, before
// Alpine starts.
import './ui';
import './auth';
import './events';
import './calendar';
import './propose';
import './itinerary';
import './chat';

Alpine.plugin(focus);
window.Alpine = Alpine;
Alpine.start();
