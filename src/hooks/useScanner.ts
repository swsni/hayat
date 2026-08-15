import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc, query, collection, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { Customer, SessionState } from '../types';
import { showToast } from '../utils/toast';

export function useScanner(
  session: SessionState,
  setSelectedCustomer: (customer: Customer) => void,
  setCurrentStep: (step: 'LOGIN' | 'BRANCH_SELECT' | 'DASHBOARD' | 'ADMIN_SUITE' | 'CUSTOMER_PROFILE') => void
) {
  const scannedBuffer = useRef('');
  const scanTimeout = useRef<NodeJS.Timeout | null>(null);

  const [scannerLogs, setScannerLogs] = useState<string[]>([]);
  const [showScannerLogs, setShowScannerLogs] = useState(false);

  const addScanLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 } as any);
    setScannerLogs(prev => [`[${timestamp}] ${msg}`, ...prev].slice(0, 50));
  };

  const processFoundCustomer = async (customer: Customer, strategyLog: string) => {
    addScanLog(`✅ FOUND by ${strategyLog}! Customer: ${customer.name || 'unknown'} (ID: ${customer.id})`);
    setSelectedCustomer(customer);
    setCurrentStep('CUSTOMER_PROFILE');
  };

  const handleScanCustomer = useCallback(async (input: string, isFallback: boolean = false) => {
    addScanLog(`🔍 Looking up: "${input}" (fallback mode: ${isFallback})`);
    try {
      if (isFirebaseConfigured && db) {
        // Strategy 1: Direct document ID lookup
        addScanLog(`   [Strategy 1] Direct ID lookup: customers/${input}`);
        try {
          const docRef = doc(db, 'customers', input);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            await processFoundCustomer({ id: docSnap.id, ...data } as Customer, 'ID');
            return;
          } else {
            addScanLog(`   [Strategy 1] Not found by direct ID.`);
          }
        } catch (e) {
          addScanLog(`   [Strategy 1] Error: ${(e as Error).message}`);
        }

        // Strategy 1.5: Search by gateCardNumber (numeric QR from wallet/printed card)
        if (/^\d+$/.test(input)) {
          addScanLog(`   [Strategy 1.5] Searching by gateCardNumber: ${input}`);
          try {
            const gateQuery = query(collection(db, 'customers'), where('gateCardNumber', '==', Number(input)));
            const gateSnap = await getDocs(gateQuery);
            if (!gateSnap.empty) {
              const found = gateSnap.docs[0];
              const data = found.data();
              await processFoundCustomer({ id: found.id, ...data } as Customer, 'gateCardNumber');
              return;
            } else {
              addScanLog(`   [Strategy 1.5] No gateCardNumber match.`);
            }
          } catch (e) {
            addScanLog(`   [Strategy 1.5] Error: ${(e as Error).message}`);
          }
        }

        // Strategy 2: Search by name (exact match)
        if (isFallback) {
          addScanLog(`   [Strategy 2] Searching by name: "${input}"`);
          try {
            const nameQuery = query(collection(db, 'customers'), where('name', '==', input));
            const nameSnap = await getDocs(nameQuery);
            if (!nameSnap.empty) {
              const found = nameSnap.docs[0];
              const data = found.data();
              await processFoundCustomer({ id: found.id, ...data } as Customer, 'name');
              return;
            } else {
              addScanLog(`   [Strategy 2] No exact name match.`);
            }
          } catch (e) {
            addScanLog(`   [Strategy 2] Error: ${(e as Error).message}`);
          }

          // Strategy 3: Search by phone
          addScanLog(`   [Strategy 3] Searching by phone: "${input}"`);
          try {
            const phoneQuery = query(collection(db, 'customers'), where('phone', '==', input));
            const phoneSnap = await getDocs(phoneQuery);
            if (!phoneSnap.empty) {
              const found = phoneSnap.docs[0];
              const data = found.data();
              await processFoundCustomer({ id: found.id, ...data } as Customer, 'phone');
              return;
            } else {
              addScanLog(`   [Strategy 3] No phone match.`);
            }
          } catch (e) {
            addScanLog(`   [Strategy 3] Error: ${(e as Error).message}`);
          }

          // Strategy 4: Scan all customers and partial match
          addScanLog(`   [Strategy 4] Scanning all customers for partial match...`);
          try {
            const qSearch = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(100));
            const allSnap = await getDocs(qSearch);
            addScanLog(`   Total customers in DB: ${allSnap.size}`);
            for (const d of allSnap.docs) {
              const data = d.data();
              const name = (data.name || '').toLowerCase();
              const inputLower = input.toLowerCase();
              if (name.includes(inputLower) || inputLower.includes(name)) {
                await processFoundCustomer({ id: d.id, ...data } as Customer, 'PARTIAL MATCH');
                return;
              }
            }
            const sampleIds = allSnap.docs.slice(0, 3).map(d => `${d.id} (${d.data().name || '?'})`);
            addScanLog(`   Sample customer IDs: ${sampleIds.join(', ')}`);
            addScanLog(`   [Strategy 4] No partial match found.`);
          } catch (e) {
            addScanLog(`   [Strategy 4] Error: ${(e as Error).message}`);
          }
        }
      } else {
        addScanLog(`   Firestore not configured. Checking localStorage...`);
        const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
        const found = localCustomers.find((c: Customer) => 
          c.id === input || c.name === input || c.phone === input
        );
        if (found) {
          await processFoundCustomer(found, 'localStorage');
          return;
        } else {
          addScanLog(`❌ NOT FOUND in localStorage.`);
        }
      }
      addScanLog(`⛔ FINAL: "${input}" not found anywhere.`);
      showToast('Scanned Card Invalid or Customer Not Found.', 'error');
    } catch (err: any) {
      addScanLog(`💥 ERROR: ${err.message}`);
      console.error('Scan handling failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSelectedCustomer, setCurrentStep]);

  useEffect(() => {
    if (!session.isLoggedIn) return;

    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      if (scanTimeout.current) {
        clearTimeout(scanTimeout.current);
      }

      if (e.key === 'Enter') {
        const barcode = scannedBuffer.current.trim();
        scannedBuffer.current = ''; 
        
        if (barcode.length === 0) return;
        
        let lookupKey = '';
        let isBarcode = false;
        
        console.log('--- SCANNER RAW STRING ---', barcode);
        addScanLog(`⏎ ENTER pressed. Buffer: "${barcode}"`);

        try {
          // Try to parse as a standard URL first
          const url = new URL(barcode);
          // Strategy A: URL Query Parameter 'customerId' (legacy) or 'cid' (signed links)
          const queryId = url.searchParams.get('customerId');
          const signedCid = url.searchParams.get('cid');
          if (queryId || signedCid) {
            isBarcode = true;
            lookupKey = (queryId || signedCid || '').trim();
          } 
          // Strategy B: Path segment (e.g., /api/wallet/generate/12345)
          else if (url.pathname.includes('/api/wallet/')) {
            isBarcode = true;
            const parts = url.pathname.split('/').filter(Boolean);
            lookupKey = parts[parts.length - 1];
          }
        } catch (e) {
          // Not a valid URL, fallback to raw string checks
          if (barcode.includes('customerId=') || barcode.includes('cid=')) {
            isBarcode = true;
            const match = barcode.match(/(?:customerId|cid)=([^&]+)/);
            if (match && match[1]) {
              lookupKey = match[1];
            }
          } else if (barcode.startsWith('HAYAT-')) {
            isBarcode = true;
            lookupKey = barcode.replace('HAYAT-', '');
          } else if (/^\d{7,10}$/.test(barcode)) {
            // Numeric gateCardNumber from printed card or wallet QR
            isBarcode = true;
            lookupKey = barcode;
            addScanLog(`🔢 Detected numeric gateCardNumber: ${barcode}`);
          } else if (/^[a-zA-Z0-9]{20}$/.test(barcode)) {
            isBarcode = true;
            lookupKey = barcode;
          }
        }

        if (isBarcode && lookupKey) {
          console.log('--- SCANNER EXTRACTED ID ---', lookupKey);
          e.preventDefault();
          e.stopPropagation();
          addScanLog(`✅ Valid Barcode/QR Detected! ID: "${lookupKey}"`);
          await handleScanCustomer(lookupKey, false);
        } else {
          addScanLog(`⚠️ Not a recognized Hayat barcode format or just manual typing. Ignored.`);
        }
        return;
      }

      if (e.key.length === 1) {
        scannedBuffer.current += e.key;
        if (scannedBuffer.current.length <= 6 || scannedBuffer.current.length % 10 === 0) {
          addScanLog(`🔤 Key: "${e.key}" → Buffer: "${scannedBuffer.current}"`);
        }
      }

      scanTimeout.current = setTimeout(() => {
        if (scannedBuffer.current.length > 0) {
          addScanLog(`⏳ Timeout! Buffer cleared (was: "${scannedBuffer.current}")`);
        }
        scannedBuffer.current = '';
      }, 500);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      if (scanTimeout.current) clearTimeout(scanTimeout.current);
    };
  }, [session.isLoggedIn, handleScanCustomer]);

  // Listen to remote gate scans and popup the customer profile
  useEffect(() => {
    if (!session.isLoggedIn || !session.activeBranch) return;
    if (!isFirebaseConfigured || !db) return;

    const mountTime = new Date();

    const q = query(
      collection(db, 'gateLogs'),
      where('branch', '==', session.activeBranch),
      orderBy('timestamp', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const logData = change.doc.data();
          const logTime = logData.timestamp?.toDate();
          
          if (logTime && logTime > mountTime) {
            const customerId = logData.customerId;
            if (customerId && customerId !== 'UNKNOWN') {
              try {
                const docRef = doc(db, 'customers', customerId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                  setSelectedCustomer({ id: docSnap.id, ...docSnap.data() } as Customer);
                  setCurrentStep('CUSTOMER_PROFILE');
                  
                  if (logData.status === 'GRANTED') {
                    showToast(`البوابة: تم قراءة الكود بنجاح - ${logData.customerName}`, 'success');
                    addScanLog(`🔓 Remote Gate Scan: Access GRANTED to ${logData.customerName}`);
                  } else {
                    showToast(`البوابة مرفوض: ${logData.reason}`, 'error');
                    addScanLog(`🔒 Remote Gate Scan: Access DENIED for ${logData.customerName} - ${logData.reason}`);
                  }
                }
              } catch (e) {
                console.error("Error fetching customer for gate scan popup:", e);
              }
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [session.isLoggedIn, session.activeBranch, setSelectedCustomer, setCurrentStep]);

  return { scannerLogs, showScannerLogs, setShowScannerLogs, setScannerLogs };
}
