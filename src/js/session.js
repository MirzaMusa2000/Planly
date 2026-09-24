// Who is signed in, and may they see this page? Replaces the Laravel session
// + EnsureApproved/EnsureAdmin middleware. Firestore rules are the real
// security boundary; this only decides what to show and where to redirect.
//
// Each page declares <body data-access="guest|pending|approved|admin|public">.
import Alpine from 'alpinejs';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { clearIndexedDbPersistence, doc, getDoc, getDocFromCache, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { notify } from './push';
import { startPeopleFeed } from './people';
import { lang } from './i18n';

export const TIMEZONE = 'Asia/Kuala_Lumpur';

window.Planly = { timezone: TIMEZONE, user: null, pending: null };

const userRef = (uid) => doc(db, 'users', uid);

Alpine.store('session', {
    user: null, // { uid, email, displayName, role } for approved members
    pending: null, // { uid, email, displayName, status } on the waiting page
    page: document.body.dataset.page || '',

    get isAdmin() {
        return this.user?.role === 'admin';
    },

    get initial() {
        return (this.user?.displayName || '?').trim().charAt(0).toUpperCase();
    },

    /** "+" / "Propose event": open the form here, or on Home if elsewhere. */
    propose() {
        if (this.page === 'home') window.dispatchEvent(new CustomEvent('propose-event'));
        else window.location.assign('/#propose');
    },

    async logout(reason = null) {
        // This device shouldn't keep getting your notifications after you leave.
        await Alpine.store('push').disable({ quiet: true });
        await signOut(auth).catch(() => {});
        window.location.replace(reason ? `/login?reason=${reason}` : '/login');
    },
});

/** Resolves once Firebase has restored the persisted user (or null). */
export function authReady() {
    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            resolve(user);
        });
    });
}

/**
 * The signed-in user's profile, creating it as "pending" on first sign-in.
 * (firestore.rules only allow creating your own doc as a pending member.)
 */
export async function ensureUserDoc(user, displayName = null) {
    const ref = userRef(user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data();

    const profile = {
        email: user.email,
        displayName: (displayName || user.displayName || user.email.split('@')[0]).trim().slice(0, 60),
        photoUrl: user.photoURL ?? null,
        role: 'member',
        status: 'pending',
        createdAt: serverTimestamp(),
        approvedAt: null,
        approvedBy: null,
        lastReadChatAt: null,
    };
    await setDoc(ref, profile);
    // Tell the admins someone is waiting (don't hold up sign-up for long).
    await Promise.race([notify('signup'), new Promise((resolve) => setTimeout(resolve, 3000))]);
    return profile;
}

/**
 * The profile as last seen on this device, or null. Pages use it to open at
 * once; watchSession() then checks the live copy and redirects if access has
 * changed (and firestore.rules check every read and write anyway).
 */
async function cachedApprovedProfile(uid) {
    try {
        const snap = await getDocFromCache(userRef(uid));
        return snap.exists() && snap.data().status === 'approved' ? snap.data() : null;
    } catch {
        return null; // not cached yet, or no offline cache in this browser
    }
}

/** Where a signed-in user belongs, given their profile. */
export function homeFor(profile) {
    return profile?.status === 'approved' ? '/' : '/pending';
}

let approvedUserPromise = null;

/** The approved Firebase user (for modules that attach listeners). */
export function approvedUser() {
    return approvedUserPromise ?? Promise.resolve(null);
}

/**
 * Enforce the page's access level. Resolves true when the page may render,
 * false when a redirect is under way.
 */
export async function boot() {
    const access = document.body.dataset.access || 'public';
    if (access === 'public') return true;

    const user = await authReady();

    if (access === 'guest') {
        // Signed out: forget the previous person's cached data on this device.
        // (Safe here: nothing has used Firestore on this page yet.)
        if (!user) {
            await clearIndexedDbPersistence(db).catch(() => {});
            return true;
        }
        // Already signed in? Continue straight to where they belong.
        const profile = await ensureUserDoc(user).catch(() => null);
        if (!profile) return true;
        window.location.replace(homeFor(profile));
        return false;
    }

    if (!user) {
        window.location.replace('/login');
        return false;
    }

    // Approved members: open from the cached profile (instant), else ask the server.
    const pageNeedsServer = access === 'pending';
    const profile = (!pageNeedsServer && await cachedApprovedProfile(user.uid)) || await ensureUserDoc(user);

    if (access === 'pending') {
        if (profile.status === 'approved') {
            window.location.replace('/');
            return false;
        }
        const pending = { uid: user.uid, email: profile.email, displayName: profile.displayName, status: profile.status };
        window.Planly.pending = pending;
        Alpine.store('session').pending = pending;
        return true;
    }

    // approved / admin pages
    if (profile.status !== 'approved') {
        window.location.replace('/pending');
        return false;
    }
    if (access === 'admin' && profile.role !== 'admin') {
        window.location.replace('/');
        return false;
    }

    const me = { uid: user.uid, email: profile.email, displayName: profile.displayName, role: profile.role || 'member' };
    window.Planly.user = me;
    Alpine.store('session').user = me;
    approvedUserPromise = Promise.resolve(user);
    Alpine.store('push').start(user.uid);
    startPeopleFeed();
    // Notifications are sent in each person's language (workers/push).
    window.Planly.saveLang = (next) => setDoc(userRef(user.uid), { lang: next }, { merge: true }).catch(() => {});
    if (profile.lang !== lang) window.Planly.saveLang(lang);

    watchSession(user.uid, access);
    return true;
}

/**
 * Keep the page honest while it's open: signed out elsewhere -> login;
 * rejected/revoked -> pending page ("Access denied"); role changes -> update.
 */
function watchSession(uid, access) {
    onAuthStateChanged(auth, (user) => {
        if (!user || user.uid !== uid) window.location.replace('/login');
    });

    onSnapshot(userRef(uid), (snap) => {
        const profile = snap.data();
        if (!profile || profile.status !== 'approved') {
            window.location.replace('/pending');
            return;
        }
        const session = Alpine.store('session');
        session.user = { ...session.user, role: profile.role || 'member', displayName: profile.displayName };
        window.Planly.user = session.user;
        if (access === 'admin' && profile.role !== 'admin') window.location.replace('/');
    }, () => {});
}
