// Firebase initialisation shared by every feature module.
// Import { auth, db } from here; never call initializeApp elsewhere.
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfig = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || undefined,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || undefined,
    appId: env.VITE_FIREBASE_APP_ID || undefined,
};

export const usingEmulators = env.VITE_USE_FIREBASE_EMULATORS === 'true';

// Guard against double initialisation during Vite HMR.
const isFirstInit = getApps().length === 0;
export const app = isFirstInit ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = getFirestore(app);

if (usingEmulators && isFirstInit) {
    connectAuthEmulator(auth, env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099', {
        disableWarnings: true,
    });
    connectFirestoreEmulator(
        db,
        env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1',
        Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080),
    );
}
