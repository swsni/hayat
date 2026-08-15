import express from "express";
import crypto from "crypto";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { triggerPushNotification } from "./notificationsService";

function getDb() {
  return getAdminFirestore();
}

export const walletRouter = express.Router();

let hasWarnedMissingAdminKey = false;

const extractBearerToken = (authorizationHeader: string | undefined): string => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) return "";
  return authorizationHeader.slice("Bearer ".length).trim();
};

const isFirebaseAdminBearerAuthorized = async (req: express.Request): Promise<boolean> => {
  try {
    const token = extractBearerToken(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined);
    if (!token) return false;
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.admin === true;
  } catch {
    return false;
  }
};

const isAdminRouteAuthorized = async (req: express.Request): Promise<boolean> => {
  const configuredKey = process.env.WALLET_ADMIN_API_KEY;

  if (configuredKey) {
    const headerKey = req.headers["x-wallet-admin-key"];
    const providedKey = typeof headerKey === "string"
      ? headerKey
      : (typeof req.query.adminKey === "string" ? req.query.adminKey : "");

    if (providedKey) {
      const provided = Buffer.from(providedKey);
      const stored = Buffer.from(configuredKey);
      if (provided.length === stored.length && crypto.timingSafeEqual(provided, stored)) {
        return true;
      }
    }
  }

  const firebaseAdminAuthorized = await isFirebaseAdminBearerAuthorized(req);
  if (firebaseAdminAuthorized) return true;

  if (!configuredKey && !hasWarnedMissingAdminKey) {
    console.warn("[Wallet Admin] WALLET_ADMIN_API_KEY is not set. Firebase admin bearer token is now required for admin routes.");
    hasWarnedMissingAdminKey = true;
  }

  return false;
};

// Helper to authenticate requests from Apple Wallet.
// Apple's PassKit Web Service sends the pass's authenticationToken in the
// Authorization header as:  Authorization: ApplePass <token>
// We validate it against the token we stored in Firestore when the pass was
// first generated or last updated.
const authenticateWalletRequest = async (req: express.Request, serialNumber: string): Promise<boolean> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('ApplePass ')) {
    console.warn(`[Wallet Auth] Missing or malformed Authorization header for serial: ${serialNumber}`);
    return false;
  }

  const providedToken = authHeader.slice('ApplePass '.length).trim();
  if (!providedToken) {
    console.warn(`[Wallet Auth] Empty token for serial: ${serialNumber}`);
    return false;
  }

  try {
    const adminDb = getDb();
    const passDoc = await adminDb.collection('wallet_passes').doc(serialNumber).get();

    if (!passDoc.exists) {
      console.warn(`[Wallet Auth] No pass record found for serial: ${serialNumber}`);
      return false;
    }

    const storedToken: string | undefined = passDoc.data()?.authenticationToken;
    if (!storedToken) {
      console.warn(`[Wallet Auth] Pass record has no stored token for serial: ${serialNumber}`);
      return false;
    }

    // Constant-time comparison prevents timing-based token enumeration attacks
    const provided = Buffer.from(providedToken);
    const stored   = Buffer.from(storedToken);
    if (provided.length !== stored.length) return false;
    return crypto.timingSafeEqual(provided, stored);
  } catch (err) {
    console.error(`[Wallet Auth] Firestore lookup failed for serial ${serialNumber}:`, err);
    return false;
  }
};

// 1. Register a Device
// POST /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber
walletRouter.post("/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber", async (req, res) => {
  const { deviceLibraryIdentifier, passTypeIdentifier, serialNumber } = req.params;
  console.log(`[Wallet] Registration POST hit for serial: ${serialNumber}`);
  const pushToken = req.body.pushToken;
  
  if (!pushToken) {
    res.status(400).send();
    return;
  }

  if (!await authenticateWalletRequest(req, serialNumber)) {
    res.status(401).send();
    return;
  }
  
  try {
    const adminDb = getDb();
    const registrationId = `${deviceLibraryIdentifier}_${serialNumber}`;
    
    // Check if already registered
    const doc = await adminDb.collection("wallet_device_registrations").doc(registrationId).get();
    const isNew = !(doc.exists && doc.data()?.pushToken === pushToken);

    if (isNew) {
      await adminDb.collection("wallet_device_registrations").doc(registrationId).set({
        deviceLibraryIdentifier,
        serialNumber,
        passTypeIdentifier,
        pushToken,
        registeredAt: new Date().toISOString()
      });
      console.log(`[Registration] Saved new device token for serial: ${serialNumber}`);
    }
    
    try {
      const customerId = serialNumber.replace("member-", "");
      await adminDb.collection("auditLogs").add({
        customerId: customerId,
        action: 'Apple Wallet',
        description: 'تم إضافة بطاقة العضوية إلى محفظة أبل (Apple Wallet) بنجاح.',
        timestamp: new Date().toISOString(),
        staffName: 'System',
        branch: 'System'
      });
    } catch (logErr) {
      console.warn("Could not write wallet registration audit log", logErr);
    }
    
    res.status(isNew ? 201 : 200).send();
  } catch (error) {
    console.error("Error registering device:", error);
    res.status(500).send();
  }
});

// 2. Unregister a Device
// DELETE /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber
walletRouter.delete("/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber", async (req, res) => {
  const { deviceLibraryIdentifier, serialNumber } = req.params;
  
  if (!await authenticateWalletRequest(req, serialNumber)) {
    res.status(401).send();
    return;
  }
  
  try {
    const adminDb = getDb();
    const registrationId = `${deviceLibraryIdentifier}_${serialNumber}`;
    await adminDb.collection("wallet_device_registrations").doc(registrationId).delete();
    
    try {
      const customerId = serialNumber.replace("member-", "");
      await adminDb.collection("auditLogs").add({
        customerId: customerId,
        action: 'Apple Wallet',
        description: 'تمت إزالة بطاقة العضوية من محفظة أبل (Apple Wallet).',
        timestamp: new Date().toISOString(),
        staffName: 'System',
        branch: 'System'
      });
    } catch (logErr) {
      console.warn("Could not write wallet unregistration audit log", logErr);
    }

    res.status(200).send();
  } catch (error) {
    console.error("Error unregistering device:", error);
    res.status(500).send();
  }
});

// 4. Log endpoint for Apple Wallet errors
// POST /v1/log
walletRouter.post("/v1/log", (req, res) => {
  const logs = req.body?.logs || [];
  console.error("[Apple Wallet Client Log]:", JSON.stringify(logs, null, 2));
  res.status(200).send();
});

// 3. Get Serial Numbers for Updated Passes
// GET /v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier
walletRouter.get("/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier", async (req, res) => {
  const { deviceLibraryIdentifier, passTypeIdentifier } = req.params;
  const passesUpdatedSince = req.query.passesUpdatedSince as string;

  try {
    const adminDb = getDb();
    
    // Get all serial numbers registered for this device
    const registrationsSnapshot = await adminDb.collection("wallet_device_registrations")
      .where("deviceLibraryIdentifier", "==", deviceLibraryIdentifier)
      .where("passTypeIdentifier", "==", passTypeIdentifier)
      .get();
      
    if (registrationsSnapshot.empty) {
      res.status(204).send();
      return;
    }

    const serialNumbers: string[] = [];
    let latestUpdateEpochSec = 0;

    // Apple sends passesUpdatedSince as a Unix timestamp string (e.g. "1744123456").
    // Normalise to a Date object for comparison — support both Unix timestamps and
    // ISO 8601 strings so that existing registrations keep working.
    const sinceDate: Date | null = (() => {
      if (!passesUpdatedSince) return null;
      const asNumber = Number(passesUpdatedSince);
      if (!isNaN(asNumber) && passesUpdatedSince.length <= 13) {
        // Unix seconds (≤10 digits) or milliseconds (13 digits)
        return new Date(asNumber > 1e10 ? asNumber : asNumber * 1000);
      }
      // Fallback: treat as ISO 8601
      const d = new Date(passesUpdatedSince);
      return isNaN(d.getTime()) ? null : d;
    })();

    // Check the updatedAt of each pass
    for (const doc of registrationsSnapshot.docs) {
      const sn = doc.data().serialNumber;
      const passDoc = await adminDb.collection("wallet_passes").doc(sn).get();
      if (passDoc.exists) {
        const passData = passDoc.data();
        const passUpdatedAtRaw = passData?.updatedAt || "2000-01-01T00:00:00Z";
        const passUpdatedDate = new Date(passUpdatedAtRaw);
        const passUpdatedEpochSec = Math.floor(passUpdatedDate.getTime() / 1000);

        // If the pass was updated after the given tag (or no tag provided)
        if (!sinceDate || passUpdatedDate > sinceDate) {
          serialNumbers.push(sn);
        }

        // Track the latest update epoch
        if (passUpdatedEpochSec > latestUpdateEpochSec) {
          latestUpdateEpochSec = passUpdatedEpochSec;
        }
      }
    }

    if (serialNumbers.length === 0) {
      res.status(204).send();
      return;
    }

    // Apple expects lastUpdated as a Unix timestamp STRING (e.g. "1744123456").
    // The device stores this and sends it back as passesUpdatedSince on next sync.
    const lastUpdatedTimestamp = String(latestUpdateEpochSec || Math.floor(Date.now() / 1000));

    res.status(200).json({
      lastUpdated: lastUpdatedTimestamp,
      serialNumbers: serialNumbers
    });
  } catch (error) {
    console.error("Error getting serial numbers:", error);
    res.status(500).send();
  }
});

// 5. Trigger Update for All Customers
// GET /v1/admin/trigger-all-updates
walletRouter.get("/v1/admin/trigger-all-updates", async (req, res) => {
  if (!await isAdminRouteAuthorized(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const adminDb = getDb();
    const snap = await adminDb.collection("wallet_device_registrations").get();
    
    const customerIds = new Set<string>();
    snap.docs.forEach(doc => {
      const data = doc.data();
      if (data.serialNumber && data.serialNumber.startsWith('member-')) {
        const customerId = data.serialNumber.replace('member-', '');
        customerIds.add(customerId);
      }
    });

    console.log(`[Admin Trigger] Found ${customerIds.size} unique customers to update.`);

    // Process updates synchronously so container doesn't freeze
    for (const id of customerIds) {
      try {
        await triggerPushNotification(id);
      } catch (e) {
        console.error(`[Admin Trigger] Failed to update customer ${id}:`, e);
      }
      await new Promise(resolve => setTimeout(resolve, 500)); // Sleep 500ms
    }

    res.status(200).json({ status: "completed", customersCount: customerIds.size });
  } catch (error) {
    console.error("Error triggering mass update:", error);
    res.status(500).json({ error: "Mass update failed." });
  }
});

// The GET /v1/passes/:passTypeIdentifier/:serialNumber will be registered directly in server.ts
