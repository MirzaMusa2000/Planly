import './bootstrap';
import Alpine from 'alpinejs';

// Feature modules register their Alpine components on import, before Alpine
// starts. Later phases add: calendar, voting, itinerary, chat.
import './auth';

window.Alpine = Alpine;
Alpine.start();
