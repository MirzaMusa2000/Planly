// Small shared UI stores.
import Alpine from 'alpinejs';

// Toast notifications: Alpine.store('toast').show('Saved!')
Alpine.store('toast', {
    items: [],
    nextId: 1,

    show(message, type = 'success', timeout = 3500) {
        const id = this.nextId++;
        this.items.push({ id, message, type });
        setTimeout(() => this.dismiss(id), timeout);
    },

    dismiss(id) {
        this.items = this.items.filter((t) => t.id !== id);
    },
});

// Desktop sidebar: full width or icons only, remembered on this device. The
// layout reacts to a class on <html> (Tailwind `collapsed:` variant), set here
// before the page is shown so it doesn't jump on load.
const SIDEBAR_KEY = 'planly.sidebar';

function readSidebarCollapsed() {
    try {
        return window.localStorage.getItem(SIDEBAR_KEY) === 'collapsed';
    } catch {
        return false;
    }
}

const applySidebar = (collapsed) => document.documentElement.classList.toggle('sidebar-collapsed', collapsed);

Alpine.store('sidebar', {
    collapsed: readSidebarCollapsed(),

    init() {
        applySidebar(this.collapsed);
    },

    toggle() {
        this.collapsed = !this.collapsed;
        applySidebar(this.collapsed);
        try {
            window.localStorage.setItem(SIDEBAR_KEY, this.collapsed ? 'collapsed' : 'expanded');
        } catch {
            // Not critical: it just won't be remembered.
        }
        // Let width-sensitive widgets (the calendar) re-measure after the slide.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 220);
    },
});

// Which top-level overlays are open. Escape handlers use it so a single press
// closes only the top layer (chat > propose form / event sheet > day panel).
Alpine.store('overlays', { propose: false, chat: false });
