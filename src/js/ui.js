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
// closes only the top layer (dialog > chat > propose form / event sheet > day panel).
Alpine.store('overlays', { propose: false, chat: false, dialog: false });

// Confirmation dialog (partials/confirm-dialog.html), instead of window.confirm():
//
//   const ok = await confirmDialog({ title, message, detail, confirmLabel, tone, icon, action });
//
// tone: 'danger' | 'primary' | 'success'. With `action`, the dialog stays open
// showing progress on the confirm button until the action settles.
const DIALOG_DEFAULTS = {
    title: '',
    message: '',
    detail: '', // highlighted line, e.g. the event name
    detailSub: '', // smaller line under it, e.g. its dates
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'primary',
    icon: 'alert',
};

let settle = null; // resolves the open dialog's promise
let pendingAction = null;

Alpine.store('dialog', {
    ...DIALOG_DEFAULTS,
    open: false,
    busy: false,

    confirm(options) {
        settle?.(false); // a newer dialog replaces an unanswered one
        Object.assign(this, DIALOG_DEFAULTS, options);
        pendingAction = options.action ?? null;
        this.busy = false;
        this.open = true;
        Alpine.store('overlays').dialog = true;
        // A focus-trapped sheet underneath marks its siblings aria-hidden.
        document.getElementById('confirm-dialog')?.removeAttribute('aria-hidden');
        return new Promise((resolve) => (settle = resolve));
    },

    async accept() {
        if (this.busy) return;
        if (pendingAction) {
            this.busy = true;
            try {
                await pendingAction();
            } finally {
                this.busy = false;
            }
        }
        this.finish(true);
    },

    cancel() {
        if (!this.busy) this.finish(false);
    },

    finish(result) {
        this.open = false;
        Alpine.store('overlays').dialog = false;
        pendingAction = null;
        const resolve = settle;
        settle = null;
        resolve?.(result);
    },
});

export const confirmDialog = (options) => Alpine.store('dialog').confirm(options);
