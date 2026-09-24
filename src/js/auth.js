// Sign-in / sign-up (login page) and the waiting-for-approval page.
import Alpine from 'alpinejs';
import {
    browserLocalPersistence,
    browserSessionPersistence,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { ensureUserDoc, homeFor } from './session';
import { N_, t } from './i18n';

// ---------------------------------------------------------------------------
// Sign-in methods. Each resolves to a Firebase User. To add Email Link
// (passwordless) later, add an `emailLink` provider with the same shape and a
// matching mode in the login form; the rest of the flow stays the same.
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

const FRIENDLY_ERRORS = {
    'auth/invalid-credential': N_('Wrong email or password.'),
    'auth/invalid-login-credentials': N_('Wrong email or password.'),
    'auth/wrong-password': N_('Wrong email or password.'),
    'auth/user-not-found': N_('Wrong email or password.'),
    'auth/email-already-in-use': N_('That email already has an account. Try signing in.'),
    'auth/invalid-email': N_('That email address looks wrong.'),
    'auth/weak-password': N_('Use at least 6 characters for your password.'),
    'auth/too-many-requests': N_('Too many attempts. Wait a moment and try again.'),
    'auth/network-request-failed': N_('Network problem. Check your connection.'),
    'auth/user-disabled': N_('This account has been disabled.'),
    'permission-denied': N_('Your account couldn’t be set up. Please try again.'),
    unavailable: N_('We can’t reach Planly right now. Check your connection and try again.'),
};

const errorMessage = (error) => t(FRIENDLY_ERRORS[error?.code] ?? 'Something went wrong. Please try again.');

const NOTICES = {
    revoked: N_('Your access has been revoked.'),
};

// "Remember me": the choice and the last email are kept on this device only.
// Storage can be unavailable (private mode, blocked site data), so every
// access is guarded and the form still works without it.
const PREFS = { remember: 'planly.rememberMe', email: 'planly.email' };

function readPref(key) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writePrefs(remember, email) {
    try {
        window.localStorage.setItem(PREFS.remember, remember ? '1' : '0');
        if (remember && email) window.localStorage.setItem(PREFS.email, email);
        else window.localStorage.removeItem(PREFS.email);
    } catch {
        // Not critical: the sign-in itself still honours the choice.
    }
}

/**
 * Remember me on: stay signed in on this device (localStorage, survives closing
 * the browser). Off: signed out when the browser closes (sessionStorage).
 * Must be applied before signing in.
 */
export function applyRememberMe(remember) {
    return setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
}

// ---------------------------------------------------------------------------
// /login
// ---------------------------------------------------------------------------
Alpine.data('loginForm', () => ({
    mode: 'signin', // 'signin' | 'signup'
    remember: readPref(PREFS.remember) !== '0', // on by default
    email: readPref(PREFS.remember) !== '0' ? readPref(PREFS.email) ?? '' : '',
    password: '',
    displayName: '',
    busy: false,
    error: '',
    info: '',
    notice: t(NOTICES[new URLSearchParams(window.location.search).get('reason')] ?? ''),

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
        this.notice = '';

        try {
            await applyRememberMe(this.remember);
            writePrefs(this.remember, this.email.trim());

            const provider = providers.emailPassword;
            const user = this.isSignup
                ? await provider.signUp({
                      email: this.email.trim(),
                      password: this.password,
                      displayName: this.displayName.trim(),
                  })
                : await provider.signIn({ email: this.email.trim(), password: this.password });

            const profile = await ensureUserDoc(user, this.displayName.trim() || null);
            window.location.assign(homeFor(profile));
        } catch (e) {
            console.error(e);
            this.error = errorMessage(e);
            this.busy = false;
            // Don't leave a half-signed-in state if the profile couldn't be set up.
            if (auth.currentUser && e?.code && !e.code.startsWith('auth/')) await signOut(auth).catch(() => {});
        }
    },

    async resetPassword() {
        this.error = '';
        this.info = '';
        if (!this.email.trim()) {
            this.error = t('Enter your email first, then tap "Forgot password?".');
            return;
        }
        try {
            await sendPasswordResetEmail(auth, this.email.trim());
            this.info = t('If that email has an account, a reset link is on its way.');
        } catch (e) {
            this.error = errorMessage(e);
        }
    },
}));

// ---------------------------------------------------------------------------
// /pending: waits for admin approval, updates live
// ---------------------------------------------------------------------------
Alpine.data('pendingPage', () => ({
    status: window.Planly.pending?.status ?? 'pending',
    email: window.Planly.pending?.email ?? '',
    signedIn: Boolean(window.Planly.pending),
    checking: false,
    message: '',
    unsubscribe: null,

    init() {
        const pending = window.Planly.pending;
        if (!pending) return;

        // Rules let you read your own users/{uid} doc even before approval.
        this.unsubscribe = onSnapshot(doc(db, 'users', pending.uid), (snap) => {
            const next = snap.data()?.status;
            if (!next) return;
            this.status = next;
            if (next === 'approved') window.location.replace('/');
        }, () => {});
    },

    destroy() {
        this.unsubscribe?.();
    },

    /** Manual re-check (the live listener normally does this by itself). */
    async check() {
        if (this.checking || !auth.currentUser) return;
        this.checking = true;
        this.message = '';
        try {
            const profile = await ensureUserDoc(auth.currentUser);
            this.status = profile.status;
            if (profile.status === 'approved') {
                window.location.replace('/');
                return;
            }
            this.message = profile.status === 'pending' ? t('Still waiting. We’ll keep checking.') : '';
        } catch (e) {
            this.message = errorMessage(e);
        }
        this.checking = false;
    },
}));
