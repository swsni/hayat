import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PKPass } from "passkit-generator";
import { getDb } from "./firebaseAdmin";
import { isFirebaseBearerAuthorized } from "./authService";
import { 
  resolveCustomerReferenceFromLink, 
  getWalletPassLinkSigningSecret, 
  getWalletPassLinkMaxAgeMs, 
  loadPassJsonConfig, 
  ensureHttpsUrl, 
  normalizePassLocations, 
  normalizeMaxDistance, 
  buildCafeOrderLink 
} from "./utils";
import { isSafeCustomerReference } from "../utils/helpers";

/**
 * Generate a deterministic 10-digit numeric gate card number from a customer ID.
 * Uses a simple hash to produce a consistent numeric value.
 */
function generateGateCardNumber(customerId: string): number {
  let hash = 0;
  const str = "HAYAT-GATE-" + customerId;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // Convert to 32bit integer
  }
  // Ensure positive 10-digit number (1000000000 to 2147483647)
  const positiveHash = Math.abs(hash);
  return positiveHash < 1000000000 ? positiveHash + 1000000000 : positiveHash;
}

export const handleWalletPass = async (req: any, res: any) => {
  try {
    const bodyCustomerId = String(req.body?.customerId || "").trim();
    const queryCustomerId = String(req.query?.customerId || "").trim();
    const internalAuthorizedFetch = Boolean(req.__walletInternalAuthorized);
    let customerId = bodyCustomerId || queryCustomerId;
    let customerName = req.body?.customerName || req.query?.customerName;

    if (!internalAuthorizedFetch) {
      const firebaseAuthorized = await isFirebaseBearerAuthorized(req);
      if (!firebaseAuthorized) {
        const resolved = resolveCustomerReferenceFromLink({
          signedCustomerId: String(req.query?.cid || req.body?.cid || "").trim(),
          signedTsRaw: String(req.query?.ts || req.body?.ts || "").trim(),
          signedSignature: String(req.query?.sig || req.body?.sig || "").trim(),
          legacyCustomerId: customerId,
          allowLegacy: (process.env.WALLET_ALLOW_LEGACY_PASS_LINK || "true").toLowerCase() === "true",
          secret: getWalletPassLinkSigningSecret(),
          maxAgeMs: getWalletPassLinkMaxAgeMs(),
        });

        if (resolved.ok === false) {
          return res.status(resolved.status).json({ error: resolved.error });
        }

        customerId = resolved.customerId;
        if (resolved.resolvedVia === "legacy") {
          console.warn(`[Wallet Pass] Legacy link accepted for customer ${customerId}.`);
        }
      }
    }

    if (!customerId || !isSafeCustomerReference(customerId)) {
      return res.status(400).json({ error: "Missing or invalid customerId" });
    }

    // Initialize wallet pass display variables
    let gymStatus = "لا يوجد عضوية جيم / No Gym";
    let gymExpiryValue = "";
    let totalSalonSessions = 0;
    let salonStatus = "";

    let walletBalance = 0;
    let firestoreDataLoaded = false;
    let gateCardNumber = 0;

    try {
      const adminDb = getDb();
      
      const custDoc = await adminDb.collection("customers").doc(customerId).get();
      if (custDoc.exists) {
        const custData = custDoc.data();
        const firestoreName = typeof custData?.name === "string" ? custData.name.trim() : "";
        customerName = firestoreName || (typeof customerName === "string" ? customerName.trim() : "") || "Member";
        walletBalance = custData?.walletBalance || 0;
        firestoreDataLoaded = true;
        
        // Get or generate gateCardNumber
        if (custData?.gateCardNumber) {
          gateCardNumber = custData.gateCardNumber;
        } else {
          gateCardNumber = generateGateCardNumber(customerId);
          // Save the generated gateCardNumber to the customer profile
          await adminDb.collection("customers").doc(customerId).update({ gateCardNumber });
          console.log(`[Wallet Pass] Generated and saved gateCardNumber ${gateCardNumber} for customer ${customerId}`);
        }
        
        console.log(`[Wallet Pass] Loaded customer ${customerId}: name="${customerName}", walletBalance=${walletBalance}, gateCardNumber=${gateCardNumber}`);
      } else {
        console.warn(`[Wallet Pass] Customer document NOT FOUND in Firestore for ID: ${customerId}. Using fallback name.`);
        if (!customerName || (typeof customerName === "string" && !customerName.trim())) {
          customerName = "Member";
        }
      }
      
      const packagesSnap = await adminDb.collection("customerPackages")
        .where("customerId", "==", customerId)
        .get();

      const msList: any[] = [];
      packagesSnap.forEach(d => {
        msList.push({ id: d.id, ...d.data() });
      });

      console.log(`[Wallet Pass] Found ${msList.length} package(s) for customer ${customerId}`);

      const activeGym = msList.find(p => p.category === 'gym' && p.isActive);
      if (activeGym) {
        const isFrozen = activeGym.isFrozen && activeGym.frozenUntil && new Date(activeGym.frozenUntil) > new Date();
        if (isFrozen) {
          gymStatus = `مجمد حتى ${activeGym.frozenUntil.split('T')[0]}`;
          gymExpiryValue = activeGym.endDate; // keep the expiry value for the pass
        } else if (activeGym.endDate) {
          gymStatus = `نشط ينتهي في ${activeGym.endDate}`;
          gymExpiryValue = activeGym.endDate;
        } else {
          gymStatus = "عضوية جيم نشطة / Active Gym";
        }
      }

      const activeSalonPkgs = msList.filter(p => p.category === 'salon' && Number(p.remainingSessions) > 0 && p.isActive !== false);
      if (activeSalonPkgs.length > 0) {
        totalSalonSessions = activeSalonPkgs.reduce((acc, p) => acc + (Number(p.remainingSessions) || 0), 0);
        salonStatus = activeSalonPkgs.map(p => `${p.packageName}: (${Number(p.remainingSessions)}/${Number(p.totalSessions)})`).join(", ");
      }
      console.log(`[Wallet Pass] Customer ${customerId} -> gym="${gymStatus}", salonSessions=${totalSalonSessions}`);
    } catch (e) {
      console.error(`[Wallet Pass] FAILED to query Firestore for customer ${customerId}. Pass will show defaults (Member / 0 sessions).`, e);
    }

    let certsDir = path.join(process.cwd(), 'certs');
    let wwdrPath = path.join(certsDir, 'wwdr.pem');
    let signerCertPath = path.join(certsDir, 'signerCert.pem');
    let signerKeyPath = path.join(certsDir, 'signerKey.pem');

    if (!fs.existsSync(wwdrPath) || !fs.existsSync(signerCertPath) || !fs.existsSync(signerKeyPath)) {
      const altDir1 = path.join(__dirname, 'certs');
      const altWwdr1 = path.join(altDir1, 'wwdr.pem');
      if (fs.existsSync(altWwdr1)) {
        certsDir = altDir1;
        wwdrPath = altWwdr1;
        signerCertPath = path.join(altDir1, 'signerCert.pem');
        signerKeyPath = path.join(altDir1, 'signerKey.pem');
      } else {
        const altDir2 = './dist/certs';
        const altWwdr2 = path.join(altDir2, 'wwdr.pem');
        if (fs.existsSync(altWwdr2)) {
          certsDir = altDir2;
          wwdrPath = altWwdr2;
          signerCertPath = path.join(altDir2, 'signerCert.pem');
          signerKeyPath = path.join(altDir2, 'signerKey.pem');
        }
      }
    }

    if (!fs.existsSync(wwdrPath) || !fs.existsSync(signerCertPath) || !fs.existsSync(signerKeyPath)) {
      return res.status(503).json({ 
        error: "Certificates missing", 
        message: `Please ensure wwdr.pem, signerCert.pem, and signerKey.pem are placed securely. Searched path: ${certsDir}`
      });
    }

    const wwdr = fs.readFileSync(wwdrPath);
    const signerCert = fs.readFileSync(signerCertPath);
    const signerKey = fs.readFileSync(signerKeyPath);

    let teamIdentifier = process.env.APPLE_TEAM_ID;
    let passTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER || process.env.APPLE_PASS_TYPE_ID;

    try {
      const cert = new crypto.X509Certificate(signerCert);
      const subject = cert.subject;

      const uidMatch = subject.match(/UID=([^,\n;]+)/i);
      if (uidMatch) {
        passTypeIdentifier = uidMatch[1].trim();
      } else {
        const commonNameMatch = subject.match(/CN=Pass\s+Type\s+ID:\s*([^,\n;]+)/i);
        if (commonNameMatch) {
          passTypeIdentifier = commonNameMatch[1].trim();
        }
      }

      const ouMatch = subject.match(/OU=([^,\n;]+)/i);
      if (ouMatch) {
        teamIdentifier = ouMatch[1].trim();
      }
      console.log(`[Apple Wallet Auto-Parse] Extracted from signerCert.pem -> PassTypeID: ${passTypeIdentifier}, TeamID: ${teamIdentifier}`);
    } catch (certError) {
      console.warn('[Apple Wallet Auto-Parse] Unable to parse signerCert.pem, falling back to ENV/defaults:', certError);
    }

    if (!teamIdentifier) teamIdentifier = "P9P7UNK8C4";
    if (!passTypeIdentifier) passTypeIdentifier = "pass.com.hayatbeauty.loyalty";

    let iconBuffer: Buffer;
    let logoPath = path.join(process.cwd(), 'public', 'logo.png');
    
    if (!fs.existsSync(logoPath)) {
      const altLogo1 = path.join(__dirname, 'public', 'logo.png');
      const altLogo2 = path.join(process.cwd(), 'dist', 'logo.png');
      const altLogo3 = './public/logo.png';
      if (fs.existsSync(altLogo1)) logoPath = altLogo1;
      else if (fs.existsSync(altLogo2)) logoPath = altLogo2;
      else if (fs.existsSync(altLogo3)) logoPath = altLogo3;
    }

    let logoBuffer: Buffer;
    try {
      logoBuffer = fs.readFileSync(logoPath);
    } catch {
      logoBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    }

    let icon1xBuffer = logoBuffer;
    let icon2xBuffer = logoBuffer;
    let icon3xBuffer = logoBuffer;

    const getIconPath = (name: string) => {
      let p = path.join(process.cwd(), 'public', name);
      if (!fs.existsSync(p)) p = path.join(__dirname, 'public', name);
      if (!fs.existsSync(p)) p = path.join(process.cwd(), 'dist', name);
      if (!fs.existsSync(p)) p = `./public/${name}`;
      return fs.existsSync(p) ? p : null;
    };

    try {
      const p1 = getIconPath('icon.png');
      if (p1) icon1xBuffer = fs.readFileSync(p1);
      const p2 = getIconPath('icon@2x.png');
      if (p2) icon2xBuffer = fs.readFileSync(p2);
      const p3 = getIconPath('icon@3x.png');
      if (p3) icon3xBuffer = fs.readFileSync(p3);
    } catch {}

    const serialNumber = `member-${customerId}`;
    let authToken = crypto.randomBytes(16).toString("hex");
    
    try {
      const adminDb = getDb();
      const passRef = adminDb.collection("wallet_passes").doc(serialNumber);
      
      authToken = await adminDb.runTransaction(async (transaction) => {
        const passDoc = await transaction.get(passRef);
        
        if (passDoc.exists && passDoc.data()?.authenticationToken) {
          const existingToken = passDoc.data()!.authenticationToken;
          transaction.set(passRef, {
            customerId: customerId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          return existingToken;
        }
        
        const newToken = crypto.randomBytes(16).toString("hex");
        transaction.set(passRef, {
          authenticationToken: newToken,
          customerId: customerId,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        return newToken;
      });
      
      console.log(`[Wallet Pass] Auth token secured for ${serialNumber}`);
    } catch (dbErr) {
      console.warn("Could not save authentication token to Firestore:", dbErr);
    }

    const passJsonConfig = loadPassJsonConfig();
    const webServiceURL = ensureHttpsUrl(
      String(
        passJsonConfig.webServiceURL
        || process.env.APPLE_WALLET_WEBSERVICE_URL
        || "https://hayat.beauty/api"
      ),
      "https://hayat.beauty/api"
    );
    const configuredLocations = normalizePassLocations(passJsonConfig.locations);

    const pass = new PKPass(
      {
        "icon.png": icon1xBuffer,
        "icon@2x.png": icon2xBuffer,
        "icon@3x.png": icon3xBuffer,
        "logo.png": logoBuffer,
      },
      {
        wwdr,
        signerCert,
        signerKey,
        signerKeyPassphrase: process.env.APPLE_PASSPHRASE || "",
      },
      {
        formatVersion: 1,
        passTypeIdentifier: passTypeIdentifier,
        teamIdentifier: teamIdentifier,
        organizationName: passJsonConfig.organizationName || "Hayat Beauty And Care",
        logoText: passJsonConfig.logoText || "Hayat Beauty And Care",
        description: passJsonConfig.description || "Hayat Beauty And Care Membership Pass",
        serialNumber: serialNumber,
        webServiceURL,
        authenticationToken: authToken,
        backgroundColor: passJsonConfig.backgroundColor || "rgb(125, 131, 78)",
        foregroundColor: passJsonConfig.foregroundColor || "rgb(255, 255, 255)",
        labelColor: passJsonConfig.labelColor || "rgb(238, 241, 232)"
      } as any
    );

    pass.type = "storeCard";
    
    pass.primaryFields.push({
      key: "member",
      label: "MEMBER / العضوة",
      value: customerName
    });

    pass.secondaryFields.push({
      key: "gym",
      label: "GYM MEMBERSHIP / الجيم",
      value: gymStatus,
      changeMessage: "تم تحديث اشتراك الجيم: %@"
    });

    pass.secondaryFields.push({
      key: "id",
      label: "MEMBER ID / الرقم",
      value: customerId.substring(0, 8).toUpperCase()
    });

    pass.auxiliaryFields.push({
      key: "salon",
      label: "SALON SESSIONS / جلسات الصالون",
      value: totalSalonSessions > 0 ? `${totalSalonSessions} جلسة متبقية` : "لا يوجد باقات نشطة",
      changeMessage: "تم تحديث جلسات الصالون: %@"
    });

    pass.backFields.push({
      key: "wallet_balance",
      label: "STORE CREDIT / المحفظة",
      value: `${walletBalance.toFixed(3)} BHD`,
      changeMessage: "رصيد المحفظة الجديد: %@"
    });

    pass.backFields.push({
      key: "disclaimer",
      label: "Card Usage / استخدام البطاقة",
      value: "This digital badge aggregates your live profile and memberships at Hayat Beauty And Care. Show this QR to check-in or claim services.\nالعضوية مخصصة للاستخدام الشخصي لدى فرع حياة بيوتي آند كير."
    });

    if (gymExpiryValue) {
      pass.backFields.push({
        key: "gym_expiry",
        label: "Gym Access Expires / انتهاء الجيم",
        value: gymExpiryValue
      });
    }

    if (totalSalonSessions > 0) {
      pass.backFields.push({
        key: "salon_details",
        label: "Active Salon Packages / تفاصيل الصالون",
        value: salonStatus
      });
    }

    const cafeOrderLink = buildCafeOrderLink(customerId);
    const cafeOrderLinkLabel = `${(process.env.PUBLIC_APP_URL || "https://hayat.beauty").replace(/\/+$/, "")}/cafe`;

    pass.backFields.push({
      key: "orderLink",
      label: "اطلب قهوتك الآن / Order Coffee",
      value: cafeOrderLink,
      attributedValue: `<a href="${cafeOrderLink}">${cafeOrderLinkLabel}</a>`
    });

    // Use numeric gateCardNumber for the barcode so Wiegand QR readers can process it
    const barcodeValue = gateCardNumber > 0 ? gateCardNumber.toString() : `HAYAT-${customerId}`;
    pass.setBarcodes(barcodeValue);
    console.log(`[Wallet Pass] Barcode set to: ${barcodeValue}`);

    if (configuredLocations.length > 0) {
      try {
        pass.setLocations(...(configuredLocations as any[]));
        console.log(`[Wallet Pass] Set ${configuredLocations.length} geofence location(s) on pass.`);
      } catch (locErr: any) {
        console.warn("[Wallet Pass] setLocations failed, skipping geofence:", locErr?.message);
      }
    }

    const buffer = await pass.getAsBuffer();
    
    res.set("Content-Type", "application/vnd.apple.pkpass");
    res.set("Content-Disposition", `attachment; filename="Hayat_Membership_${customerId}.pkpass"`);
    res.set("Last-Modified", new Date().toUTCString());
    res.send(buffer);
    
  } catch (error: any) {
    console.error('Pass generation error:', error);
    res.status(500).json({ error: "Pass Generation Failed", message: error.message });
  }
};
