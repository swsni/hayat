import "dotenv/config";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, query, where, doc, updateDoc, getDoc } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

async function fixInvoices() {
  console.log("Authenticating...");
  await signInAnonymously(auth);
  
  console.log("Starting invoice fix...");
  try {
    const invoicesSnap = await getDocs(collection(db, "invoices"));
    let updatedCount = 0;

    for (const docSnap of invoicesSnap.docs) {
      const invoice = docSnap.data();
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
             const q = query(collection(db, "customerPackages"), where("purchasedAt", "==", createdAt));
             const pkgsSnap = await getDocs(q);
             
             let partnerName = "";
             let partnerPhone = "";
             
             for (const pkgDoc of pkgsSnap.docs) {
                const pkg = pkgDoc.data();
                if (pkg.customerId !== invoice.primaryCustomerId) {
                   const partnerSnap = await getDoc(doc(db, "customers", pkg.customerId));
                   if (partnerSnap.exists()) {
                      partnerName = partnerSnap.data()?.name || "";
                      partnerPhone = partnerSnap.data()?.phone || "";
                      break;
                   }
                }
             }

             if (partnerName) {
                const newDesc = `${desc} (مع: ${partnerName} - ${partnerPhone})`;
                await updateDoc(doc(db, "invoices", docSnap.id), {
                   description: newDesc
                });
                
                const q2 = query(collection(db, "customerPackages"), where("purchasedAt", "==", createdAt), where("customerId", "==", invoice.primaryCustomerId));
                const primaryPkgsSnap = await getDocs(q2);
                for (const primaryPkg of primaryPkgsSnap.docs) {
                   await updateDoc(doc(db, "customerPackages", primaryPkg.id), {
                      packageName: newDesc
                   });
                }

                console.log(`Updated invoice ${docSnap.id} to: ${newDesc}`);
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
