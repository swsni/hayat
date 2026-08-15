import fs from "fs";
import path from "path";
import crypto from "crypto";
import http2 from "http2";
import { getDb } from "./firebaseAdmin";
import { isSafeCustomerId } from "../utils/helpers";

export const isWebNotificationsEnabled = (): boolean => {
  const raw = String(process.env.WEB_NOTIFICATIONS_ENABLED || "true").trim().toLowerCase();
  return raw !== "false";
};

export const getWebNotificationRetentionDays = (): number => {
  const raw = Number(process.env.WEB_NOTIFICATIONS_RETENTION_DAYS || "30");
  return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 30;
};

// APNs HTTP/2 Persistent Connection Pool
let apnsClient: http2.ClientHttp2Session | null = null;
let apnsCertsLoaded = false;
let apnsSignerCert: Buffer | null = null;
let apnsSignerKey: Buffer | null = null;
let apnsAuthMode: "none" | "certificate" | "token" = "none";
let apnsProviderKeyId = "";
let apnsProviderTeamId = "";
let apnsProviderPrivateKey: string | null = null;
let apnsProviderJwtCache: { token: string; expiresAtEpochSec: number } | null = null;
let apnsPassTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER || process.env.APPLE_PASS_TYPE_ID || "pass.com.hayatbeauty.loyalty";
const APNS_HOST = process.env.APPLE_APNS_HOST || "https://api.push.apple.com";

export const getApnsDiagnostics = () => ({
  host: APNS_HOST,
  topic: apnsPassTypeIdentifier,
  authMode: apnsAuthMode,
  certLoaded: Boolean(apnsSignerCert),
  keyLoaded: Boolean(apnsSignerKey),
  tokenKeyLoaded: Boolean(apnsProviderPrivateKey),
  tokenKeyIdConfigured: Boolean(apnsProviderKeyId),
  tokenTeamIdConfigured: Boolean(apnsProviderTeamId),
});

const base64UrlEncode = (value: string | Buffer): string => {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const loadApnsProviderTokenFromEnv = (): void => {
  if (apnsProviderPrivateKey) return;

  const keyFromEnv = process.env.APPLE_APNS_AUTH_KEY;
  const keyPath = process.env.APPLE_APNS_AUTH_KEY_PATH;
  const keyId = String(process.env.APPLE_APNS_KEY_ID || "").trim();
  const teamId = String(process.env.APPLE_TEAM_ID || "").trim();

  let privateKey = "";
  if (keyFromEnv && keyFromEnv.trim()) {
    privateKey = keyFromEnv.replace(/\\n/g, "\n").trim();
  } else if (keyPath && fs.existsSync(keyPath)) {
    privateKey = fs.readFileSync(keyPath, "utf8").trim();
  }

  if (!privateKey || !keyId || !teamId) {
    return;
  }

  apnsProviderPrivateKey = privateKey;
  apnsProviderKeyId = keyId;
  apnsProviderTeamId = teamId;
  apnsAuthMode = "token";
};

const getApnsProviderJwt = (): string | null => {
  if (apnsAuthMode !== "token" || !apnsProviderPrivateKey || !apnsProviderKeyId || !apnsProviderTeamId) {
    return null;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (apnsProviderJwtCache && apnsProviderJwtCache.expiresAtEpochSec > nowSec + 60) {
    return apnsProviderJwtCache.token;
  }

  const header = {
    alg: "ES256",
    kid: apnsProviderKeyId,
  };
  const payload = {
    iss: apnsProviderTeamId,
    iat: nowSec,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  try {
    const signer = crypto.createSign("SHA256");
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(apnsProviderPrivateKey);
    const signedToken = `${unsignedToken}.${base64UrlEncode(signature)}`;
    apnsProviderJwtCache = {
      token: signedToken,
      expiresAtEpochSec: nowSec + (50 * 60),
    };
    return signedToken;
  } catch (err) {
    console.error("[APNs Push] Failed to sign APNs JWT token:", err);
    return null;
  }
};

const getApnsClient = (): http2.ClientHttp2Session | null => {
  if (apnsClient && !apnsClient.destroyed) {
    return apnsClient;
  }

  if (!apnsCertsLoaded) {
    let certsDir = path.join(process.cwd(), 'certs');
    let signerCertPath = path.join(certsDir, 'signerCert.pem');
    let signerKeyPath = path.join(certsDir, 'signerKey.pem');
    
    if (!fs.existsSync(signerCertPath)) {
      signerCertPath = path.join(__dirname, '..', 'certs', 'signerCert.pem');
      signerKeyPath = path.join(__dirname, '..', 'certs', 'signerKey.pem');
    }
    
    if (fs.existsSync(signerCertPath)) {
      apnsSignerCert = fs.readFileSync(signerCertPath);
      apnsSignerKey = fs.readFileSync(signerKeyPath);
      apnsAuthMode = "certificate";
      
      try {
        const cert = new crypto.X509Certificate(apnsSignerCert);
        const subject = cert.subject;
        const uidMatch = subject.match(/UID=([^,\n;]+)/i);
        if (uidMatch) {
          apnsPassTypeIdentifier = uidMatch[1].trim();
        } else {
          const commonNameMatch = subject.match(/CN=Pass\s+Type\s+ID:\s*([^,\n;]+)/i);
          if (commonNameMatch) {
            apnsPassTypeIdentifier = commonNameMatch[1].trim();
          }
        }
      } catch (certError) {
        // Ignore
      }
    }

    loadApnsProviderTokenFromEnv();
    apnsCertsLoaded = true;
  }

  if (apnsAuthMode === "none") {
    console.error("[APNs Push] Missing APNs credentials. Provide signerCert/signerKey or APPLE_APNS_AUTH_KEY(_PATH)+APPLE_APNS_KEY_ID+APPLE_TEAM_ID.");
    return null;
  }

  console.log(`[APNs Push] Initializing new HTTP/2 persistent connection to ${APNS_HOST}...`);
  apnsClient = apnsAuthMode === "certificate"
    ? http2.connect(APNS_HOST, {
      cert: apnsSignerCert as Buffer,
      key: apnsSignerKey as Buffer,
      passphrase: process.env.APPLE_PASSPHRASE || ""
    })
    : http2.connect(APNS_HOST);

  apnsClient.on('error', (err) => {
    console.error("[APNs Push] Connection error:", err);
    if (apnsClient) {
      apnsClient.close();
      apnsClient = null;
    }
  });

  apnsClient.on('close', () => {
    console.log("[APNs Push] Connection closed. Will gracefully reconnect on next push.");
    apnsClient = null;
  });

  return apnsClient;
};

export type PushDispatchSummary = {
  customerId: string;
  serialNumber: string;
  apnsHost: string;
  apnsTopic: string;
  registrations: number;
  attempted: number;
  sent: number;
  failed: number;
  clientReady: boolean;
  reasons: string[];
};

export type FamilyPushDispatchSummary = {
  requestedCustomerId: string;
  targetCustomerIds: string[];
  attempted: number;
  sent: number;
  failed: number;
  registrations: number;
  clientReady: boolean;
  reasons: string[];
  perCustomer: PushDispatchSummary[];
};

export type WebNotificationPayload = {
  type: string;
  title: string;
  body: string;
  url?: string;
  metadata?: Record<string, unknown>;
};

const normalizeFamilyRootId = (candidate: any): string => {
  if (candidate && typeof candidate.parentId === "string" && candidate.parentId.trim()) {
    return candidate.parentId.trim();
  }
  if (candidate && typeof candidate.id === "string" && candidate.id.trim()) {
    return candidate.id.trim();
  }
  return "";
};

export const resolveWalletPushTargetIds = async (requestedCustomerId: string): Promise<string[]> => {
  const normalizedRequestedId = String(requestedCustomerId || "").trim();
  if (!isSafeCustomerId(normalizedRequestedId)) return [];

  const adminDb = getDb();
  const targets = new Set<string>();
  targets.add(normalizedRequestedId);

  try {
    const seedDoc = await adminDb.collection("customers").doc(normalizedRequestedId).get();
    if (!seedDoc.exists) {
      return Array.from(targets);
    }

    const seedData = seedDoc.data() || {};
    const seedRecord = { id: seedDoc.id, ...seedData };
    const familyRootId = normalizeFamilyRootId(seedRecord);
    const seedPhone = typeof seedData.phone === "string" ? seedData.phone.trim() : "";

    if (seedPhone) {
      const samePhoneSnap = await adminDb
        .collection("customers")
        .where("phone", "==", seedPhone)
        .get();

      samePhoneSnap.forEach((docSnap) => {
        const docData = docSnap.data() || {};
        if (docData.isDeleted) return;
        if (isSafeCustomerId(docSnap.id)) targets.add(docSnap.id);
      });
    }

    if (familyRootId) {
      const dependentsSnap = await adminDb
        .collection("customers")
        .where("parentId", "==", familyRootId)
        .get();

      dependentsSnap.forEach((docSnap) => {
        const docData = docSnap.data() || {};
        if (docData.isDeleted) return;
        if (isSafeCustomerId(docSnap.id)) targets.add(docSnap.id);
      });

      if (isSafeCustomerId(familyRootId)) {
        targets.add(familyRootId);
      }
    }
  } catch (err) {
    console.warn(`[Wallet Trigger] Could not resolve family routing for ${normalizedRequestedId}:`, err);
  }

  return Array.from(targets);
};

export const dispatchWalletPushForFamily = async (requestedCustomerId: string): Promise<FamilyPushDispatchSummary> => {
  const targetCustomerIds = await resolveWalletPushTargetIds(requestedCustomerId);
  const perCustomer: PushDispatchSummary[] = [];

  for (const targetCustomerId of targetCustomerIds) {
    perCustomer.push(await triggerPushNotification(targetCustomerId));
  }

  const aggregated = perCustomer.reduce(
    (acc, item) => {
      acc.attempted += item.attempted;
      acc.sent += item.sent;
      acc.failed += item.failed;
      acc.registrations += item.registrations;
      acc.clientReady = acc.clientReady || item.clientReady;
      if (item.reasons.length > 0) {
        acc.reasons.push(`[${item.customerId}] ${item.reasons.join(" | ")}`);
      }
      return acc;
    },
    {
      requestedCustomerId,
      targetCustomerIds,
      attempted: 0,
      sent: 0,
      failed: 0,
      registrations: 0,
      clientReady: false,
      reasons: [] as string[],
      perCustomer,
    }
  );

  return aggregated;
};

export const enqueueWebNotificationForFamily = async (
  requestedCustomerId: string,
  payload: WebNotificationPayload
): Promise<void> => {
  if (!isWebNotificationsEnabled()) return;

  const targetCustomerIds = await resolveWalletPushTargetIds(requestedCustomerId);
  if (targetCustomerIds.length === 0) return;

  const adminDb = getDb();
  const createdAt = new Date().toISOString();
  await Promise.all(
    targetCustomerIds.map((targetCustomerId) =>
      adminDb.collection("web_notifications").add({
        targetCustomerId,
        requestedCustomerId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        url: payload.url || "/cafe",
        metadata: payload.metadata || {},
        createdAt,
        isRead: false,
      })
    )
  );
};

// Reusable helper to send APNs push notification for a customer
export const triggerPushNotification = async (customerId: string) => {
  const serialNumber = `member-${customerId}`;
  const summary: PushDispatchSummary = {
    customerId,
    serialNumber,
    apnsHost: APNS_HOST,
    apnsTopic: apnsPassTypeIdentifier,
    registrations: 0,
    attempted: 0,
    sent: 0,
    failed: 0,
    clientReady: false,
    reasons: [],
  };
  const adminDb = getDb();

  if (!customerId || typeof customerId !== "string") {
    summary.reasons.push("Invalid or missing customerId");
    return summary;
  }
  
  // Update the wallet pass modified time
  try {
    await adminDb.collection("wallet_passes").doc(serialNumber).set({
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err: any) {
    summary.reasons.push(`Failed to update wallet_passes timestamp: ${err?.message || err}`);
    return summary;
  }
  
  let registrationsSnapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
  try {
    registrationsSnapshot = await adminDb.collection("wallet_device_registrations")
      .where("serialNumber", "==", serialNumber)
      .get();
  } catch (err: any) {
    summary.reasons.push(`Failed to query wallet_device_registrations: ${err?.message || err}`);
    return summary;
  }
  summary.registrations = registrationsSnapshot.size;
    
  if (registrationsSnapshot.empty) {
    console.log(`[APNs Push] No devices registered for customer ${customerId}`);
    summary.reasons.push("No device registrations found for serial");
    return summary;
  }
  
  console.log(`[APNs Push] Found ${registrationsSnapshot.size} devices registered for customer ${customerId}. Preparing push...`);
  
  const client = getApnsClient();
  if (!client) {
    summary.reasons.push("APNs client unavailable (missing certs or connection error)");
    return summary;
  }
  summary.clientReady = true;
  
  const pushPromises = registrationsSnapshot.docs.map(doc => {
    return new Promise<void>((resolve) => {
      const pushToken = doc.data().pushToken;
      const registrationDocId = doc.id;

      if (typeof pushToken !== "string" || !/^[a-fA-F0-9]{64}$/.test(pushToken)) {
        summary.failed += 1;
        summary.reasons.push(`Registration ${registrationDocId} has invalid pushToken format`);
        resolve();
        return;
      }

      summary.attempted += 1;
      console.log(`[APNs Push] Dispatching push to device library identifier: ${doc.data().deviceLibraryIdentifier}`);
      const requestHeaders: http2.OutgoingHttpHeaders = {
        ':method': 'POST',
        ':path': `/3/device/${pushToken}`,
        'apns-push-type': 'background', // Required for Wallet passes
        'apns-priority': '5',           // Required when push-type is background
        'apns-topic': apnsPassTypeIdentifier,
        'apns-expiration': '0',
      };

      if (apnsAuthMode === "token") {
        const providerJwt = getApnsProviderJwt();
        if (!providerJwt) {
          summary.failed += 1;
          summary.reasons.push(`Token ${pushToken.substring(0, 8)}... -> APNs provider JWT unavailable`);
          resolve();
          return;
        }
        requestHeaders.authorization = `bearer ${providerJwt}`;
      }

      const req = client.request(requestHeaders);

      let statusCode = 0;
      
      req.on('response', (headers) => {
        statusCode = Number(headers[':status'] || 0);
        console.log(`[APNs Push] Response status for ${pushToken.substring(0, 8)}... : ${statusCode}`);
      });

      req.setEncoding('utf8');
      let data = '';
      let finalized = false;
      const finalize = () => {
        if (finalized) return;
        finalized = true;
        resolve();
      };

      req.setTimeout(15000, () => {
        summary.failed += 1;
        summary.reasons.push(`Token ${pushToken.substring(0, 8)}... -> timeout after 15000ms`);
        req.close();
        finalize();
      });

      req.on('data', (chunk) => { data += chunk; });
      req.on('end', async () => {
        if (statusCode === 200) {
          summary.sent += 1;
          console.log(`[APNs Push] Success for token ${pushToken.substring(0, 8)}...`);
        } else {
          summary.failed += 1;
          let apnsReason = "unknown";
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed && typeof parsed.reason === "string") {
                apnsReason = parsed.reason;
              }
            } catch {
              // Keep default reason when body is not JSON.
            }
          }

          const reasonText = data ? `${statusCode}: ${apnsReason} ${data}` : `${statusCode}: no-body`;
          summary.reasons.push(`Token ${pushToken.substring(0, 8)}... -> ${reasonText}`);
          console.log(`[APNs Push] Failed for token ${pushToken.substring(0, 8)}... : ${reasonText}`);

          if (statusCode === 410 || apnsReason === "Unregistered" || apnsReason === "BadDeviceToken") {
            try {
              await adminDb.collection("wallet_device_registrations").doc(registrationDocId).delete();
              summary.reasons.push(`Registration ${registrationDocId} removed after APNs reason ${apnsReason}`);
            } catch (cleanupErr: any) {
              summary.reasons.push(`Registration cleanup failed for ${registrationDocId}: ${cleanupErr?.message || cleanupErr}`);
            }
          }
        }
        finalize();
      });
      req.on('error', (err) => {
        console.error(`[APNs Push] Request error for ${pushToken.substring(0, 8)}... :`, err);
        summary.failed += 1;
        summary.reasons.push(`Token ${pushToken.substring(0, 8)}... -> stream error: ${err.message}`);
        finalize();
      });
      
      req.write("{}"); // Empty payload for Wallet pushes
      req.end();
    });
  });
  
  await Promise.all(pushPromises);
  if (summary.sent === 0 && summary.attempted > 0 && summary.reasons.length === 0) {
    summary.reasons.push("APNs returned no successful deliveries");
  }
  console.log(`[APNs Push] Summary for ${customerId}:`, summary);
  return summary;
};
