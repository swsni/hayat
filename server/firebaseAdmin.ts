import { getApps, initializeApp as initAdminApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

export const resolveProjectIdFromEnv = (): string | undefined => {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID;

  if (process.env.FIREBASE_CONFIG) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_CONFIG);
      if (parsed && typeof parsed.projectId === "string") {
        return parsed.projectId;
      }
    } catch {
      // Ignore parse errors; FIREBASE_CONFIG can also be a non-JSON value.
    }
  }

  return undefined;
};

export const ensureAdminInitialized = () => {
  if (getApps().length > 0) return;

  try {
    const explicitProjectId = resolveProjectIdFromEnv() || "gen-lang-client-0746151360";

    // In Google Cloud Functions / Cloud Run, always use built-in Google Application Default Credentials
    const isCloudEnvironment = Boolean(
      process.env.FUNCTION_NAME ||
      process.env.FUNCTION_TARGET ||
      process.env.K_SERVICE ||
      process.env.FIREBASE_CONFIG ||
      process.env.GCP_PROJECT
    );

    if (!isCloudEnvironment && process.env.ADMIN_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.ADMIN_SERVICE_ACCOUNT);
        initAdminApp({
          credential: cert(serviceAccount),
          projectId: explicitProjectId || serviceAccount.project_id,
        });
        return;
      } catch (saErr) {
        console.warn("Could not load ADMIN_SERVICE_ACCOUNT, falling back to default credentials:", saErr);
      }
    }

    // Default initialization (ADC in Cloud Functions)
    initAdminApp({
      projectId: explicitProjectId,
    });
  } catch (e) {
    console.warn("Firebase Admin App initialization error:", e);
  }
};

// Helper: always get Firestore connected to the original project's database
export function getDb() {
  ensureAdminInitialized();
  return getAdminFirestore();
}

export function getAuth() {
  ensureAdminInitialized();
  return getAdminAuth();
}
