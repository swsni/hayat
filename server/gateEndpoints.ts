import express from "express";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { evaluateGateAccess } from "./gateAccess";

export const gateRouter = express.Router();

// Removed local gateSockets dependency since we use Cloud Bridge now

// Middleware to secure gate endpoints using an API key
// Middleware to secure hardware gate endpoints using an API key
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

/**
 * Endpoint to remotely open the gate from an admin panel or app.
 * Writes a command to Firestore that the local gateBridge will pick up.
 */
gateRouter.post("/open", async (req, res) => {
  try {
    const db = getFirestore();
    const branch = req.body.branch || "Janabiya"; // Assuming Janabiya default for now

    await db.collection("gateCommands").add({
      type: "OPEN_GATE",
      doornum: 1,
      branch: branch,
      status: "PENDING",
      createdAt: FieldValue.serverTimestamp(),
      requesterIp: req.ip || "unknown"
    });

    return res.status(200).json({ success: true, message: "Open command sent to branch bridge!" });
  } catch (error: any) {
    console.error("Remote Gate Open Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Endpoint for the scanner to hit when a QR code is read.
 * Or an endpoint for our internal service to call when the SDK listener triggers.
 */
gateRouter.post("/scan", async (req, res) => {
  try {
    // The payload from the QR code (could be customer ID)
    const { qrPayload, branch, controllerIp } = req.body;

    if (!qrPayload) {
      return res.status(400).json({ error: "Missing qrPayload" });
    }

    const db = getFirestore();
    let customerData: any = null;
    let customerId = "";

    // 1. Try to find the customer by ID
    // The scanner usually sends the exact string encoded in the QR.
    // If it's "HAYAT-12345", we strip the prefix.
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
      // Fallback strategies: search by gateCardNumber (primary for QR gate reader), then other fields
      let found = false;
      
      // Priority 1: Try numeric gateCardNumber lookup (this is what QR readers on gates send)
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

      // Priority 2: Try other string-based fields
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
        // Log failed attempt
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

    // 2. Validate Access Logic
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
