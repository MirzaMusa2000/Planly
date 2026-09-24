// "Edit profile" dialog: change your display name and profile photo.
// The photo is cropped to a square and shrunk in the browser, then stored as a
// small data URL on users/{uid}.photoUrl (firestore.rules cap its size).
import Alpine from 'alpinejs';
import { updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

export const PHOTO_SIZE = 256; // px, square
export const PHOTO_MAX_LENGTH = 120_000; // characters of data URL (~90 KB)
const NAME_MAX = 60;

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('That file isn’t an image we can read. Try a JPG or PNG.'));
        };
        img.src = url;
    });
}

/**
 * Centre-crop to a square, resize to PHOTO_SIZE and compress (WebP where the
 * browser can, else JPEG), stepping quality down until it fits.
 */
export async function photoFromFile(file) {
    if (!file.type.startsWith('image/')) throw new Error('Pick an image file.');
    if (file.size > 20 * 1024 * 1024) throw new Error('That image is too large (max 20 MB).');

    const img = await loadImage(file);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_SIZE;
    canvas.height = PHOTO_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no transparency
    ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

    for (const quality of [0.85, 0.75, 0.6, 0.45]) {
        let url = canvas.toDataURL('image/webp', quality);
        if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality); // Safari
        if (url.length <= PHOTO_MAX_LENGTH) return url;
    }
    throw new Error('Couldn’t make that photo small enough. Try another one.');
}

Alpine.data('profileDialog', () => ({
    NAME_MAX,
    open: false,
    name: '',
    photo: '', // data URL being edited ('' = none)
    busy: false,
    reading: false,
    error: '',

    init() {
        window.addEventListener('open-profile', () => this.show());
        this.$watch('open', (value) => (Alpine.store('overlays').profile = value));
    },

    get me() {
        return Alpine.store('session').user;
    },

    get initial() {
        return (this.name || this.me?.displayName || '?').trim().charAt(0).toUpperCase();
    },

    get changed() {
        return this.name.trim() !== (this.me?.displayName ?? '') || this.photo !== (Alpine.store('people').photo(this.me?.uid) || '');
    },

    show() {
        if (!this.me) return;
        this.name = this.me.displayName ?? '';
        this.photo = Alpine.store('people').photo(this.me.uid) || '';
        this.error = '';
        this.open = true;
    },

    close() {
        if (!this.busy) this.open = false;
    },

    pick() {
        this.$refs.file.value = '';
        this.$refs.file.click();
    },

    async onFile(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        this.error = '';
        this.reading = true;
        try {
            this.photo = await photoFromFile(file);
        } catch (e) {
            this.error = e.message;
        } finally {
            this.reading = false;
        }
    },

    removePhoto() {
        this.photo = '';
    },

    async save() {
        if (this.busy) return;
        const name = this.name.trim();
        if (!name) {
            this.error = 'Your name can’t be empty.';
            return;
        }
        if (!this.changed) {
            this.open = false;
            return;
        }

        this.busy = true;
        this.error = '';
        try {
            const updates = {};
            if (name !== this.me.displayName) updates.displayName = name.slice(0, NAME_MAX);
            if (this.photo !== (Alpine.store('people').photo(this.me.uid) || '')) updates.photoUrl = this.photo || null;
            await updateDoc(doc(db, 'users', this.me.uid), updates);
            if (updates.displayName && auth.currentUser) {
                updateProfile(auth.currentUser, { displayName: updates.displayName }).catch(() => {});
            }
            this.open = false;
            Alpine.store('toast').show('Profile updated.');
        } catch (e) {
            console.error(e);
            this.error = e?.code === 'permission-denied'
                ? 'That change wasn’t allowed. Try a smaller photo.'
                : 'Couldn’t save. Check your connection and try again.';
        } finally {
            this.busy = false;
        }
    },
}));
