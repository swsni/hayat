import express from "express";
import { FieldValue } from "firebase-admin/firestore";
import { ensureAdminInitialized, getDb } from "./firebaseAdmin";
import { evaluateGateAccess } from "./gateAccess";

export const gateRouter = express.Router();

// Middleware to secure gate endpoints using an API key
gateRouter.use("/scan", (req, res, next) => {
  const expectedKey = process.env.GATE_API_KEY;
  if (!expectedKey) {
    return next(); // API key not configured, fallback to open access
  }

  const apiKey = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "") || req.query.apiKey || req.body?.apiKey;
  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized: Invalid API key" });
  }

  next();
});

// Middleware to secure wallet-verify endpoint using the same GATE_API_KEY
gateRouter.use("/wallet-verify", (req, res, next) => {
  const expectedKey = process.env.GATE_API_KEY;
  if (!expectedKey) {
    return next(); // API key not configured, fallback to open access
  }

  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.apiKey ||
    req.body?.apiKey;

  if (apiKey !== expectedKey) {
    return res.status(401).json({ allowed: false, reason: "Unauthorized: Invalid API key" });
  }

  next();
});

/**
 * POST /api/gate/wallet-verify
 * Verifies whether a customer is allowed entry based on their QR code (Used by C# App)
 */
gateRouter.post("/wallet-verify", async (req, res) => {
  try {
    const rawCode = String(req.body?.qrCode || "").trim();

    // ── 0. Early exit: ignore system ping / zero enrollid ─────────────────────
    if (!rawCode || rawCode === "0") {
      return res.status(200).json({ allowed: false, reason: "Ignored System Ping" });
    }

    const db = getDb();
    let customerData: any = null;
    let customerId = "";

    // Strip optional "HAYAT-" prefix
    let lookupId = rawCode.startsWith("HAYAT-") ? rawCode.replace("HAYAT-", "") : rawCode;

    // ── 1. Resolve customer (Unified Fallback Logic) ─────────────────────────
    const directSnap = await db.collection("customers").doc(lookupId).get();
    if (directSnap.exists) {
      customerData = directSnap.data()!;
      customerId = directSnap.id;
    } else {
      let found = false;
      
      // Priority 1: Search by gateCardNumber (numeric) for Wallet & Printed Cards
      if (!isNaN(Number(lookupId))) {
        const gateCardSnap = await db.collection("customers").where("gateCardNumber", "==", Number(lookupId)).limit(1).get();
        if (!gateCardSnap.empty) {
          customerData = gateCardSnap.docs[0].data();
          customerId = gateCardSnap.docs[0].id;
          found = true;
        }
      }

      // Priority 2: Fallback to phone, walletId, nfcId
      if (!found) {
        const searchFields = ["phone", "cardNumber", "walletId", "nfcId"];
        for (const field of searchFields) {
          const querySnap = await db.collection("customers").where(field, "==", lookupId).limit(1).get();
          if (!querySnap.empty) {
            customerData = querySnap.docs[0].data();
            customerId = querySnap.docs[0].id;
            found = true;
            break;
          }
        }
      }
    }

    if (!customerData) {
      console.log(`[wallet-verify] Customer not found for QR: ${rawCode}`);
      return res.status(200).json({ allowed: false, reason: "Customer Not Found" });
    }

    // ── 2. Evaluate Access using the central gateAccess.ts logic ─────────────
    // ✔️ التعديل السحري: استخدام الملف المركزي الذي أصلحناه لضمان تطبيق شروط تاريخ البدء والتجميد!
    const decision = await evaluateGateAccess(db, customerId, customerData, "System", rawCode);

    console.log(`[wallet-verify] Result for ${customerId}: ${decision.allowed ? "GRANTED" : "DENIED"} - ${decision.reason}`);
    
    return res.status(200).json({ 
      allowed: decision.allowed, 
      reason: decision.reason 
    });

  } catch (error: any) {
    console.error("[wallet-verify] Error:", error);
    return res.status(500).json({ allowed: false, reason: "Internal Server Error" });
  }
});

/**
 * Endpoint to remotely open the gate from an admin panel or app.
 * Writes a command to Firestore that the local gateBridge will pick up.
 */
gateRouter.post("/open", async (req, res) => {
  try {
    const db = getDb();
    const branch = req.body.branch || "Janabiya";
    const type: string = req.body.type === "MANUAL_OPEN" ? "MANUAL_OPEN" : "OPEN_GATE";

    await db.collection("gateCommands").add({
      type,
      doornum: 1,
      branch,
      status: "PENDING",
      createdAt: FieldValue.serverTimestamp(),
      requesterIp: req.ip || "unknown",
    });

    return res.status(200).json({ success: true, message: "Open command sent to branch bridge!" });
  } catch (error: any) {
    console.error("Remote Gate Open Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /api/gate/poll-command
 * Polled by the C# CloudDemo every ~2 seconds to check for pending manual open commands.
 */
gateRouter.use("/poll-command", (req, res, next) => {
  const expectedKey = process.env.GATE_API_KEY;
  if (!expectedKey) return next();

  const apiKey =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace("Bearer ", "") ||
    req.query.apiKey;

  if (apiKey !== expectedKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

gateRouter.get("/poll-command", async (req, res) => {
  try {
    const db = getDb();

    let snap: FirebaseFirestore.QuerySnapshot;
    try {
      snap = await db
        .collection("gateCommands")
        .where("status", "==", "PENDING")
        .limit(20)
        .get();
    } catch (queryError: any) {
      return res.status(500).json({
        error: "Firestore query failed",
        detail: queryError?.message || String(queryError),
      });
    }

    if (snap.empty) {
      return res.status(200).json({ command: null });
    }

    const matchingDocs = snap.docs.filter(d => {
      const data = d.data();
      return data.type === "MANUAL_OPEN" && data.branch === "Janabiya";
    });

    if (matchingDocs.length === 0) {
      return res.status(200).json({ command: null });
    }

    matchingDocs.sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() ?? 0;
      const bTime = b.data().createdAt?.toMillis?.() ?? 0;
      return aTime - bTime;
    });

    const cmdDoc = matchingDocs[0];

    try {
      await cmdDoc.ref.update({
        status: "COMPLETED",
        executedAt: FieldValue.serverTimestamp(),
        executedBy: "C#_CloudDemo_Poller",
      });
    } catch (updateError: any) {
      console.error("[poll-command] Failed to mark command as COMPLETED:", updateError?.message || updateError);
    }

    console.log(`[poll-command] Dispatched ManualOpenDoor to C# (doc: ${cmdDoc.id})`);

    return res.status(200).json({
      command: "ManualOpenDoor",
      branch: cmdDoc.data().branch,
      commandId: cmdDoc.id,
    });
  } catch (error: any) {
    console.error("[poll-command] Unexpected error:", error?.stack || error?.message || error);
    return res.status(500).json({
      error: "Internal Server Error",
      detail: error?.message || String(error),
    });
  }
});

gateRouter.get("/debug-env", (req, res) => {
  res.json({
    firebaseConfig: process.env.FIREBASE_CONFIG,
    gcloudProject: process.env.GCLOUD_PROJECT,
    projectId: process.env.FIREBASE_PROJECT_ID
  });
});

/**
 * POST /scan
 * Endpoint for the scanner to hit when a QR code is read via Webhook.
 */
gateRouter.post("/scan", async (req, res) => {
  try {
    const { qrPayload, branch, controllerIp } = req.body;

    if (!qrPayload) {
      return res.status(400).json({ error: "Missing qrPayload" });
    }

    const db = getDb();
    let customerData: any = null;
    let customerId = "";

    let lookupId = qrPayload;
    if (lookupId.startsWith("HAYAT-")) {
      lookupId = lookupId.replace("HAYAT-", "");
    }

    let docRef = db.collection("customers").doc(lookupId);
    let docSnap = await docRef.get();

    if (docSnap.exists) {
      customerData = docSnap.data();
      customerId = docSnap.id;
    } else {
      let found = false;
      
      if (!isNaN(Number(lookupId))) {
        const numericId = Number(lookupId);
        const gateCardSnap = await db.collection("customers").where("gateCardNumber", "==", numericId).limit(1).get();
        if (!gateCardSnap.empty) {
          customerData = gateCardSnap.docs[0].data();
          customerId = gateCardSnap.docs[0].id;
          found = true;
          console.log(`[Gate Scan] Found customer by gateCardNumber: ${numericId} -> ${customerId}`);
        }
      }

      if (!found) {
        const searchFields = ["phone", "cardNumber", "walletId", "nfcId"];
        for (const field of searchFields) {
          const querySnap = await db.collection("customers").where(field, "==", lookupId).limit(1).get();
          if (!querySnap.empty) {
            customerData = querySnap.docs[0].data();
            customerId = querySnap.docs[0].id;
            found = true;
            console.log(`[Gate Scan] Found customer by ${field}: ${lookupId} -> ${customerId}`);
            break;
          }
        }
      }

      if (!found) {
        await logGateAccess(db, {
          customerId: "UNKNOWN",
          customerName: "Unknown",
          status: "DENIED",
          reason: "Customer not found",
          branch: branch || "Unknown",
          qrPayload
        });
        return res.status(404).json({ success: false, message: "Customer not found" });
      }
    }

    const decision = await evaluateGateAccess(db, customerId, customerData, branch || "Unknown", qrPayload);

    if (!decision.allowed) {
      await logGateAccess(db, {
        customerId: decision.customerId,
        customerName: decision.customerName,
        status: decision.status,
        reason: decision.reason,
        branch: branch || "Unknown",
        qrPayload,
      });
      return res.status(403).json({
        success: false,
        access: 0,
        message: "Access Denied",
        customerId: decision.customerId,
        customerName: decision.customerName,
        reason: decision.reason,
      });
    }

    await db.collection("gateCommands").add({
      type: "OPEN_GATE",
      doornum: 1,
      branch: branch || "Janabiya",
      status: "PENDING",
      createdAt: FieldValue.serverTimestamp(),
      requesterIp: "API_SCAN"
    });

    await logGateAccess(db, {
      customerId: decision.customerId,
      customerName: decision.customerName,
      status: decision.status,
      reason: decision.reason,
      branch: branch || "Unknown",
      qrPayload,
    });

    return res.status(200).json({
      success: true,
      access: 1,
      message: "Access Granted",
      customerId: decision.customerId,
      customerName: decision.customerName,
      reason: decision.reason,
    });

  } catch (error: any) {
    console.error("Gate Scan Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Helper to log gate access events to Firestore
 */
async function logGateAccess(db: FirebaseFirestore.Firestore, data: {
  customerId: string;
  customerName: string;
  status: "GRANTED" | "DENIED";
  reason: string;
  branch: string;
  qrPayload?: string;
}) {
  try {
    await db.collection("gateLogs").add({
      ...data,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("Failed to write gate log:", e);
  }
}