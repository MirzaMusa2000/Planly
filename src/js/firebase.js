// Firebase initialisation shared by every feature module.
// Import { auth, db } from here; never call initializeApp elsewhere.
// Config comes from VITE_FIREBASE_* in .env, inlined at build time. These
// values are public by design: security comes from Auth + firestore.rules.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import {
    connectFirestoreEmulator,
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: env.VITE_FIREBASE_APP_ID || undefined,
};

// Emulators only ever on a local machine, even if a build was made with the
// flag on by mistake.
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
export const usingEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true' && isLocalHost;

// Guard against double initialisation during Vite HMR.
const isFirstInit = getApps().length === 0;
export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Every tab is its own page, so keep Firestore's data on the device
// (IndexedDB, shared by open tabs): the next page shows cached data at once
// and then updates live. Cleared on sign-out (session.js). If IndexedDB isn't
// available (e.g. some private modes) Firestore quietly uses memory instead.
export const db = isFirstInit
    ? initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
    : getFirestore(app);

if (usingEmulators && isFirstInit) {
    connectAuthEmulator(auth, env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1', Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080));
}
