import { WebSocketServer, WebSocket } from "ws";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { evaluateGateAccess } from "./gateAccess";

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
  } catch (err) {
    console.error("Failed to log gate access:", err);
  }
}

export const gateSockets = new Set<WebSocket>();

export function initGateWebSocketServer(port: number = 7788) {
  const wss = new WebSocketServer({ port });

  console.log(`[GATE SDK] WebSocket server started on port ${port}`);

  wss.on("connection", (ws: WebSocket) => {
    console.log("[GATE SDK] Terminal connected");
    gateSockets.add(ws);

    ws.on("close", () => {
      console.log("[GATE SDK] Terminal disconnected");
      gateSockets.delete(ws);
    });

    ws.on("message", async (message: string) => {
      try {
        const data = JSON.parse(message);
        console.log("[GATE SDK] Received:", data.cmd);

        if (data.cmd === "reg") {
          // Registration command
          const response = {
            ret: "reg",
            result: true,
            cloudtime: new Date().toISOString().replace('T', ' ').substring(0, 19),
            nosenduser: true
          };
          ws.send(JSON.stringify(response));
          return;
        }

        if (data.cmd === "sendqrcode") {
          const qrPayload = data.record; // The scanned QR code payload
          const sn = data.sn; // Device serial number
          
          if (!qrPayload) {
            ws.send(JSON.stringify({ ret: "sendqrcode", result: false, reason: 1 }));
            return;
          }

          const db = getFirestore();
          let customerData: any = null;
          let customerId = "";

          // Clean payload
          let lookupId = qrPayload;
          if (lookupId.startsWith("HAYAT-")) {
            lookupId = lookupId.replace("HAYAT-", "");
          }

          const docRef = db.collection("customers").doc(lookupId);
          const docSnap = await docRef.get();

          if (docSnap.exists) {
            customerData = docSnap.data();
            customerId = docSnap.id;
          } else {
            // Customer not found
            await logGateAccess(db, {
              customerId: "UNKNOWN",
              customerName: "Unknown",
              status: "DENIED",
              reason: "Customer not found",
              branch: "Unknown",
              qrPayload
            });
            ws.send(JSON.stringify({ ret: "sendqrcode", result: true, access: 0, message: "Not Found" }));
            return;
          }

          const decision = await evaluateGateAccess(db, customerId, customerData, "Unknown", qrPayload);

          await logGateAccess(db, {
            customerId: decision.customerId,
            customerName: decision.customerName,
            status: decision.status,
            reason: decision.reason,
            branch: "Unknown",
            qrPayload,
          });

          ws.send(JSON.stringify({
            ret: "sendqrcode",
            result: true,
            access: decision.allowed ? 1 : 0,
            message: decision.allowed ? "Welcome" : "Denied",
            customerId: decision.customerId,
            customerName: decision.customerName,
            reason: decision.reason,
          }));
          return;
        }

        // Acknowledge other commands minimally if needed
        console.log(`[GATE SDK] Ignored command: ${data.cmd}`);

      } catch (err) {
        console.error("[GATE SDK] Message Error:", err);
      }
    });

    ws.on("error", (error) => {
      console.error("[GATE SDK] WebSocket error:", error);
    });
  });

  return wss;
}
