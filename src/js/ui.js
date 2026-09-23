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

// Which top-level overlays are open. Escape handlers use it so a single press
// closes only the top layer (chat > propose form / event sheet > day panel).
Alpine.store('overlays', { propose: false, chat: false });
