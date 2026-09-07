import "dotenv/config";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";

const sa = JSON.parse(fs.readFileSync("./sa.json", "utf8"));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function fixInvoices() {
  console.log("Starting invoice fix...");
  try {
    const invoicesSnap = await db.collection("invoices").get();
    let updatedCount = 0;

    for (const doc of invoicesSnap.docs) {
      const invoice = doc.data();
      const desc = invoice.description || "";
      
      if (
        desc.toLowerCase().includes("couple") || 
        desc.toLowerCase().includes("for 2") || 
        desc.toLowerCase().includes("for two") || 
        desc.includes("لشخصين") || 
        desc.includes("ثنائي")
      ) {
        if (!desc.includes("(مع:")) {
          const createdAt = invoice.createdAt;
          if (createdAt) {
             const pkgsSnap = await db.collection("customerPackages")
                .where("purchasedAt", "==", createdAt)
                .get();
             
             let partnerName = "";
             let partnerPhone = "";
             
             for (const pkgDoc of pkgsSnap.docs) {
                const pkg = pkgDoc.data();
                if (pkg.customerId !== invoice.primaryCustomerId) {
                   const partnerSnap = await db.collection("customers").doc(pkg.customerId).get();
                   if (partnerSnap.exists) {
                      partnerName = partnerSnap.data()?.name || "";
                      partnerPhone = partnerSnap.data()?.phone || "";
                      break;
                   }
                }
             }

             if (partnerName) {
                const newDesc = `${desc} (مع: ${partnerName} - ${partnerPhone})`;
                await db.collection("invoices").doc(doc.id).update({
                   description: newDesc
                });
                
                const primaryPkgsSnap = await db.collection("customerPackages")
                  .where("purchasedAt", "==", createdAt)
                  .where("customerId", "==", invoice.primaryCustomerId)
                  .get();
                for (const primaryPkg of primaryPkgsSnap.docs) {
                   await db.collection("customerPackages").doc(primaryPkg.id).update({
                      packageName: newDesc
                   });
                }
                
                const logsSnap = await db.collection("auditLogs")
                   .where("timestamp", "==", createdAt)
                   .where("customerId", "==", invoice.primaryCustomerId)
                   .where("action", "==", "Purchase")
                   .get();
                for (const logDoc of logsSnap.docs) {
                   const logDesc = logDoc.data().description;
                   if (logDesc && logDesc.includes(desc) && !logDesc.includes("(مع:")) {
                      const newLogDesc = logDesc.replace(desc, newDesc);
                      await db.collection("auditLogs").doc(logDoc.id).update({ description: newLogDesc });
                   }
                }

                console.log(`Updated invoice ${doc.id} to: ${newDesc}`);
                updatedCount++;
             }
          }
        }
      }
    }
    console.log(`Done! Updated ${updatedCount} invoices.`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

fixInvoices();
