import { Router } from "express";
import { getDb } from "./firebaseAdmin";
import { isTriggerPushAuthorized, isFirebaseBearerAuthorized } from "./authService";
import { handleWalletPass } from "./walletService";
import { 
  getWebNotificationRetentionDays, 
  isWebNotificationsEnabled,
  dispatchWalletPushForFamily,
  getApnsDiagnostics
} from "./notificationsService";
import { 
  resolveCustomerReferenceFromLink,
  getCafeLinkSigningSecret,
  getCafeLinkMaxAgeMs,
  buildSignedCustomerQuery,
  buildWalletPassDownloadLink
} from "./utils";
import { isSafeCustomerId, isSafeCustomerReference } from "../utils/helpers";
import { walletRouter } from "./walletEndpoints";
import { gateRouter } from "./gateEndpoints";

export const apiRouter = Router();

apiRouter.get("/notifications/debug/status", async (req, res) => {
  try {
    if (!await isTriggerPushAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const adminDb = getDb();
    const now = new Date();
    const last24hIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const retentionDays = getWebNotificationRetentionDays();
    const retentionIso = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

    const [recentSnap, retentionSnap] = await Promise.all([
      adminDb.collection("web_notifications").where("createdAt", ">=", last24hIso).get(),
      adminDb.collection("web_notifications").where("createdAt", "<", retentionIso).get(),
    ]);

    let unreadLast24h = 0;
    let readLast24h = 0;
    recentSnap.forEach((docSnap) => {
      const isRead = Boolean(docSnap.data()?.isRead);
      if (isRead) {
        readLast24h += 1;
      } else {
        unreadLast24h += 1;
      }
    });

    return res.json({
      webNotificationsEnabled: isWebNotificationsEnabled(),
      retentionDays,
      recentLast24h: recentSnap.size,
      readLast24h,
      unreadLast24h,
      pendingRetentionCleanup: retentionSnap.size,
    });
  } catch (error: any) {
    console.error("[Notifications Debug] status failed:", error);
    return res.status(500).json({ error: "Notifications status failed", message: error.message });
  }
});

apiRouter.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

apiRouter.post("/wallet/pass", handleWalletPass);
apiRouter.get("/wallet/pass", handleWalletPass);

apiRouter.post("/wallet/trigger-push", async (req, res) => {
  try {
    if (!await isTriggerPushAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const customerId = String(req.body?.customerId || "").trim();
    if (!customerId) {
      return res.status(400).json({ error: "Missing customerId" });
    }
    if (!isSafeCustomerId(customerId)) {
      return res.status(400).json({ error: "Invalid customerId format" });
    }
    console.log(`[HTTP API] Received trigger-push request for customer: ${customerId}`);
    const summary = await dispatchWalletPushForFamily(customerId);
    return res.json({
      success: summary.sent > 0,
      summary,
    });
  } catch (error: any) {
    console.error(`[HTTP API] trigger-push failed:`, error);
    return res.status(500).json({ error: "Trigger failed", message: error.message });
  }
});

apiRouter.get("/wallet/debug/push-status", async (req, res) => {
  try {
    if (!await isTriggerPushAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const customerId = String(req.query.customerId || "").trim();
    if (!customerId) {
      return res.status(400).json({ error: "Missing customerId" });
    }

    const serialNumber = `member-${customerId}`;
    const adminDb = getDb();

    const [passDoc, registrationsSnapshot] = await Promise.all([
      adminDb.collection("wallet_passes").doc(serialNumber).get(),
      adminDb.collection("wallet_device_registrations").where("serialNumber", "==", serialNumber).get(),
    ]);

    const registrationPreview = registrationsSnapshot.docs.slice(0, 5).map((doc) => {
      const data = doc.data();
      const token = typeof data.pushToken === "string" ? data.pushToken : "";
      return {
        id: doc.id,
        deviceLibraryIdentifier: data.deviceLibraryIdentifier || null,
        passTypeIdentifier: data.passTypeIdentifier || null,
        pushTokenPrefix: token ? `${token.substring(0, 8)}...` : null,
        pushTokenFormatValid: /^[a-fA-F0-9]{64}$/.test(token),
      };
    });

    return res.json({
      customerId,
      serialNumber,
      passExists: passDoc.exists,
      hasAuthenticationToken: Boolean(passDoc.data()?.authenticationToken),
      passUpdatedAt: passDoc.data()?.updatedAt || null,
      registrationsCount: registrationsSnapshot.size,
      registrationPreview,
      apns: getApnsDiagnostics(),
    });
  } catch (error: any) {
    console.error("[Wallet Debug] push-status failed:", error);
    return res.status(500).json({ error: "Debug status failed", message: error.message });
  }
});

apiRouter.get("/wallet/debug/registration-samples", async (req, res) => {
  try {
    if (!await isTriggerPushAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const limitRaw = Number(req.query.limit || 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 10;

    const adminDb = getDb();
    const snap = await adminDb
      .collection("wallet_device_registrations")
      .orderBy("registeredAt", "desc")
      .limit(limit)
      .get();

    const samples = snap.docs.map((doc) => {
      const data = doc.data();
      const serialNumber = typeof data.serialNumber === "string" ? data.serialNumber : "";
      const customerId = serialNumber.startsWith("member-") ? serialNumber.slice("member-".length) : null;
      const token = typeof data.pushToken === "string" ? data.pushToken : "";
      return {
        id: doc.id,
        customerId,
        serialNumber,
        passTypeIdentifier: data.passTypeIdentifier || null,
        registeredAt: data.registeredAt || null,
        pushTokenPrefix: token ? `${token.substring(0, 8)}...` : null,
      };
    });

    return res.json({ count: samples.length, samples });
  } catch (error: any) {
    console.error("[Wallet Debug] registration-samples failed:", error);
    return res.status(500).json({ error: "Registration samples failed", message: error.message });
  }
});

apiRouter.get("/wallet/pass-link", async (req, res) => {
  try {
    if (!await isFirebaseBearerAuthorized(req)) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const customerId = String(req.query.customerId || "").trim();
    if (!customerId || !isSafeCustomerReference(customerId)) {
      return res.status(400).json({ error: "Missing or invalid customerId" });
    }

    const adminDb = getDb();
    const customerDoc = await adminDb.collection("customers").doc(customerId).get();
    if (!customerDoc.exists || customerDoc.data()?.isDeleted) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const originParam = req.query.origin as string;
    const requestOrigin = originParam ? originParam : `${req.protocol}://${req.get("host")}`;
    const url = buildWalletPassDownloadLink(customerId, requestOrigin);
    return res.json({ url });
  } catch (error: any) {
    console.error("[Wallet] pass-link failed:", error);
    return res.status(500).json({ error: "Pass link failed", message: error.message });
  }
});

apiRouter.get("/cafe/resolve-customer", async (req, res) => {
  try {
    const resolved = resolveCustomerReferenceFromLink({
      signedCustomerId: String(req.query.cid || "").trim(),
      signedTsRaw: String(req.query.ts || "").trim(),
      signedSignature: String(req.query.sig || "").trim(),
      legacyCustomerId: String(req.query.customerId || "").trim(),
      allowLegacy: (process.env.CAFE_ALLOW_LEGACY_CUSTOMERID_LINK || "true").toLowerCase() === "true",
      secret: getCafeLinkSigningSecret(),
      maxAgeMs: getCafeLinkMaxAgeMs(),
    });

    if (resolved.ok === false) {
      return res.status(resolved.status).json({ error: resolved.error });
    }

    const adminDb = getDb();
    const customerDoc = await adminDb.collection("customers").doc(resolved.customerId).get();
    if (!customerDoc.exists || customerDoc.data()?.isDeleted) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const responsePayload: {
      customerId: string;
      resolvedVia: "signed" | "legacy";
      signedQuery?: Record<string, string>;
    } = {
      customerId: resolved.customerId,
      resolvedVia: resolved.resolvedVia,
    };

    if (resolved.resolvedVia === "legacy") {
      const cafeSecret = getCafeLinkSigningSecret();
      if (cafeSecret) {
        const signedQuery = buildSignedCustomerQuery(resolved.customerId, cafeSecret);
        responsePayload.signedQuery = {
          cid: signedQuery.get("cid") || "",
          ts: signedQuery.get("ts") || "",
          sig: signedQuery.get("sig") || "",
        };
      }
    }

    return res.json(responsePayload);
  } catch (error: any) {
    console.error("[Cafe Link] resolve-customer failed:", error);
    return res.status(500).json({ error: "Resolve failed", message: error.message });
  }
});

// Import wallet router explicitly
apiRouter.use(walletRouter);
apiRouter.use("/gate", gateRouter);
