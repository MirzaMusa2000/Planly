// Tiny toast notifications: Alpine.store('toast').show('Saved!')
import Alpine from 'alpinejs';

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
