import './bootstrap';
import Alpine from 'alpinejs';

// Feature modules register their Alpine components before Alpine starts.
// (Added phase by phase: auth, calendar, voting, itinerary, chat.)

window.Alpine = Alpine;
Alpine.start();
