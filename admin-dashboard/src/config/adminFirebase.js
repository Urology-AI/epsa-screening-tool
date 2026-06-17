/**
 * Firebase Configuration for Admin Dashboard
 * Uses production Firebase by default with optional emulator support.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const useAuthEmulator = import.meta.env.VITE_USE_AUTH_EMULATOR === 'true';
const useFirestoreEmulator = import.meta.env.VITE_USE_FIRESTORE_EMULATOR === 'true';

// Admin Firebase configuration — values from environment variables only.
// Never hardcode credentials here. Set VITE_FIREBASE_* in .env.local (gitignored).
const adminFirebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase for admin
const adminApp = initializeApp(adminFirebaseConfig, 'admin-app');
export const adminDb = getFirestore(adminApp);
export const adminAuth = getAuth(adminApp);
export const adminFunctions = getFunctions(adminApp);

if (isLocalhost && useAuthEmulator) {
  adminAuth.settings.appVerificationDisabledForTesting = true;
  adminAuth.tenantId = null;
  connectAuthEmulator(adminAuth, 'http://localhost:9099', { disableWarnings: true });
}

if (isLocalhost && useFirestoreEmulator) {
  connectFirestoreEmulator(adminDb, 'localhost', 8080);
}

if (import.meta.env.DEV) {
  console.log('🔥 Admin Firebase initialized');
  console.log('Project ID:', adminFirebaseConfig.projectId);
  console.log(`Auth emulator: ${isLocalhost && useAuthEmulator ? 'enabled' : 'disabled'}`);
  console.log(`Firestore emulator: ${isLocalhost && useFirestoreEmulator ? 'enabled' : 'disabled'}`);
}

// Admin analytics service
export const adminAnalytics = {
  trackEvent: async (eventType, data) => {
    if (import.meta.env.DEV) {
      console.log('Admin Analytics:', eventType, data);
    }
    // Add admin-specific analytics tracking here if needed
  }
};

export default adminApp;
