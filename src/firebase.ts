import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Silence Firestore internal warnings and idle stream disconnections
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

// Offline persistence, single-tab.
//
// This was persistentMultipleTabManager(). When the primary lease moved between
// tabs, the SDK's own synchronizeViewAndComputeSnapshot threw
// "Cannot read properties of undefined (reading 'query')", which permanently
// corrupts Firestore's internal state: every call afterwards throws
// "INTERNAL ASSERTION FAILED (ID: b815)" and the app locks up. client-errors.log
// recorded 3,664 of those from a single session.
//
// The single-tab manager performs no cross-tab synchronization, so that lease
// machinery never runs. Offline caching still works in the active tab; a second
// tab simply falls back to an in-memory cache. Do not switch this back to
// multi-tab without confirming the upstream SDK bug is fixed.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(undefined),
  }),
}, firebaseConfig.firestoreDatabaseId);

import { getFunctions } from 'firebase/functions';
export const functions = getFunctions(app, 'us-central1');

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup };
