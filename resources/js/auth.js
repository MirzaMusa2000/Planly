// Firebase sign-in, the Firebase ID token → Laravel session exchange, and a
// guard that keeps the two sessions in sync on authenticated pages.
import Alpine from 'alpinejs';
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

// ---------------------------------------------------------------------------
// Sign-in methods. Each resolves to a Firebase User. To add Email Link
// (passwordless) later, add an `emailLink` provider with the same shape and a
// matching mode in the login form; establishSession() stays the same.
// ---------------------------------------------------------------------------
export const providers = {
    emailPassword: {
        async signIn({ email, password }) {
            const { user } = await signInWithEmailAndPassword(auth, email, password);
            return user;
        },
        async signUp({ email, password, displayName }) {
            const { user } = await createUserWithEmailAndPassword(auth, email, password);
            if (displayName) {
                await updateProfile(user, { displayName });
            }
            return user;
        },
    },
};

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
 * The signed-in user, with a token that carries the `approved` claim. Feature
 * modules await this before attaching Firestore listeners, so the security
 * rules never see a stale, claim-less token. Resolves to null if signed out.
 */
let approvedUserPromise = null;
export function approvedUser() {
    approvedUserPromise ??= authReady().then(async (user) => {
        if (!user) return null;
        const { claims } = await user.getIdTokenResult();
        if (claims.approved !== true) {
            await user.getIdToken(true);
        }
        return user;
    });
    return approvedUserPromise;
}

/**
 * Send a fresh ID token to Laravel. Always force-refreshes so newly granted
 * custom claims (approved/admin) are included.
 */
export async function establishSession(user, extra = {}) {
    const idToken = await user.getIdToken(true);
    const { data } = await window.axios.post('/auth/session', { idToken, ...extra });

    if (data.claimsUpdated) {
        await user.getIdToken(true);
    }

    return data;
}

/**
 * Sign out of Firebase, then submit the Laravel logout form. `reason` lets the
 * login page explain an automatic logout (e.g. 'revoked').
 */
export async function logout(form = document.getElementById('logout-form'), reason = null) {
    if (form && reason) {
        const input = Object.assign(document.createElement('input'), { type: 'hidden', name: 'reason', value: reason });
        form.append(input);
    }
    try {
        await signOut(auth);
    } finally {
        form?.submit();
    }
}

const FRIENDLY_ERRORS = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-login-credentials': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/email-already-in-use': 'That email already has an account. Try signing in.',
    'auth/invalid-email': 'That email address looks wrong.',
    'auth/weak-password': 'Use at least 6 characters for your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/network-request-failed': 'Network problem. Check your connection.',
    'auth/user-disabled': 'This account has been disabled.',
};

function errorMessage(error) {
    if (error?.response?.data?.message) {
        return error.response.data.message;
    }
    return FRIENDLY_ERRORS[error?.code] ?? 'Something went wrong. Please try again.';
}

// ---------------------------------------------------------------------------
// /login
// ---------------------------------------------------------------------------
Alpine.data('loginForm', () => ({
    mode: 'signin', // 'signin' | 'signup'
    email: '',
    password: '',
    displayName: '',
    busy: false,
    error: '',
    info: '',

    async init() {
        // Laravel session expired but Firebase still remembers the user:
        // continue straight away instead of asking for the password again.
        const user = await authReady();
        if (user && !this.busy) {
            this.info = `Continuing as ${user.email}…`;
            await this.finish(user);
        }
    },

    get isSignup() {
        return this.mode === 'signup';
    },

    toggleMode() {
        this.mode = this.isSignup ? 'signin' : 'signup';
        this.error = '';
        this.info = '';
    },

    async submit() {
        if (this.busy) return;
        this.busy = true;
        this.error = '';
        this.info = '';

        try {
            const provider = providers.emailPassword;
            const user = this.isSignup
                ? await provider.signUp({
                      email: this.email.trim(),
                      password: this.password,
                      displayName: this.displayName.trim(),
                  })
                : await provider.signIn({ email: this.email.trim(), password: this.password });

            await this.finish(user);
        } catch (e) {
            this.error = errorMessage(e);
            this.busy = false;
        }
    },

    async finish(user) {
        this.busy = true;
        try {
            const data = await establishSession(user, {
                displayName: this.displayName.trim() || undefined,
            });
            window.location.assign(data.redirect);
        } catch (e) {
            this.error = errorMessage(e);
            this.info = '';
            this.busy = false;
            await signOut(auth).catch(() => {});
        }
    },

    async resetPassword() {
        this.error = '';
        this.info = '';
        if (!this.email.trim()) {
            this.error = 'Enter your email first, then tap "Forgot password?".';
            return;
        }
        try {
            await sendPasswordResetEmail(auth, this.email.trim());
            this.info = 'If that email has an account, a reset link is on its way.';
        } catch (e) {
            this.error = errorMessage(e);
        }
    },
}));

// ---------------------------------------------------------------------------
// /pending — waits for admin approval
// ---------------------------------------------------------------------------
Alpine.data('pendingPage', ({ uid, status }) => ({
    uid,
    status,
    signedIn: true,
    checking: false,
    message: '',
    unsubscribe: null,

    async init() {
        const user = await authReady();
        if (!user || user.uid !== this.uid) {
            this.signedIn = false;
            return;
        }

        if (this.status !== 'pending') return;

        // Rules allow reading your own users/{uid} doc even before approval.
        this.unsubscribe = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
                const next = snap.data()?.status;
                if (!next || next === this.status) return;
                this.status = next;
                if (next === 'approved') this.check();
            },
            () => {}, // Listener errors are non-fatal; "Check again" still works.
        );
    },

    destroy() {
        this.unsubscribe?.();
    },

    async check() {
        if (this.checking || !auth.currentUser) return;
        this.checking = true;
        this.message = '';
        try {
            const data = await establishSession(auth.currentUser);
            this.status = data.status;
            if (data.status === 'approved') {
                window.location.assign(data.redirect);
                return;
            }
            this.message = data.status === 'pending' ? 'Still waiting. We’ll keep checking.' : '';
        } catch (e) {
            this.message = errorMessage(e);
        }
        this.checking = false;
    },

    logout,
}));

// ---------------------------------------------------------------------------
// Authenticated pages: log out of Laravel if Firebase signs out (e.g. in
// another tab) or the admin revokes access; refresh stale claims.
// ---------------------------------------------------------------------------
export function startSessionGuard(me) {
    let unsubscribeUserDoc = null;

    onAuthStateChanged(auth, async (user) => {
        unsubscribeUserDoc?.();

        if (!user || user.uid !== me.uid) {
            logout();
            return;
        }

        await approvedUser();

        unsubscribeUserDoc = onSnapshot(
            doc(db, 'users', user.uid),
            (snap) => {
                if (snap.exists() && snap.data().status !== 'approved') {
                    logout(undefined, 'revoked');
                }
            },
            () => {},
        );
    });
}

Alpine.data('logoutButton', () => ({
    busy: false,
    async logout(event) {
        if (this.busy) return;
        this.busy = true;
        await logout(event.target.closest('form'));
    },
}));

if (window.Planly?.user) {
    startSessionGuard(window.Planly.user);
}
