import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, Firestore } from 'firebase/firestore';
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Safe checking for initialized configuration
const isFirebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

let app;
let db: Firestore | null = null;
let auth: ReturnType<typeof getAuth> | null = null;

export async function ensureFirebaseAuth(): Promise<void> {
  if (!auth) {
    throw new Error('Firebase authentication is not initialized.');
  }

  if (auth.currentUser) {
    // Force-refresh the ID token so Firestore always receives a valid,
    // non-expired token.  Without this, an expired anonymous token causes
    // Firestore queries to silently return empty results instead of
    // throwing permission-denied — which makes every PIN look "invalid".
    try {
      await auth.currentUser.getIdToken(true);
    } catch (refreshError) {
      console.warn('[Firebase] Token refresh failed, re-authenticating…', refreshError);
      // Token is irrecoverable — sign in again from scratch.
      try {
        await signInAnonymously(auth);
      } catch (reAuthError) {
        throw new Error(
          reAuthError instanceof Error ? reAuthError.message : 'Firebase re-authentication failed.'
        );
      }
    }
    return;
  }

  try {
    await signInAnonymously(auth);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Firebase authentication failed.'
    );
  }
}

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig as any) : getApp();

    // Initialize Firestore normally without forcing long polling,
    // to allow WebSockets and improve initial loading performance.
    db = initializeFirestore(app, {}) as Firestore;

    auth = getAuth(app);

    // ── Anonymous Authentication ─────────────────────────────────────────────
    // Firestore security rules require request.auth != null on every collection.
    // We use anonymous sign-in so every device gets a valid Firebase Auth token
    // without requiring a username/password. Staff identity is still gated by the
    // PIN login; the anonymous token merely satisfies the Firestore auth check.
    // After a staff member enters their PIN, admin role elevation is handled
    // server-side via the /api/auth/elevate endpoint which issues a custom claim.
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await ensureFirebaseAuth();
        } catch (e) {
          console.warn('[Firebase] Anonymous sign-in failed. Firestore reads will be blocked by security rules.', e);
        }
      }
    });

    // Validate connection following the skill guidance
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db!, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.warn("Please check your Firebase configuration or internet connection.");
        }
        // Any other error (e.g. permission-denied on 'test/connection') is expected and safe to ignore.
      }
    };
    testConnection();
  } catch (err) {
    console.error("Failed to initialize Firebase SDK:", err);
  }
} else {
  console.info("Firebase is not fully configured yet. Running the application in secure offline/local fallback mode.");
}

export { db, auth, isFirebaseConfigured };

// Standardized Firestore Error Logging conforming strictly to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  
  console.error('Firestore Error Incident logged: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
