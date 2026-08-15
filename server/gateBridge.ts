import "dotenv/config";
import * as net from "net";
import * as crypto from "crypto";
import { getDb, ensureAdminInitialized } from "./firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { evaluateGateAccess } from "./gateAccess";

ensureAdminInitialized();
const db = getDb();

const PORT = 7788;
const activeSockets = new Set<net.Socket>();
let pendingOpenCommandDoc: any = null;

async function logGateAccess(data: {
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
    console.log(`[GateLog] ${data.status} - ${data.customerName} - ${data.reason}`);
  } catch (err) {
    console.error("Failed to log gate access:", err);
  }
}

function sendWsMessage(socket: net.Socket, obj: any) {
  if (socket.destroyed) return;
  const payload = Buffer.from(JSON.stringify(obj), 'utf8');
  const len = payload.length;
  let header: Buffer;
  
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    console.warn("Payload too large to send");
    return;
  }
  socket.write(Buffer.concat([header, payload]));
}

async function handleTerminalMessage(socket: net.Socket, msgStr: string) {
  try {
    const msg = JSON.parse(msgStr);
    console.log("[GATE WS] Received cmd:", msg.cmd);

    if (msg.cmd === "reg") {
      sendWsMessage(socket, {
        ret: "reg",
        result: true,
        cloudtime: new Date().toISOString().replace('T', ' ').substring(0, 19),
        nosenduser: true
      });
      return;
    }

    if (msg.cmd === "sendlog") {
      sendWsMessage(socket, {
        ret: "sendlog",
        result: true,
        count: msg.count || 1
      });
      return;
    }

    if (msg.cmd === "sendqrcode") {
      const qrPayload = msg.record;
      if (!qrPayload) {
        sendWsMessage(socket, { ret: "sendqrcode", result: false, reason: 1 });
        return;
      }

      console.log(`[GATE WS] Processing QR Code: ${qrPayload}`);
      let lookupId = qrPayload;
      if (lookupId.startsWith("HAYAT-")) {
        lookupId = lookupId.replace("HAYAT-", "");
      }

      let customerData: any = null;
      let customerId = "";

      // Try direct document ID lookup
      const docSnap = await db.collection("customers").doc(lookupId).get();
      if (docSnap.exists) {
        customerData = docSnap.data();
        customerId = docSnap.id;
      } else {
        // Fallback: search by gateCardNumber (numeric QR from wallet/printed card)
        if (!isNaN(Number(lookupId))) {
          const gateCardSnap = await db.collection("customers").where("gateCardNumber", "==", Number(lookupId)).limit(1).get();
          if (!gateCardSnap.empty) {
            customerData = gateCardSnap.docs[0].data();
            customerId = gateCardSnap.docs[0].id;
            console.log(`[GATE WS] Found customer by gateCardNumber: ${lookupId} -> ${customerId}`);
          }
        }
      }

      if (!customerData) {
        await logGateAccess({ customerId: "UNKNOWN", customerName: "Unknown", status: "DENIED", reason: "Customer not found", branch: "Janabiya", qrPayload });
        sendWsMessage(socket, { ret: "sendqrcode", result: true, access: 0, message: "Not Found" });
        return;
      }

      const decision = await evaluateGateAccess(db, customerId, customerData, "Janabiya", qrPayload);

      await logGateAccess({
        customerId: decision.customerId,
        customerName: decision.customerName,
        status: decision.status,
        reason: decision.reason,
        branch: "Janabiya",
        qrPayload,
      });

      sendWsMessage(socket, {
        ret: "sendqrcode",
        result: true,
        access: decision.allowed ? 1 : 0,
        message: decision.allowed ? "Welcome" : "Denied",
        customerId: decision.customerId,
        customerName: decision.customerName,
        reason: decision.reason,
      });
      return;
    }
  } catch (err) {
    console.error("[GATE WS] Error processing message:", err);
  }
}

// -------------------------------------------------------------
// Custom WebSocket / Raw TCP Server (Relaxed Mask Constraints)
// -------------------------------------------------------------
const server = net.createServer((socket) => {
  const ip = socket.remoteAddress;
  console.log(`[GATE TCP] Terminal connected from ${ip}`);
  activeSockets.add(socket);

  let state: "HANDSHAKE" | "WEBSOCKET" | "RAW_TCP" = "HANDSHAKE";
  let buffer = Buffer.alloc(0);

  // If there's a pending command, execute immediately upon connection
  if (pendingOpenCommandDoc) {
    console.log(`[GATE BRIDGE] Executing queued PENDING command on new connection...`);
    // Wait slightly to ensure handshake completes if it's WS
    setTimeout(async () => {
      if (!socket.destroyed) {
        if (state === "WEBSOCKET") {
          sendWsMessage(socket, { cmd: "opendoor", doornum: 1 });
        } else if (state === "RAW_TCP") {
          socket.write(JSON.stringify({ cmd: "opendoor", doornum: 1 }) + "\n");
        }
        try {
          await pendingOpenCommandDoc.ref.update({
            status: "COMPLETED",
            executedAt: FieldValue.serverTimestamp(),
            note: "Executed on delayed connection"
          });
        } catch(e){}
      }
    }, 1500);
    pendingOpenCommandDoc = null;
  }

  socket.on("data", (data) => {
    buffer = Buffer.concat([buffer, data]);

    if (state === "HANDSHAKE") {
      // Check if it's raw JSON starting with '{'
      if (buffer[0] === 0x7B) {
        state = "RAW_TCP";
        processRawTcp();
        return;
      }

      const headersEnd = buffer.indexOf("\r\n\r\n");
      if (headersEnd !== -1) {
        const headersStr = buffer.subarray(0, headersEnd).toString('utf8');
        const match = headersStr.match(/Sec-WebSocket-Key:\s*(.+)/i);
        if (match) {
          const key = match[1].trim();
          const acceptKey = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
          const response = 
            `HTTP/1.1 101 Switching Protocols\r\n` +
            `Upgrade: websocket\r\n` +
            `Connection: Upgrade\r\n` +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`;
          socket.write(response);
          state = "WEBSOCKET";
          buffer = buffer.subarray(headersEnd + 4);
          processWebSocketFrames();
        } else {
          console.warn("[GATE TCP] Invalid HTTP handshake (no Sec-WebSocket-Key)");
          socket.end();
        }
      }
    } else if (state === "WEBSOCKET") {
      processWebSocketFrames();
    } else if (state === "RAW_TCP") {
      processRawTcp();
    }
  });

  function processRawTcp() {
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("}")) > -1) {
      const startIndex = buffer.indexOf("{");
      if (startIndex > -1 && startIndex < newlineIndex) {
        const jsonStr = buffer.subarray(startIndex, newlineIndex + 1).toString('utf8');
        buffer = buffer.subarray(newlineIndex + 1);
        handleTerminalMessage(socket, jsonStr);
      } else {
        buffer = buffer.subarray(newlineIndex + 1);
      }
    }
  }

  function processWebSocketFrames() {
    while (buffer.length >= 2) {
      const opcode = buffer[0] & 0x0f;
      const isMasked = (buffer[1] & 0x80) === 0x80;
      let payloadLength = buffer[1] & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (buffer.length < 4) return; // Wait for length
        payloadLength = buffer.readUInt16BE(2);
        offset += 2;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) return; // Wait for length
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset += 8;
      }

      let maskingKey: Buffer | null = null;
      if (isMasked) {
        if (buffer.length < offset + 4) return; // Wait for mask
        maskingKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (buffer.length < offset + payloadLength) return; // Wait for full payload

      const payload = buffer.subarray(offset, offset + payloadLength);
      let unmasked = Buffer.alloc(payloadLength);

      if (isMasked && maskingKey) {
        for (let i = 0; i < payloadLength; i++) {
          unmasked[i] = payload[i] ^ maskingKey[i % 4];
        }
      } else {
        // This is where standard ws crashes! We just gracefully accept unmasked frames.
        unmasked = payload; 
      }

      buffer = buffer.subarray(offset + payloadLength);

      if (opcode === 1) {
        // Text frame
        const msgStr = unmasked.toString('utf8');
        handleTerminalMessage(socket, msgStr);
      } else if (opcode === 8) {
        // Close frame
        socket.end();
      } else if (opcode === 9) {
        // Ping frame -> send Pong (Opcode A)
        const pong = Buffer.alloc(2);
        pong[0] = 0x8A; // FIN + Pong
        pong[1] = 0x00; // No payload
        socket.write(pong);
      }
    }
  }

  socket.on("error", (err) => {
    console.error(`[GATE TCP] Error:`, err.message);
  });

  socket.on("close", () => {
    console.log(`[GATE TCP] Terminal disconnected`);
    activeSockets.delete(socket);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[GATE BRIDGE] Custom Relaxed-Protocol Server listening on 0.0.0.0:${PORT}`);
  console.log(`[GATE BRIDGE] Supports BOTH WebSockets and Raw TCP (Immune to MASK bugs).`);
});

// Cloud Listener for Open Gate Commands
console.log("[GATE BRIDGE] Listening to Firestore 'gateCommands' for remote open triggers...");

db.collection("gateCommands")
  .where("status", "==", "PENDING")
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const cmdDoc = change.doc;
        console.log(`[GATE BRIDGE] Received command to open gate! (Doc: ${cmdDoc.id})`);

        let opened = false;
        for (const socket of activeSockets) {
          if (!socket.destroyed) {
            sendWsMessage(socket, { cmd: "opendoor", doornum: 1 });
            opened = true;
          }
        }

        if (opened) {
          console.log("[GATE BRIDGE] Sent OPEN command to physical gate immediately.");
          await cmdDoc.ref.update({
            status: "COMPLETED",
            executedAt: FieldValue.serverTimestamp(),
          });
        } else {
          console.log("[GATE BRIDGE] No active connection right now! Queuing command for the next reconnection...");
          pendingOpenCommandDoc = cmdDoc;
        }
      }
    });
  });

console.log("[GATE BRIDGE] Started successfully! Please keep this window open or running in the background.");
