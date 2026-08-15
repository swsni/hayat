import express from "express";
import { getDb, getAuth, ensureAdminInitialized } from "./firebaseAdmin";
import { compareTokensConstantTime } from "./utils";

export const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return "";
  return authorizationHeader.slice("Bearer ".length).trim();
};

export const verifyFirebaseBearerToken = async (req: express.Request): Promise<import("firebase-admin/auth").DecodedIdToken | null> => {
  try {
    const token = extractBearerToken(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined);
    if (!token) return null;
    ensureAdminInitialized();
    return await getAuth().verifyIdToken(token);
  } catch {
    return null;
  }
};

export const isFirebaseBearerAuthorized = async (req: express.Request): Promise<boolean> => {
  const decoded = await verifyFirebaseBearerToken(req);
  return Boolean(decoded);
};

let hasWarnedMissingPushApiKey = false;
export const isTriggerPushAuthorized = async (req: express.Request): Promise<boolean> => {
  const configuredKey = process.env.WALLET_TRIGGER_API_KEY;

  if (configuredKey) {
    const headerValue = req.headers["x-wallet-trigger-key"];
    const providedKey = typeof headerValue === "string" ? headerValue : "";
    if (providedKey && compareTokensConstantTime(providedKey, configuredKey)) {
      return true;
    }
  }

  const firebaseAuthorized = await isFirebaseBearerAuthorized(req);
  if (firebaseAuthorized) return true;

  if (!configuredKey && !hasWarnedMissingPushApiKey) {
    console.warn("[Wallet Trigger] WALLET_TRIGGER_API_KEY is not set. Firebase Bearer token is now required for /api/wallet/trigger-push.");
    hasWarnedMissingPushApiKey = true;
  }

  return false;
};

// Backward-compatible auth guard for Apple Wallet pass fetches.
export const isApplePassFetchAuthorized = async (
  serialNumber: string,
  authorizationHeader: string | undefined
): Promise<boolean> => {
  try {
    const adminDb = getDb();
    const passDoc = await adminDb.collection("wallet_passes").doc(serialNumber).get();

    if (!passDoc.exists) {
      console.warn(`[Apple Wallet Auth] Legacy allow: no pass doc for serial ${serialNumber}`);
      return true;
    }

    const storedToken = passDoc.data()?.authenticationToken;
    if (!storedToken || typeof storedToken !== "string") {
      console.warn(`[Apple Wallet Auth] Legacy allow: pass doc missing token for serial ${serialNumber}`);
      return true;
    }

    if (!authorizationHeader || !authorizationHeader.startsWith("ApplePass ")) {
      return false;
    }

    const providedToken = authorizationHeader.slice("ApplePass ".length).trim();
    if (!providedToken) return false;

    return compareTokensConstantTime(providedToken, storedToken);
  } catch (err) {
    console.error(`[Apple Wallet Auth] Verification failed for serial ${serialNumber}:`, err);
    return false;
  }
};
