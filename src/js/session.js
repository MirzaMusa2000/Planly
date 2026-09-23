// Who is signed in, and may they see this page? Replaces the Laravel session
// + EnsureApproved/EnsureAdmin middleware. Firestore rules are the real
// security boundary; this only decides what to show and where to redirect.
//
// Each page declares <body data-access="guest|pending|approved|admin|public">.
import Alpine from 'alpinejs';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

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
    return profile;
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
        // Already signed in? Continue straight to where they belong.
        if (!user) return true;
        const profile = await ensureUserDoc(user).catch(() => null);
        if (!profile) return true;
        window.location.replace(homeFor(profile));
        return false;
    }

    if (!user) {
        window.location.replace('/login');
        return false;
    }

    const profile = await ensureUserDoc(user);

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
