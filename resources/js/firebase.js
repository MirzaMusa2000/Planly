// Firebase initialisation shared by every feature module.
// Import { auth, db } from here; never call initializeApp elsewhere.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Prefer the config the server renders at runtime (config/firebase.php "web"),
// so one build works for any project; fall back to Vite build-time variables.
const runtime = window.Planly?.firebase ?? {};
const env = import.meta.env;
const pick = (runtimeValue, buildValue) => runtimeValue || buildValue || undefined;

export const firebaseConfig = {
    apiKey: pick(runtime.apiKey, env.VITE_FIREBASE_API_KEY),
    authDomain: pick(runtime.authDomain, env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: pick(runtime.projectId, env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: pick(runtime.storageBucket, env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: pick(runtime.messagingSenderId, env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: pick(runtime.appId, env.VITE_FIREBASE_APP_ID),
};

export const usingEmulators = runtime.apiKey
    ? runtime.useEmulators === true
    : env.VITE_USE_FIREBASE_EMULATORS === 'true';

// Guard against double initialisation during Vite HMR.
const isFirstInit = getApps().length === 0;
export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

if (usingEmulators && isFirstInit) {
    connectAuthEmulator(auth, runtime.authEmulatorUrl || env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099', {
        disableWarnings: true,
    });
    connectFirestoreEmulator(
        db,
        runtime.firestoreEmulatorHost || env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1',
        Number(runtime.firestoreEmulatorPort || env.VITE_FIRESTORE_EMULATOR_PORT || 8080),
    );
}
