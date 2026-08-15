import "dotenv/config";
import express from "express";
import path from "path";
import * as functions from "firebase-functions/v1";

import { ensureAdminInitialized, getDb } from "./server/firebaseAdmin";
import { 
  getWebNotificationRetentionDays,
  dispatchWalletPushForFamily,
  enqueueWebNotificationForFamily
} from "./server/notificationsService";
import { isSafeCustomerId } from "./utils/helpers";
import { apiRouter } from "./server/routes";
import { initGateWebSocketServer } from "./server/gateWebSocket";

const app = express();

// ── CORS Allowlist ────────────────────────────────────────────────────────────
const ALWAYS_ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
];

const ENV_ORIGINS: string[] = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  if (ALWAYS_ALLOWED_ORIGINS.some((re) => re.test(origin))) return true;
  return ENV_ORIGINS.includes(origin);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin!);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-wallet-trigger-key, x-wallet-admin-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// API Routes
app.use("/api", apiRouter);

// Vite / static file middleware & HTTP Server bootstrapping
async function startServer() {
  const PORT = 3000;
  let vite: any;
  
  if (process.env.NODE_ENV !== "production") {
    try {
      const { createServer: createViteServer } = await import("vite");
      vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.log("Vite dev server not started.", e);
    }
  }

  app.use(express.static('dist'));
  app.get('*', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
  });

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // initGateWebSocketServer(7788); // Disabled to allow C# CloudDemo to use port 7788
  });

  if (process.env.NODE_ENV !== "production" && vite) {
    server.on('upgrade', (request: any, socket: any, head: any) => {
      vite.ws.handleUpgrade(request, socket, head);
    });
  }
}

const isCloudFunction = process.env.FUNCTION_SIGNATURE_TYPE || process.env.FUNCTION_TARGET || process.env.FIREBASE_CONFIG;
if (!isCloudFunction) {
  startServer();
}

// Export the Express app as a v1 HTTPS Firebase Cloud Function
export const apiV1 = functions.https.onRequest(app);

// Initialize Firebase Admin App eagerly when possible.
ensureAdminInitialized();

// Scheduled Cron to automatically cleanup the Recycle Bin every midnight
export const cleanupRecycleBinV1 = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('Asia/Bahrain')
  .onRun(async (_context) => {
    try {
      const adminDb = getDb();
      const now = new Date();

      const thresholdDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const thresholdISO  = thresholdDate.toISOString();

      console.log(`[Scheduled Cleanup] Starting cron run. Purging records soft-deleted before: ${thresholdISO}`);

      const expiredCustomersSnap = await adminDb
        .collection('customers')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<', thresholdISO)
        .get();

      let deletedCustomersCount = 0;
      const customerBatches: FirebaseFirestore.WriteBatch[] = [];
      let currentBatch = adminDb.batch();
      let batchCount = 0;

      for (const docSnap of expiredCustomersSnap.docs) {
        currentBatch.delete(docSnap.ref);
        batchCount++;
        deletedCustomersCount++;
        if (batchCount === 500) {
          customerBatches.push(currentBatch);
          currentBatch = adminDb.batch();
          batchCount = 0;
        }
      }
      if (batchCount > 0) customerBatches.push(currentBatch);
      await Promise.all(customerBatches.map((b) => b.commit()));

      const expiredInvoicesSnap = await adminDb
        .collection('invoices')
        .where('isDeleted', '==', true)
        .where('deletedAt', '<', thresholdISO)
        .get();

      let deletedInvoicesCount = 0;
      const invoiceBatches: FirebaseFirestore.WriteBatch[] = [];
      let invBatch = adminDb.batch();
      let invCount = 0;

      for (const docSnap of expiredInvoicesSnap.docs) {
        invBatch.delete(docSnap.ref);
        invCount++;
        deletedInvoicesCount++;
        if (invCount === 500) {
          invoiceBatches.push(invBatch);
          invBatch = adminDb.batch();
          invCount = 0;
        }
      }
      if (invCount > 0) invoiceBatches.push(invBatch);
      await Promise.all(invoiceBatches.map((b) => b.commit()));

      const webRetentionDays = getWebNotificationRetentionDays();
      const webThresholdDate = new Date(now.getTime() - webRetentionDays * 24 * 60 * 60 * 1000);
      const webThresholdIso = webThresholdDate.toISOString();

      const expiredWebNotificationsSnap = await adminDb
        .collection('web_notifications')
        .where('createdAt', '<', webThresholdIso)
        .get();

      let deletedWebNotificationsCount = 0;
      const webBatches: FirebaseFirestore.WriteBatch[] = [];
      let webBatch = adminDb.batch();
      let webCount = 0;

      for (const docSnap of expiredWebNotificationsSnap.docs) {
        webBatch.delete(docSnap.ref);
        webCount++;
        deletedWebNotificationsCount++;
        if (webCount === 500) {
          webBatches.push(webBatch);
          webBatch = adminDb.batch();
          webCount = 0;
        }
      }
      if (webCount > 0) webBatches.push(webBatch);
      await Promise.all(webBatches.map((b) => b.commit()));

      console.log(`[Scheduled Cleanup] Purged ${deletedCustomersCount} customer(s), ${deletedInvoicesCount} invoice(s), and ${deletedWebNotificationsCount} web notification(s).`);
    } catch (err) {
      console.error('[Scheduled Cleanup] Failed to run cron execution:', err);
    }
  });

export const onCustomerPackageChangeTriggerV1 = functions.firestore
  .document("customerPackages/{packageId}")
  .onWrite(async (change, context) => {
    const afterData = change.after.exists ? change.after.data() : null;
    const beforeData = change.before.exists ? change.before.data() : null;
    const customerId = String(afterData?.customerId || beforeData?.customerId || "").trim();
    if (!customerId || !isSafeCustomerId(customerId)) return;

    const packageName = String(afterData?.packageName || beforeData?.packageName || "الباقة").trim();
    const nextRemaining = Number(afterData?.remainingSessions ?? 0);
    const prevRemaining = Number(beforeData?.remainingSessions ?? 0);

    let type = "session_updated";
    let title = "تم تحديث الجلسات";
    let body = `تم تحديث باقة ${packageName}.`;

    if (!change.before.exists && change.after.exists) {
      type = "session_added";
      title = "تمت إضافة جلسة/باقة جديدة";
      body = `تمت إضافة باقة ${packageName} (${nextRemaining} جلسة متبقية).`;
    } else if (change.before.exists && !change.after.exists) {
      type = "session_deleted";
      title = "تم حذف جلسة/باقة";
      body = `تم حذف باقة ${packageName}.`;
    } else if (nextRemaining !== prevRemaining) {
      type = "session_updated";
      title = "تم تحديث عدد الجلسات";
      body = `باقة ${packageName}: المتبقي الآن ${Math.max(0, nextRemaining)} جلسة.`;
    }

    await dispatchWalletPushForFamily(customerId);
    await enqueueWebNotificationForFamily(customerId, {
      type,
      title,
      body,
      url: "/",
      metadata: {
        packageId: context.params.packageId,
        packageName,
      },
    });
  });

export const onCustomerChangeTriggerV1 = functions.firestore
  .document("customers/{customerId}")
  .onWrite(async (change, context) => {
    const beforeData = change.before.data();
    const afterData = change.after.data();

    if (!afterData) return;

    const oldBalance = beforeData ? (beforeData.walletBalance || 0) : 0;
    const newBalance = afterData.walletBalance || 0;

    if (oldBalance === newBalance) {
      return;
    }

    await dispatchWalletPushForFamily(context.params.customerId);
  });

export const onCafeOrderStatusChangeNotifyV1 = functions.firestore
  .document("cafe_orders/{orderId}")
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data() || {};
    const afterData = change.after.data() || {};

    const previousStatus = String(beforeData.status || "").trim();
    const nextStatus = String(afterData.status || "").trim();
    if (!nextStatus || previousStatus === nextStatus) return;

    const customerId = String(afterData.customerId || "").trim();
    if (!customerId || !isSafeCustomerId(customerId)) return;

    const orderNumber = String(afterData.orderNumber || context.params.orderId || "").trim();

    if (nextStatus === "Ready") {
      await enqueueWebNotificationForFamily(customerId, {
        type: "cafe_order_ready",
        title: "طلب القهوة جاهز",
        body: `طلبك رقم ${orderNumber} جاهز للاستلام من الكاونتر.`,
        url: "/cafe",
        metadata: {
          orderId: context.params.orderId,
          orderNumber,
          status: nextStatus,
        },
      });
      return;
    }

    if (nextStatus === "Cancelled") {
      await enqueueWebNotificationForFamily(customerId, {
        type: "cafe_order_cancelled",
        title: "تحديث على طلب القهوة",
        body: `طلبك رقم ${orderNumber} تم إلغاؤه. يرجى التواصل مع الفرع للمساعدة.`,
        url: "/cafe",
        metadata: {
          orderId: context.params.orderId,
          orderNumber,
          status: nextStatus,
        },
      });
    }
  });
