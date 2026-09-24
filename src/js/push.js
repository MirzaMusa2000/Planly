// Push notifications. Each device that turns them on gets a Web Push
// subscription, saved in users/{uid}/pushSubscriptions; after creating a
// proposal, chat message or sign-up, the browser asks the push worker
// (workers/push) to notify the others.
//
// Needs VITE_PUSH_URL and VITE_VAPID_PUBLIC_KEY at build time; without them
// (e.g. with the emulators) the feature stays hidden.
import Alpine from 'alpinejs';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { t } from './i18n';

const PUSH_URL = (import.meta.env.VITE_PUSH_URL || '').replace(/\/$/, '');
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
const configured = Boolean(PUSH_URL && VAPID_KEY);

const supported = configured && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// iPhone/iPad only allow push for apps added to the Home Screen.
const needsInstall = configured && !supported && isIos && !standalone;

const PROMPT_KEY = 'planly.pushPrompt'; // "dismissed" once the banner is closed
const OWNER_KEY = 'planly.pushOwner'; // "<uid> <endpoint>" last saved from this device

const storage = {
    get(key) {
        try {
            return window.localStorage.getItem(key);
        } catch {
            return null;
        }
    },
    set(key, value) {
        try {
            if (value == null) window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, value);
        } catch {
            // Only a convenience.
        }
    },
};

const toast = (message, type) => Alpine.store('toast').show(message, type);

function keyBytes(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Stable doc id per device: hash of the push endpoint. */
async function subscriptionId(endpoint) {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return [...new Uint8Array(hash)].slice(0, 20).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** "Chrome on Android": helps people recognise their devices later. */
function deviceLabel() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    const os = isIos ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'device';
    return `${browser} on ${os}`;
}

let registration = null;
const serviceWorker = () => (registration ??= navigator.serviceWorker.register('/sw.js'));

/** Save (or re-claim) this device for the signed-in user. */
async function saveSubscription(subscription, uid) {
    const { endpoint, keys } = subscription.toJSON();
    await setDoc(doc(db, 'users', uid, 'pushSubscriptions', await subscriptionId(endpoint)), {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        uid,
        userAgent: deviceLabel(),
        createdAt: serverTimestamp(),
    });
    storage.set(OWNER_KEY, `${uid} ${endpoint}`);
}

Alpine.store('push', {
    supported,
    needsInstall,
    permission: 'Notification' in window ? Notification.permission : 'default',
    enabled: false,
    ready: !supported, // true once we know whether this device is subscribed
    busy: false,
    promptDismissed: storage.get(PROMPT_KEY) === 'dismissed',

    /** The "turn on notifications" banner. */
    get showPrompt() {
        if (this.promptDismissed) return false;
        if (this.needsInstall) return true;
        return this.supported && this.ready && !this.enabled && this.permission === 'default';
    },

    get hint() {
        if (this.needsInstall) return t('Add Planly to your Home Screen first');
        if (this.permission === 'denied') return t('Blocked in your browser settings');
        return this.enabled ? t('On for this device') : t('New plans, chat and approvals');
    },

    /** Once the approved user is known: is this device already subscribed? */
    async start(uid) {
        if (!supported) return;
        try {
            const reg = await serviceWorker();
            const subscription = await reg.pushManager.getSubscription();
            this.permission = Notification.permission;
            if (subscription && this.permission === 'granted') {
                // Someone else used notifications on this browser before: claim it.
                if (storage.get(OWNER_KEY) !== `${uid} ${subscription.endpoint}`) await saveSubscription(subscription, uid);
                this.enabled = true;
            }
        } catch (e) {
            console.warn('Push notifications unavailable:', e);
        } finally {
            this.ready = true;
        }
    },

    async enable() {
        if (this.busy || !supported || !window.Planly.user) return;
        this.busy = true;
        try {
            this.permission = await Notification.requestPermission();
            if (this.permission !== 'granted') {
                toast(this.permission === 'denied'
                    ? t('Notifications are blocked. Allow them for this site in your browser settings.')
                    : t('Notifications weren’t turned on.'), 'error');
                return;
            }
            const reg = await serviceWorker();
            await navigator.serviceWorker.ready;
            const subscription = (await reg.pushManager.getSubscription())
                ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY) });
            await saveSubscription(subscription, window.Planly.user.uid);
            this.enabled = true;
            this.dismissPrompt();
            toast(t('Notifications are on for this device.'));
        } catch (e) {
            console.error(e);
            toast(t('Couldn’t turn on notifications. Please try again.'), 'error');
        } finally {
            this.busy = false;
        }
    },

    /** Turn off for this device (also on sign-out, so the next person doesn't get your alerts). */
    async disable({ quiet = false } = {}) {
        if (!supported || this.busy) return;
        this.busy = true;
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            const subscription = await reg?.pushManager.getSubscription();
            if (subscription) {
                const uid = auth.currentUser?.uid;
                if (uid) {
                    await deleteDoc(doc(db, 'users', uid, 'pushSubscriptions', await subscriptionId(subscription.endpoint)))
                        .catch((e) => console.warn(e));
                }
                await subscription.unsubscribe();
            }
            storage.set(OWNER_KEY, null);
            this.enabled = false;
            if (!quiet) toast(t('Notifications are off for this device.'));
        } catch (e) {
            console.error(e);
            if (!quiet) toast(t('Couldn’t turn off notifications. Please try again.'), 'error');
        } finally {
            this.busy = false;
        }
    },

    toggle() {
        return this.enabled ? this.disable() : this.enable();
    },

    dismissPrompt() {
        this.promptDismissed = true;
        storage.set(PROMPT_KEY, 'dismissed');
    },
});

/**
 * Ask the push worker to tell the others about something you just created.
 * Never throws: a missed notification shouldn't break the action itself.
 * @param {'signup'|'proposal'|'chat'} type
 */
export async function notify(type, data = {}) {
    if (!configured) return;
    try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const response = await fetch(`${PUSH_URL}/notify`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, ...data }),
        });
        if (!response.ok) console.warn(`Notify (${type}) failed: ${response.status}`);
    } catch (e) {
        console.warn(`Notify (${type}) failed:`, e);
    }
}
