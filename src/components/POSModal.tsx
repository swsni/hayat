import React, { useState, useEffect, useRef } from 'react';
import { useCurrency } from '../LanguageContext';
import { Customer, CustomerPackage, Invoice, AuditLog, PaymentMethod } from '../types';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, getDocs, addDoc, writeBatch, doc, onSnapshot, increment, getDoc, orderBy, limit } from 'firebase/firestore';
import { CreditCard, Search, ArrowRight, UserPlus, CheckCircle, Tag, Info, User, X, AlertCircle, Calendar, ChevronRight } from 'lucide-react';
import { showToast } from '../utils/toast';
import { offlineSyncService } from '../utils/offlineSync';
import { useLanguage } from '../LanguageContext';
import { triggerWalletUpdate } from '../utils/wallet';
import { isCafeBranchEnabled } from '../utils/cafeBranch';
import { isQatarBranch } from '../utils/branchHelpers';
import { expandHayatPackage } from '../utils/hayatPackage';

interface POSModalProps {
  type: 'salon' | 'gym' | 'cafe';
  customer: Customer;
  staffName: string;
  staffId?: string;
  branch: string;
  onClose: () => void;
  onSuccess: () => void;
  preselectedItem?: any;
}

export default function POSModal({ type, customer, staffName, staffId, branch, onClose, onSuccess, preselectedItem }: POSModalProps) {
  const { language, t } = useLanguage();
  const currency = useCurrency();
  const isQatar = isQatarBranch(branch);
  const [step, setStep] = useState<'SELECT_ITEM' | 'CUSTOMIZE_ITEM' | 'SELECT_PAYMENT' | 'COUPLE_PROMO_SEARCH' | 'SUCCESS' | 'QUEUED'>('SELECT_ITEM');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isEmployeeDiscount, setIsEmployeeDiscount] = useState(false);
  const [splitPayments, setSplitPayments] = useState<{method: PaymentMethod, amount: number}[]>([]);
  const [currentSplitMethod, setCurrentSplitMethod] = useState<PaymentMethod | ''>('');
  const [currentSplitAmount, setCurrentSplitAmount] = useState<string>('');
  
  // Couple promo state
  const [coupleSecondCustomer, setCoupleSecondCustomer] = useState<Customer | null>(null);
  const [tripleThirdCustomer, setTripleThirdCustomer] = useState<Customer | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // New couple customer inline creation
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerCountryCode, setNewCustomerCountryCode] = useState(isQatar ? '+974' : '+973');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const processingLockRef = useRef(false); // Synchronous lock to prevent double-click
  const [dbPackages, setDbPackages] = useState<any[]>([]);

  // Start and End dates for gym packages
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return d.toISOString().substring(0, 10); // YYYY-MM-DD
  });

  const [showOverrideWarning, setShowOverrideWarning] = useState(false);
  const [overrideWarningData, setOverrideWarningData] = useState<{
    sessionsChanged: boolean;
    priceChanged: boolean;
    originalSessions: number;
    originalPrice: number;
  } | null>(null);
  const [endDate, setEndDate] = useState('');

  const parseDurationInMonths = (packageName: string): number => {
    const lowercase = packageName.toLowerCase();
    
    // Year check
    if (lowercase.includes('year') || lowercase.includes('سنة') || lowercase.includes('عام')) {
      return 12;
    }
    
    // Try to find numbers followed by month/months/شهر/أشهر
    const enMatch = lowercase.match(/(\d+)\s*month/);
    if (enMatch) {
      return parseInt(enMatch[1]);
    }
    
    const arMatch = lowercase.match(/(\d+)\s*(شهر|أشهر|اشهر)/);
    if (arMatch) {
      return parseInt(arMatch[1]);
    }
    
    // Specific word checks
    if (lowercase.includes('three') || lowercase.includes('ثلاث')) return 3;
    if (lowercase.includes('six') || lowercase.includes('ست')) return 6;
    if (lowercase.includes('couple') || lowercase.includes('single')) return 1;
    if (lowercase.includes('شهرين')) return 2;
    if (lowercase.includes('شهر')) return 1;
    
    return 1; // standard default
  };

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItem(preselectedItem);
      setStep('SELECT_PAYMENT');
    }
  }, [preselectedItem]);

  useEffect(() => {
    if (selectedItem && type === 'gym') {
      const months = parseDurationInMonths(selectedItem.name);
      const startD = new Date(startDate);
      if (!isNaN(startD.getTime())) {
        const endD = new Date(startD);
        endD.setMonth(endD.getMonth() + months);
        setEndDate(endD.toISOString().substring(0, 10));
      }
    }
  }, [selectedItem, startDate, type]);

  useEffect(() => {
    let unsubscribe = () => {};

    if (isFirebaseConfigured && db) {
      unsubscribe = onSnapshot(collection(db, 'packages'), (snapshot) => {
        const fetched: any[] = [];
        snapshot.forEach(docSnap => {
          const data = docSnap.data();
          const name = data.name || '';
          fetched.push({
            id: docSnap.id,
            name: name,
            price: Number(data.price) || 0,
            sessions: Number(data.sessions) || 1,
            category: data.category || 'salon',
            targetBranch: data.targetBranch || '',
            isCouple: name.toLowerCase().includes('couple') || name.toLowerCase().includes('for 2') || name.toLowerCase().includes('for two') || name.includes('لشخصين') || name.includes('ثنائي') || name.toLowerCase().includes('for 3') || name.includes('لثلاثة') || name.includes('ثلاث'),
            isTriple: name.toLowerCase().includes('for 3') || name.includes('لثلاثة') || name.includes('ثلاث')
          });
        });
        setDbPackages(fetched);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, 'packages');
      });
    }

    return () => {
      unsubscribe();
    };
  }, []);
  
  // Hardcoded items based on requirements context (as robust defaults)
  const salonPackages = [
    { id: 'sp-1', name: 'Therapeutic Henna without wash', price: 20.000, sessions: 1 },
    { id: 'sp-2', name: 'Therapeutic Henna with wash', price: 25.000, sessions: 1 },
    { id: 'sp-3', name: 'Red Mashat without wash', price: 20.000, sessions: 1 },
    { id: 'sp-4', name: 'Red Mashat with wash', price: 25.000, sessions: 1 },
    { id: 'sp-5', name: 'Sidr with wash', price: 20.000, sessions: 1 },
    { id: 'sp-6', name: 'Oil Massage without wash', price: 15.000, sessions: 1 },
    { id: 'sp-7', name: 'Oil Massage with wash', price: 18.000, sessions: 1 },
    { id: 'sp-8', name: 'Green Mashat with wash', price: 30.000, sessions: 1 }
  ];

  const gymPromos = [
    { id: 'gp-single', name: '1 Month Membership (Promo Single)', price: 33.000, sessions: 1 },
    { id: 'gp-couple', name: 'Offer 1 month for 2', price: 55.000, sessions: 1, isCouple: true },
    { id: 'gp-triple', name: 'Offer 1 month for 3', price: 82.500, sessions: 1, isCouple: true, isTriple: true }
  ];

  const dbItems = dbPackages.filter(p => {
    if (p.category !== type) return false;
    const isTargetQatar = isQatarBranch(p.targetBranch || '');
    const isCurrentQatar = isQatarBranch(branch);
    if (isCurrentQatar && !isTargetQatar) return false; // Qatar branch only sees Qatar packages
    if (!isCurrentQatar && isTargetQatar) return false; // Other branches don't see Qatar packages
    return true;
  });
  const items = dbItems.length > 0 ? dbItems : (type === 'salon' ? salonPackages : gymPromos);

  const handleSearchCustomer = async () => {
    const term = customerSearchQuery.trim();
    if (!term) return;
    setIsSearching(true);
    
    try {
      if (isFirebaseConfigured && db) {
        // 1. QR Scanner Integration
        if (term.toUpperCase().startsWith('HAYAT-')) {
          const docId = term.substring(6).trim();
          if (docId) {
            const docRef = doc(db, 'customers', docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
              const cData = docSnap.data() as Customer;
              if (!cData.isDeleted && docSnap.id !== customer.id && docSnap.id !== coupleSecondCustomer?.id) {
                setSearchResults([{ id: docSnap.id, ...cData }]);
              } else {
                setSearchResults([]);
              }
            } else {
              setSearchResults([]);
            }
            return;
          }
        }

        // 2. Phone Search (Native Prefix)
        if (/^\d+$/.test(term)) {
          const q = query(
            collection(db, 'customers'),
            where('phone', '>=', term),
            where('phone', '<=', term + '\uf8ff'),
            limit(50)
          );
          const snap = await getDocs(q);
          const fetched: Customer[] = [];
          snap.forEach(d => {
            const c = { id: d.id, ...d.data() } as Customer;
            if (!c.isDeleted && c.id !== customer.id && c.id !== coupleSecondCustomer?.id) fetched.push(c);
          });
          setSearchResults(fetched);
          return;
        }

        // 3. Fallback Name Search (Fetch recent and filter robustly)
        const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(300));
        const snap = await getDocs(q);
        const termLower = term.toLowerCase();
        const fetched: Customer[] = [];
        snap.forEach(d => {
          const c = { id: d.id, ...d.data() } as Customer;
          if (!c.isDeleted && c.name.toLowerCase().includes(termLower) && c.id !== customer.id && c.id !== coupleSecondCustomer?.id) {
            fetched.push(c);
          }
        });
        setSearchResults(fetched);

      } else {
        const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
        const filtered = localCustomers.filter((c: Customer) => 
          (c.name.toLowerCase().includes(term.toLowerCase()) || 
           c.phone.includes(term)) && 
           c.id !== customer.id && c.id !== coupleSecondCustomer?.id
        );
        setSearchResults(filtered);
      }
    } catch (err) {
      console.error('POS Customer Search Error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCreateInlineCustomer = async () => {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;

    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(newCustomerName.trim())) {
      showToast(language === 'ar' ? 'الرجاء كتابة اسم العميل باللغة الإنجليزية فقط.' : 'Please enter the name in English only.', 'error');
      return;
    }

    setIsCreatingCustomer(true);
    
    try {
      const now = new Date().toISOString();
      let createdCustomer: Customer;
      
      const newCustData = {
        name: newCustomerName,
        phone: newCustomerPhone,
        countryCode: newCustomerCountryCode,
        createdAt: now
      };

      if (isFirebaseConfigured && db) {
        const docRef = await addDoc(collection(db, 'customers'), newCustData);
        createdCustomer = { id: docRef.id, ...newCustData };
      } else {
        createdCustomer = { id: 'cust-' + Date.now(), ...newCustData };
        const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
        localCustomers.push(createdCustomer);
        localStorage.setItem('local_customers', JSON.stringify(localCustomers));
      }
      
      setCoupleSecondCustomer(createdCustomer);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const handleSelectItem = (item: any) => {
    setSelectedItem({ ...item }); // Clone so we can edit
    if (type === 'salon') {
      setStep('CUSTOMIZE_ITEM');
    } else {
      if (item.isCouple) {
        setStep('COUPLE_PROMO_SEARCH');
      } else {
        setStep('SELECT_PAYMENT');
      }
    }
  };

  const handleConfirmPurchase = async () => {
    if (splitPayments.length === 0 || !selectedItem) return;
    // ── Double-click guard (synchronous ref check) ────────────────────────
    // React state updates are async, so isProcessing may not yet be true
    // when a fast second click arrives.  The ref is set synchronously.
    if (processingLockRef.current) return;
    processingLockRef.current = true;

    if (type === 'cafe' && !isCafeBranchEnabled(branch)) {
      showToast(
        language === 'ar'
          ? 'مبيعات القهوة متاحة فقط لفرع الجنبية'
          : 'Coffee sales are available only for Janabiya branch',
        'error'
      );
      processingLockRef.current = false;
      return;
    }
    setIsProcessing(true);

    const now = new Date().toISOString();
    // ── Pre-generate deterministic IDs (idempotency) ──────────────────────
    // Using fixed IDs means that if the batch succeeds but the network
    // response is lost and the offline sync replays the action, Firestore
    // will overwrite the SAME document instead of creating a duplicate.
    const txnId = `${customer.id}-${Date.now()}`;
    const generatedPackageId  = `pkg-${txnId}`;
    const generatedInvoiceId  = `inv-${txnId}`;
    const generatedLogId      = `log-${txnId}`;
    const generatedPartnerPkgId  = `pkg-${txnId}-partner`;
    const generatedPartnerLogId  = `log-${txnId}-partner`;
    const generatedThirdPkgId    = `pkg-${txnId}-third`;
    const generatedThirdLogId    = `log-${txnId}-third`;

    // ── Pre-compute dates once ─────────────────────────────────────────────
    // Extracted from the try/catch so they are available in both the online
    // and offline code paths without duplication.
    const calculatedStartDate = type === 'gym' ? startDate : now.substring(0, 10);
    const calculatedEndDate = type === 'gym'
      ? endDate
      : (() => {
          const d = new Date(calculatedStartDate);
          d.setDate(d.getDate() + 365);
          return d.toISOString().substring(0, 10);
        })();

    // ── Helper: build a human-readable payment description ────────────────
    const paymentSummary = splitPayments.map(p => `${p.method} ${p.amount.toFixed(3)}`).join(' + ');
    const isSplit = splitPayments.length > 1;
    const primaryPaymentMethod: PaymentMethod = isSplit ? 'Split' : splitPayments[0].method;

    if (isFirebaseConfigured && db && navigator.onLine) {
      try {
        // ── Atomic Firestore Batch ────────────────────────────────────────
        // All three core operations are written in a single batch.
        // If any write fails, Firestore rolls back the entire batch atomically —
        // there is no partial state where an invoice exists without an audit log,
        // or a customer balance is deducted without a corresponding invoice.
        const batch = writeBatch(db);

        // ── Operation 1: Create Invoice ───────────────────────────────────
        const effectivePrice = isEmployeeDiscount ? selectedItem.price * 0.70 : selectedItem.price;
        const discountAmt = isEmployeeDiscount ? selectedItem.price * 0.30 : 0;
        const descName = isEmployeeDiscount 
          ? `${selectedItem.name} (${language === 'ar' ? 'خصم موظفين 30%' : '30% Staff Discount'})`
          : selectedItem.name;

        const invoiceRef = doc(db, 'invoices', generatedInvoiceId);
        const invoiceData: Invoice = {
          primaryCustomerId: customer.id,
          customerName:      customer.name,
          amount:            effectivePrice,
          paymentMethod:     primaryPaymentMethod,
          payments:          splitPayments,
          description:       descName,
          category:          type === 'cafe' ? 'cafe_sale' : type,
          createdAt:         now,
          branch,
          staffName,
          staffId,
          isRefund:          false,
        };
        batch.set(invoiceRef, invoiceData);

        // ── Operation 2: Deduct Customer Balance (Store Credit only) ─────
        // We only write to the customer document when a Store Credit payment
        // exists.  Using `increment()` is safe here because Firestore atomically
        // applies the delta — a concurrent session cannot create a race condition.
        const storeCreditUsed = splitPayments
          .filter(p => p.method === 'Store Credit')
          .reduce((sum, p) => sum + p.amount, 0);

        if (storeCreditUsed > 0) {
          const currentBalance = customer.walletBalance || 0;
          if (currentBalance < storeCreditUsed) {
            showToast(
              language === 'ar'
                ? `الرصيد غير كافٍ. المتوفر: ${currentBalance.toFixed(3)}`
                : `Insufficient wallet balance. Available: ${currentBalance.toFixed(3)}`,
              'error'
            );
            setIsProcessing(false);
            processingLockRef.current = false;
            return;
          }

          const custRef = doc(db, 'customers', customer.id);
          // Guard: only decrement if the document has a walletBalance field.
          // If the field is missing, start from 0 before decrementing.
          batch.update(custRef, {
            walletBalance: increment(-storeCreditUsed),
          });
        }

        // ── Operation 3: Audit Log ────────────────────────────────────────
        const logRef = doc(db, 'auditLogs', generatedLogId);
        const auditData: AuditLog = {
          customerId:  customer.id,
          action:      'Purchase',
          description: `Purchased "${descName}" — ${effectivePrice.toFixed(3)} ${currency} via ${paymentSummary}${discountAmt > 0 ? ` (Original: ${selectedItem.price.toFixed(3)} ${currency})` : ''}`,
          timestamp:   now,
          staffName,
          staffId,
          branch,
        };
        batch.set(logRef, auditData);

        // ── Operation 4: Customer Package Record ──────────────────────────
        if (type !== 'cafe') {
          if (selectedItem.name && selectedItem.name.includes('باقة حياة')) {
            const subPackages = expandHayatPackage(
              customer.id,
              selectedItem.id,
              type,
              now,
              calculatedStartDate,
              isQatar,
              generatedPackageId
            );

            subPackages.forEach((pkg) => {
              const packageRef = doc(db, 'customerPackages', pkg.id);
              // Omit id from the document data itself
              const { id, ...pkgData } = pkg;
              batch.set(packageRef, pkgData);
            });
          } else {
            const packageRef = doc(db, 'customerPackages', generatedPackageId);
            batch.set(packageRef, {
              customerId:         customer.id,
              packageId:          selectedItem.id,
              packageName:        selectedItem.name,
              category:           type,
              totalSessions:      selectedItem.sessions,
              remainingSessions:  selectedItem.sessions,
              purchasedAt:        now,
              isActive:           true,
              startDate:          calculatedStartDate,
              endDate:            calculatedEndDate,
            } as CustomerPackage);
          }
        }

        // ── Operation 5 (optional): Couple Promo — Second Customer ────────
        if (selectedItem.isCouple && coupleSecondCustomer) {
          const partnerPkgRef = doc(db, 'customerPackages', generatedPartnerPkgId);
          batch.set(partnerPkgRef, {
            customerId:         coupleSecondCustomer.id,
            packageId:          selectedItem.id,
            packageName:        `Partner: ${selectedItem.name}`,
            category:           'gym',
            totalSessions:      1,
            remainingSessions:  1,
            purchasedAt:        now,
            isActive:           true,
            startDate:          calculatedStartDate,
            endDate:            calculatedEndDate,
          } as CustomerPackage);

          const partnerLogRef = doc(db, 'auditLogs', generatedPartnerLogId);
          batch.set(partnerLogRef, {
            customerId:  coupleSecondCustomer.id,
            action:      'Bonus Provision',
            description: `Gym access granted via Couple Promo — primary customer: ${customer.name}`,
            timestamp:   now,
            staffName,
            staffId,
            branch,
          } as AuditLog);
        }

        // ── Operation 6 (optional): Triple Promo — Third Customer ─────────
        if (selectedItem.isTriple && tripleThirdCustomer) {
          const thirdPkgRef = doc(db, 'customerPackages', generatedThirdPkgId);
          batch.set(thirdPkgRef, {
            customerId:         tripleThirdCustomer.id,
            packageId:          selectedItem.id,
            packageName:        `Partner (3rd): ${selectedItem.name}`,
            category:           'gym',
            totalSessions:      1,
            remainingSessions:  1,
            purchasedAt:        now,
            isActive:           true,
            startDate:          calculatedStartDate,
            endDate:            calculatedEndDate,
          } as CustomerPackage);

          const thirdLogRef = doc(db, 'auditLogs', generatedThirdLogId);
          batch.set(thirdLogRef, {
            customerId:  tripleThirdCustomer.id,
            action:      'Bonus Provision',
            description: `Gym access granted via Triple Promo — primary customer: ${customer.name}`,
            timestamp:   now,
            staffName,
            staffId,
            branch,
          } as AuditLog);
        }

        // ── Commit — all-or-nothing ────────────────────────────────────────
        // Only after this resolves do we consider the transaction successful.
        // If commit() throws, none of the writes above were applied to Firestore.
        await batch.commit();

        // ── Post-commit: Wallet Updates (fire-and-forget) ─────────────────
        // These are non-critical side-effects.  A failure here does NOT
        // roll back the committed Firestore data — it merely means the Apple
        // Wallet card will refresh on its next scheduled poll instead of
        // immediately.  We do not block the SUCCESS screen on this.
        triggerWalletUpdate(customer.id).catch(() => {});
        if (selectedItem.isCouple && coupleSecondCustomer) {
          triggerWalletUpdate(coupleSecondCustomer.id).catch(() => {});
        }
        if (selectedItem.isTriple && tripleThirdCustomer) {
          triggerWalletUpdate(tripleThirdCustomer.id).catch(() => {});
        }

        // ── Show success ONLY after confirmed commit ───────────────────────
        setStep('SUCCESS');
        showToast(
          language === 'ar'
            ? `تم شراء "${selectedItem.name}" بنجاح ✓`
            : `"${selectedItem.name}" confirmed ✓`,
          'success'
        );
        setTimeout(() => onSuccess(), 2000);

      } catch (err: any) {
        // ── Batch failed — fall back to offline queue ─────────────────────
        // The batch commit failed (network error, permission-denied, etc.).
        // We queue the action locally so it can be replayed when online.
        // Crucially, we do NOT show the SUCCESS step — we show QUEUED instead
        // so the staff member knows the sale needs to sync.
        console.warn('[POS] Batch commit failed, queuing offline:', err?.message || err);

        offlineSyncService.queueAction('pos_purchase', {
          customer,
          selectedItem,
          coupleSecondCustomer,
          tripleThirdCustomer,
          splitPayments,
          type,
          staffName,
          staffId,
          branch,
          timestamp: now,
          startDate: calculatedStartDate,
          endDate:   calculatedEndDate,
          // Pass pre-generated IDs for idempotent replay
          generatedInvoiceIds: [generatedInvoiceId],
          generatedPackageId,
          generatedLogId,
          generatedPartnerPackageId: generatedPartnerPkgId,
          generatedPartnerLogId: generatedPartnerLogId,
        });

        setStep('QUEUED' as any);
        showToast(
          language === 'ar'
            ? 'تم حفظ المعاملة محلياً وستُرسل تلقائياً عند الاتصال'
            : 'Saved offline — will sync automatically when reconnected',
          'error'
        );
        setTimeout(() => onSuccess(), 3000);
      }
    } else {
      // ── Offline / Firebase not configured ─────────────────────────────
      offlineSyncService.queueAction('pos_purchase', {
        customer,
        selectedItem,
        coupleSecondCustomer,
        tripleThirdCustomer,
        splitPayments,
        type,
        staffName,
        staffId,
        branch,
        timestamp: now,
        startDate: calculatedStartDate,
        endDate:   calculatedEndDate,
        // Pass pre-generated IDs for idempotent replay
        generatedInvoiceIds: [generatedInvoiceId],
        generatedPackageId,
        generatedLogId,
        generatedPartnerPackageId: generatedPartnerPkgId,
        generatedPartnerLogId: generatedPartnerLogId,
      });

      setStep('QUEUED' as any);
      showToast(
        language === 'ar'
          ? 'وضع عدم الاتصال: تم حفظ المعاملة وستُرسل لاحقاً'
          : 'Offline mode: transaction queued for sync',
        'error'
      );
      setTimeout(() => onSuccess(), 3000);
    }

    setIsProcessing(false);
    processingLockRef.current = false;
  };


  const effectivePrice = isEmployeeDiscount ? (selectedItem ? selectedItem.price * 0.70 : 0) : (selectedItem ? selectedItem.price : 0);
  const totalPaid = splitPayments.reduce((sum, p) => sum + p.amount, 0);
  const remainingBalance = selectedItem ? Math.max(0, effectivePrice - totalPaid) : 0;

  // ── Step progress configuration ────────────────────────────────────────────
  // Maps each internal step key to a visible label and ordinal index.
  // Couple/triple promo is treated as part of step 2 when it applies.
  // SUCCESS and QUEUED are terminal — the bar is hidden on those steps.
  const STEP_CONFIG = [
    {
      key:  'SELECT_ITEM',
      num:  1,
      en:   'Service',
      ar:   'الخدمة',
    },
    {
      key:  type === 'gym' ? 'SELECT_ITEM' : 'CUSTOMIZE_ITEM',
      num:  2,
      en:   type === 'gym' ? 'Details' : 'Customize',
      ar:   type === 'gym' ? 'التفاصيل' : 'تخصيص',
    },
    {
      key:  'COUPLE_PROMO_SEARCH',
      num:  type === 'gym' && selectedItem?.isCouple ? 3 : -1, // hidden for non-couple
      en:   'Partners',
      ar:   'المشتركون',
    },
    {
      key:  'SELECT_PAYMENT',
      num:  selectedItem?.isCouple ? 4 : 3,
      en:   'Payment',
      ar:   'الدفع',
    },
  ] as const;

  // Derive the current ordinal (1-based) for the progress bar
  const visibleSteps = type === 'gym' && selectedItem?.isCouple
    ? ['SELECT_ITEM', 'COUPLE_PROMO_SEARCH', 'SELECT_PAYMENT']
    : type === 'gym'
    ? ['SELECT_ITEM', 'SELECT_PAYMENT']
    : ['SELECT_ITEM', 'CUSTOMIZE_ITEM', 'SELECT_PAYMENT'];

  const currentStepIdx = visibleSteps.indexOf(step as string);
  const isTerminalStep  = step === 'SUCCESS' || step === 'QUEUED';

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

        {/* ── Header ── */}
        <div className="px-6 pt-4 pb-3 border-b border-olive-light bg-olive-soft/40">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-serif font-bold text-lg text-olive-dark text-start">{t('pos.checkout_title')}</h3>
              <p className="text-[10px] uppercase tracking-wider font-bold text-brand-olive mt-0.5 text-start">
                {t('pos.client_label')} {customer.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-olive-dark transition-colors px-2 py-1 text-xs uppercase font-bold"
            >
              {t('common.cancel')}
            </button>
          </div>

          {/* ── Step Progress Bar ── */}
          {/* Hidden on terminal steps (SUCCESS / QUEUED) */}
          {!isTerminalStep && visibleSteps.length > 1 && (
            <div className="flex items-center gap-1 mt-3">
              {visibleSteps.map((s, idx) => {
                const isActive    = s === step;
                const isCompleted = currentStepIdx > idx;
                const labels: Record<string, { en: string; ar: string }> = {
                  SELECT_ITEM:         { en: 'Service',   ar: 'الخدمة' },
                  CUSTOMIZE_ITEM:      { en: 'Customize', ar: 'تخصيص' },
                  COUPLE_PROMO_SEARCH: { en: 'Partners',  ar: 'الشركاء' },
                  SELECT_PAYMENT:      { en: 'Payment',   ar: 'الدفع' },
                };
                const label = labels[s] ?? { en: s, ar: s };
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      {/* Numbered circle */}
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-extrabold transition-all duration-300 ${
                          isCompleted
                            ? 'bg-brand-olive text-white'
                            : isActive
                            ? 'bg-olive-dark text-white ring-2 ring-brand-olive ring-offset-1'
                            : 'bg-gray-100 text-gray-400'
                        }`}
                      >
                        {isCompleted ? '✓' : idx + 1}
                      </div>
                      {/* Step label */}
                      <span
                        className={`text-[8px] font-bold uppercase tracking-wide transition-colors duration-300 ${
                          isActive ? 'text-olive-dark' : isCompleted ? 'text-brand-olive' : 'text-gray-300'
                        }`}
                      >
                        {language === 'ar' ? label.ar : label.en}
                      </span>
                    </div>
                    {/* Connector line between steps */}
                    {idx < visibleSteps.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mb-3 rounded-full transition-all duration-300 ${
                          currentStepIdx > idx ? 'bg-brand-olive' : 'bg-gray-100'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto">
          
          {step === 'SELECT_ITEM' && (
            <div className="animate-fade-in text-start">
              <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-3 text-start">
                {t('pos.select_pack_label')}
              </h4>
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectItem(item)}
                    className="p-4 border border-olive-light rounded-xl hover:border-brand-olive hover:bg-olive-soft/20 transition-all text-start group cursor-pointer"
                  >
                    <div className="flex justify-between items-start">
                      <div className="text-start">
                        <span className="font-serif font-bold text-olive-dark group-hover:text-brand-olive transition-colors text-start block">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2 mt-1.5 justify-start">
                          {(item as any).isCouple && (
                            <span className="text-[9px] uppercase tracking-wider text-rose-600 font-bold bg-rose-50 px-1.5 py-0.5 rounded">
                              {language === 'ar' ? 'يتطلب عملاء ثنائي (Couple)' : 'Requires 2 Clients'}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 font-medium font-sans">
                            {item.sessions} {language === 'ar' ? 'جلسة' : `Session${item.sessions > 1 ? 's' : ''}`}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-olive-dark text-end shrink-0 select-all">
                        {item.price.toFixed(3)} {t('common.currency')}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'CUSTOMIZE_ITEM' && selectedItem && (
            <div className="animate-fade-in flex flex-col gap-5 text-start">
              <div className="text-start">
                <h4 className="font-serif text-lg font-bold text-olive-dark mb-1">{selectedItem.name}</h4>
                <p className="text-xs text-gray-500 font-sans">
                  {language === 'ar' ? 'تخصيص تفاصيل الباقة قبل الدفع' : 'Customize package details before payment'}
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">
                    {language === 'ar' ? 'عدد الجلسات' : 'Number of Sessions'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={selectedItem.sessions}
                    onChange={(e) => setSelectedItem({ ...selectedItem, sessions: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-olive transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block">
                    {language === 'ar' ? `السعر الإجمالي (${currency})` : `Total Price (${currency})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={selectedItem.price}
                    onChange={(e) => setSelectedItem({ ...selectedItem, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-olive transition-all font-mono"
                  />
                </div>
              </div>

              <button
                onClick={() => {
                  const originalPackage = items.find((p: any) => p.id === selectedItem.id);
                  if (originalPackage) {
                    const priceChanged = originalPackage.price !== selectedItem.price;
                    const sessionsChanged = originalPackage.sessions !== selectedItem.sessions;
                    
                    if (priceChanged || sessionsChanged) {
                      setOverrideWarningData({
                        sessionsChanged,
                        priceChanged,
                        originalSessions: originalPackage.sessions,
                        originalPrice: originalPackage.price
                      });
                      setShowOverrideWarning(true);
                      return;
                    }
                  }

                  if (selectedItem.isCouple) {
                    setStep('COUPLE_PROMO_SEARCH');
                  } else {
                    setStep('SELECT_PAYMENT');
                  }
                }}
                className="w-full mt-2 py-3.5 bg-brand-olive hover:bg-brand-olive-hover text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-colors cursor-pointer shadow-md"
              >
                {language === 'ar' ? 'متابعة للدفع' : 'Continue to Payment'}
              </button>
            </div>
          )}

          {step === 'COUPLE_PROMO_SEARCH' && (
            <div className="animate-fade-in flex flex-col gap-5 text-start">
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex items-start gap-3">
                <Info className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="text-start">
                  <h4 className="font-bold text-rose-700 text-sm text-start">
                    {language === 'ar' ? 'تعيين باقة المشتركين المتعددين' : 'Couple Promo Assignment'}
                  </h4>
                  <p className="text-xs text-rose-600 mt-1 leading-relaxed text-start">
                    {language === 'ar' 
                      ? `يرجى تحديد العميل الثاني للمشاركة في الباقة الفعالة. سيتم فوترة الإجمالي المستحق فقط على حساب العميل ${customer.name}.`
                      : `Identify the second customer for this membership. Only the promotional price will be billed to ${customer.name}.`}
                  </p>
                </div>
              </div>

              {!coupleSecondCustomer ? (
                <>
                  <div className="text-start">
                    <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block text-start">
                      {language === 'ar' ? 'البحث عن مستفيد في قاعدة البيانات' : 'Search Existing Database'}
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder={language === 'ar' ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search name or phone...'} 
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        className="flex-1 p-2.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-start bg-white text-olive-dark"
                      />
                      <button 
                        onClick={handleSearchCustomer}
                        disabled={isSearching}
                        className="px-4 bg-olive-light text-brand-olive hover:bg-brand-olive hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="flex flex-col gap-2 max-h-32 overflow-y-auto border border-olive-light rounded-lg p-2 text-start">
                      {searchResults.map(res => (
                        <button 
                          key={res.id}
                          onClick={() => setCoupleSecondCustomer(res)}
                          className="flex items-center justify-between p-2 hover:bg-olive-soft rounded text-start"
                        >
                          <div className="text-start">
                            <span className="text-xs font-bold text-olive-dark block text-start">{res.name}</span>
                            <span className="text-[10px] text-gray-500 font-mono text-start block">{res.phone}</span>
                          </div>
                          <UserPlus className="w-4 h-4 text-brand-olive" />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <div className="h-px bg-gray-100 flex-1" />
                    <span className="text-[10px] uppercase font-bold text-gray-300">
                      {language === 'ar' ? 'أو سجل مستفيداً جديداً' : 'OR REGISTER NEW'}
                    </span>
                    <div className="h-px bg-gray-100 flex-1" />
                  </div>

                  <div className="border border-olive-light p-4 rounded-xl text-start">
                    <input 
                      type="text" 
                      placeholder={language === 'ar' ? 'الاسم الكامل للعميل الثاني' : 'Full Name'} 
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full text-xs p-2 mb-2 border border-gray-200 rounded outline-none text-start bg-white text-olive-dark"
                    />
                    <div className="flex w-full mb-3">
                      <select
                        value={newCustomerCountryCode}
                        onChange={(e) => setNewCustomerCountryCode(e.target.value)}
                        className="text-xs p-2 border border-r-0 border-gray-200 rounded-l outline-none bg-gray-50 text-gray-700 w-[70px]"
                      >
                        <option value="+973">🇧🇭 +973</option>
                        <option value="+966">🇸🇦 +966</option>
                        <option value="+974">🇶🇦 +974</option>
                      </select>
                      <input 
                        type="tel" 
                        placeholder={language === 'ar' ? 'رقم الهاتف' : 'Phone Number'} 
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        className="grow text-xs p-2 border border-gray-200 rounded-r outline-none font-mono text-start bg-white text-olive-dark"
                      />
                    </div>
                    <button 
                      onClick={handleCreateInlineCustomer}
                      disabled={isCreatingCustomer || !newCustomerName || !newCustomerPhone}
                      className="w-full bg-olive-dark text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-lg hover:bg-olive-dark-hover disabled:bg-gray-300 transition-colors pointer cursor-pointer font-sans"
                    >
                      {isCreatingCustomer 
                        ? (language === 'ar' ? 'جاري التسجيل...' : 'Registering...') 
                        : (language === 'ar' ? 'تسجيل المستفيد الثاني وتثبيته' : 'Register Partner & Secure')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="bg-olive-soft border border-brand-olive p-4 rounded-xl flex items-center justify-between text-start">
                  <div className="text-start">
                    <span className="text-[10px] uppercase font-bold text-brand-olive block text-start">
                      {language === 'ar' ? 'تم اختيار المستفيد الثاني:' : 'Second Beneficiary Selected:'}
                    </span>
                    <h4 className="font-serif text-lg font-bold text-olive-dark text-start">{coupleSecondCustomer.name}</h4>
                  </div>
                  <CheckCircle className="w-6 h-6 text-brand-olive shrink-0" />
                </div>
              )}

              {selectedItem?.isTriple && coupleSecondCustomer && !tripleThirdCustomer && (
                <div className="mt-4 pt-4 border-t border-olive-light">
                   <div className="text-start">
                    <label className="text-[10px] uppercase font-bold text-gray-400 mb-1.5 block text-start">
                      {language === 'ar' ? 'البحث عن المستفيد الثالث في قاعدة البيانات' : 'Search Third Beneficiary'}
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder={language === 'ar' ? 'ابحث بالاسم أو رقم الهاتف...' : 'Search name or phone...'} 
                        value={customerSearchQuery}
                        onChange={(e) => setCustomerSearchQuery(e.target.value)}
                        className="flex-1 p-2.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-start bg-white text-olive-dark"
                      />
                      <button 
                        onClick={handleSearchCustomer}
                        disabled={isSearching}
                        className="px-4 bg-olive-light text-brand-olive hover:bg-brand-olive hover:text-white rounded-lg transition-colors cursor-pointer"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {searchResults.length > 0 && (
                    <div className="flex flex-col gap-2 max-h-32 overflow-y-auto border border-olive-light rounded-lg p-2 text-start mt-2">
                      {searchResults.map(res => (
                        <button 
                          key={res.id}
                          onClick={() => { setTripleThirdCustomer(res); setSearchResults([]); setCustomerSearchQuery(''); }}
                          className="flex items-center justify-between p-2 hover:bg-olive-soft rounded text-start"
                        >
                          <div className="text-start">
                            <span className="text-xs font-bold text-olive-dark block text-start">{res.name}</span>
                            <span className="text-[10px] text-gray-500 font-mono text-start block">{res.phone}</span>
                          </div>
                          <UserPlus className="w-4 h-4 text-brand-olive" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {selectedItem?.isTriple && tripleThirdCustomer && (
                 <div className="mt-4 bg-olive-soft border border-brand-olive p-4 rounded-xl flex items-center justify-between text-start">
                  <div className="text-start">
                    <span className="text-[10px] uppercase font-bold text-brand-olive block text-start">
                      {language === 'ar' ? 'تم اختيار المستفيد الثالث:' : 'Third Beneficiary Selected:'}
                    </span>
                    <h4 className="font-serif text-lg font-bold text-olive-dark text-start">{tripleThirdCustomer.name}</h4>
                  </div>
                  <CheckCircle className="w-6 h-6 text-brand-olive shrink-0" />
                </div>
              )}


              <button 
                disabled={!coupleSecondCustomer || (selectedItem?.isTriple && !tripleThirdCustomer)}
                onClick={() => setStep('SELECT_PAYMENT')}
                className="w-full mt-4 bg-brand-olive hover:bg-brand-olive-hover disabled:bg-gray-300 text-white font-bold uppercase text-xs tracking-wider py-3 rounded-lg flex items-center justify-center gap-2 transition-colors cursor-pointer font-sans"
              >
                <span>{language === 'ar' ? 'المتابعة لخيارات الدفع والفوترة' : 'Proceed to Payment'}</span>
                {language === 'ar' ? null : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          )}

          {step === 'SELECT_PAYMENT' && (
            <div className="flex flex-col gap-6 animate-slide-up text-start">
              
              <div className="bg-olive-soft p-5 rounded-xl text-center relative flex flex-col items-center">
                <span className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                  {language === 'ar' ? `الفاتورة الإجمالية لـ ${selectedItem.name}` : `Total Invoice for ${selectedItem.name}`}
                </span>
                <div className="font-serif font-extrabold text-olive-dark mt-1">
                  {isEmployeeDiscount ? (
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-400 line-through font-mono">{selectedItem.price.toFixed(3)} {t('common.currency')}</span>
                      <span className="text-3xl text-emerald-700 font-extrabold font-serif">{(selectedItem.price * 0.70).toFixed(3)} {t('common.currency')}</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full mt-1">
                        {language === 'ar' ? 'تم تطبيق خصم الموظفين (30%)' : '30% Staff Discount Applied'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-3xl">{selectedItem.price.toFixed(3)} {t('common.currency')}</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsEmployeeDiscount(!isEmployeeDiscount);
                    setSplitPayments([]);
                    setCurrentSplitMethod('');
                  }}
                  className={`mt-3 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                    isEmployeeDiscount 
                      ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' 
                      : 'bg-white text-gray-700 border-gray-300 hover:border-brand-olive'
                  }`}
                >
                  {isEmployeeDiscount 
                    ? (language === 'ar' ? '✓ خصم موظفين 30% مفعّل' : '✓ 30% Staff Discount Active') 
                    : (language === 'ar' ? '🏷️ إضافة خصم موظفين (30%)' : '🏷️ Apply 30% Staff Discount')}
                </button>
              </div>

              {type === 'gym' && (
                <div className={`p-4 rounded-xl flex flex-col gap-3 text-start border transition-colors duration-200 ${
                  !endDate
                    ? 'bg-red-50/60 border-red-200'
                    : 'bg-amber-50/50 border-amber-100'
                }`}>
                  <div className="flex items-center gap-2">
                    <Calendar className={`w-4 h-4 shrink-0 ${!endDate ? 'text-red-500' : 'text-amber-600'}`} />
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${
                      !endDate ? 'text-red-700' : 'text-amber-800'
                    }`}>
                      {language === 'ar' ? 'صلاحية ومدة عضوية الجيم' : 'Gym Membership Validity'}
                    </span>
                    {/* Auto-calculated badge */}
                    {endDate && (
                      <span className="ml-auto text-[8px] uppercase font-bold bg-brand-olive/10 text-brand-olive px-1.5 py-0.5 rounded tracking-wider">
                        {language === 'ar' ? 'محسوب تلقائياً' : 'Auto-calculated'}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Start Date */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase font-bold text-gray-400 block">
                        {language === 'ar' ? 'تاريخ البداية' : 'Start Date'}
                        <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="p-2 border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-olive bg-white text-olive-dark font-mono text-center"
                      />
                    </div>

                    {/* End Date — auto-filled, still editable */}
                    <div className="flex flex-col gap-1">
                      <label className={`text-[10px] uppercase font-bold block ${
                        !endDate ? 'text-red-500' : 'text-gray-400'
                      }`}>
                        {language === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}
                        <span className="text-red-400 ml-0.5">*</span>
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate} // prevent end before start
                        className={`p-2 rounded-lg text-xs font-mono font-bold text-center outline-none transition-all ${
                          !endDate
                            ? 'border-2 border-red-400 bg-red-50 text-red-700 animate-pulse'
                            : 'border border-brand-olive bg-olive-soft/40 text-olive-dark focus:bg-white'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Inline validation warning — only shown when endDate is blank */}
                  {!endDate && (
                    <div className="flex items-start gap-2 bg-red-100 border border-red-200 rounded-lg p-2.5">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-700 font-semibold leading-relaxed">
                        {language === 'ar'
                          ? 'تاريخ الانتهاء مطلوب. يُحسب تلقائياً بناءً على نوع الباقة — تحقق منه قبل المتابعة.'
                          : 'End date is required. It is auto-calculated from the package duration — verify it before proceeding.'}
                      </p>
                    </div>
                  )}

                  {/* Duration hint */}
                  {endDate && (
                    <p className="text-[10px] text-gray-400 leading-relaxed font-sans">
                      {language === 'ar'
                        ? `✓ مدة ${parseDurationInMonths(selectedItem?.name ?? '')} شهر — من ${startDate} إلى ${endDate}`
                        : `✓ ${parseDurationInMonths(selectedItem?.name ?? '')} month duration — ${startDate} → ${endDate}`}
                    </p>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3 text-start">
                  <h4 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
                    {language === 'ar' ? 'سجل الدفع' : 'Payment Ledger'}
                  </h4>
                  {remainingBalance > 0 && (
                    <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded">
                      {language === 'ar' ? 'المتبقي:' : 'Remaining:'} {remainingBalance.toFixed(3)} {t('common.currency')}
                    </span>
                  )}
                </div>

                {splitPayments.length > 0 && (
                  <div className="mb-4 flex flex-col gap-2">
                    {splitPayments.map((p, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-olive-50 p-2.5 rounded-lg border border-olive-100">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-xs font-bold text-olive-dark">
                            {p.method === 'Card' ? (language === 'ar' ? t('pos.pay_card') : 'Card') :
                             p.method === 'BenefitPay' ? (language === 'ar' ? (isQatar ? 'فورا' : t('pos.pay_benefit')) : (isQatar ? 'Fawra' : 'BenefitPay')) :
                             p.method === 'Cash' ? (language === 'ar' ? t('pos.pay_cash') : 'Cash') :
                             p.method === 'Store Credit' ? (language === 'ar' ? 'رصيد المحفظة' : 'Store Credit') :
                             (language === 'ar' ? t('pos.pay_previous') : 'Paid Previously')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-mono font-bold text-olive-dark">{p.amount.toFixed(3)} {currency}</span>
                          <button 
                            onClick={() => {
                              const newSplits = [...splitPayments];
                              newSplits.splice(idx, 1);
                              setSplitPayments(newSplits);
                              setCurrentSplitMethod('');
                            }}
                            className="text-red-400 hover:text-red-600 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {remainingBalance > 0 && (
                  <>
                    {!currentSplitMethod ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {(['Card', 'BenefitPay', 'Cash', 'Paid Previously', 'Store Credit'] as PaymentMethod[]).map(method => (
                          <button
                            key={method}
                            onClick={() => {
                              setCurrentSplitMethod(method);
                              setCurrentSplitAmount(remainingBalance.toFixed(3));
                            }}
                            className="p-3 border border-gray-200 rounded-lg text-xs font-bold uppercase tracking-wider text-center text-gray-500 hover:border-brand-olive hover:text-brand-olive transition-all cursor-pointer font-sans leading-relaxed min-h-[50px] flex items-center justify-center"
                          >
                            {method === 'Card' ? (language === 'ar' ? t('pos.pay_card') : 'Card') :
                             method === 'BenefitPay' ? (language === 'ar' ? (isQatar ? 'فورا' : t('pos.pay_benefit')) : (isQatar ? 'Fawra' : 'BenefitPay')) :
                             method === 'Cash' ? (language === 'ar' ? t('pos.pay_cash') : 'Cash') :
                             method === 'Store Credit' ? (language === 'ar' ? 'رصيد المحفظة' : 'Store Credit') :
                             (language === 'ar' ? t('pos.pay_previous') : 'Paid Previously')}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="bg-olive-soft border border-brand-olive p-4 rounded-xl flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-brand-olive">
                            {language === 'ar' ? 'تأكيد المبلغ لـ' : 'Confirm Amount for'} {
                              currentSplitMethod === 'Card' ? (language === 'ar' ? t('pos.pay_card') : 'Card') :
                              currentSplitMethod === 'BenefitPay' ? (language === 'ar' ? (isQatar ? 'فورا' : t('pos.pay_benefit')) : (isQatar ? 'Fawra' : 'BenefitPay')) :
                              currentSplitMethod === 'Cash' ? (language === 'ar' ? t('pos.pay_cash') : 'Cash') :
                              currentSplitMethod === 'Store Credit' ? (language === 'ar' ? 'رصيد المحفظة' : 'Store Credit') :
                              (language === 'ar' ? t('pos.pay_previous') : 'Paid Previously')
                            }
                          </span>
                          <button onClick={() => setCurrentSplitMethod('')} className="text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4 cursor-pointer" />
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          value={currentSplitAmount}
                          onChange={(e) => setCurrentSplitAmount(e.target.value)}
                          className="w-full p-3 border border-gray-200 rounded-lg text-lg font-mono font-bold text-center outline-none focus:border-brand-olive bg-white text-olive-dark"
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            const amt = parseFloat(currentSplitAmount);
                            // Due to float precision, we can round to 3 decimals to avoid missing out on e.g. 0.0000001
                            if (!isNaN(amt) && amt > 0 && amt <= Math.round(remainingBalance * 1000) / 1000) {
                              setSplitPayments([...splitPayments, { method: currentSplitMethod, amount: amt }]);
                              setCurrentSplitMethod('');
                              setCurrentSplitAmount('');
                            } else {
                              showToast(language === 'ar' ? 'مبلغ غير صحيح' : 'Invalid Amount', 'error');
                            }
                          }}
                          className="w-full bg-brand-olive text-white py-2 rounded-lg font-bold text-xs uppercase tracking-wider hover:bg-brand-olive-hover cursor-pointer"
                        >
                          {language === 'ar' ? 'تأكيد الدفعة' : 'Confirm Payment'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
                {/* Gym end-date guard — shown above the button when endDate is missing */}
                {type === 'gym' && !endDate && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="text-[10px] text-red-600 font-semibold">
                      {language === 'ar'
                        ? 'أدخل تاريخ انتهاء العضوية قبل إتمام العملية'
                        : 'Set the membership end date before completing'}
                    </span>
                  </div>
                )}

                <button
                  onClick={handleConfirmPurchase}
                  disabled={
                    remainingBalance > 0 ||
                    splitPayments.length === 0 ||
                    isProcessing ||
                    (type === 'gym' && !endDate) // hard block when endDate missing
                  }
                  className="w-full h-12 bg-olive-dark hover:bg-olive-dark-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold uppercase text-xs tracking-wider rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md font-sans"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>{t('pos.button_complete')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === 'SUCCESS' && (
            <div className="flex flex-col items-center justify-center py-10 animate-fade-in text-center">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-500 mb-4">
                <CheckCircle className="w-10 h-10" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-olive-dark mb-2">
                {language === 'ar' ? 'تم تأكيد المعاملة بنجاح' : 'Transaction Confirmed'}
              </h3>
              <p className="text-xs text-gray-500 text-center max-w-[250px] leading-relaxed">
                {language === 'ar'
                  ? 'تم تسجيل المعاملة في السحابة ورصيد الجلسات ومستجدات تقارير الوردية.'
                  : 'Committed to Firestore — the customer profile, package balance, and shift report are all updated.'}
              </p>
            </div>
          )}

          {step === 'QUEUED' && (
            <div className="flex flex-col items-center justify-center py-10 animate-fade-in text-center">
              <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center text-amber-500 mb-4">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h3 className="font-serif text-2xl font-bold text-olive-dark mb-2">
                {language === 'ar' ? 'تم الحفظ محلياً' : 'Saved Offline'}
              </h3>
              <p className="text-xs text-gray-500 text-center max-w-[260px] leading-relaxed">
                {language === 'ar'
                  ? 'لا يوجد اتصال بالإنترنت. تم حفظ المعاملة على الجهاز وستُرسل تلقائياً عند عودة الاتصال.'
                  : 'No internet connection. The transaction is saved locally and will sync automatically when the connection is restored.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Override Warning Modal */}
      {showOverrideWarning && overrideWarningData && selectedItem && (
        <div className="fixed inset-0 bg-olive-dark/40 z-60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in border-2 border-rose-100 relative">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
              <AlertCircle className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-center text-rose-700 mb-2 font-serif">
              {language === 'ar' ? 'تأكيد التعديل اليدوي' : 'Confirm Manual Override'}
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6">
              {language === 'ar' 
                ? 'لقد قمت بتعديل تفاصيل الباقة الأساسية. يرجى مراجعة التغييرات:' 
                : 'You have modified the base package details. Please review changes:'}
            </p>

            <div className="bg-gray-50 rounded-xl p-4 mb-6 space-y-3 border border-gray-100">
              {overrideWarningData.sessionsChanged && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-medium">{language === 'ar' ? 'الجلسات' : 'Sessions'}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-gray-400 line-through">{overrideWarningData.originalSessions}</span>
                    <ArrowRight className="w-3 h-3 text-rose-500" />
                    <span className="font-bold text-rose-600">{selectedItem.sessions}</span>
                  </div>
                </div>
              )}
              {overrideWarningData.priceChanged && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 font-medium">{language === 'ar' ? 'السعر' : 'Price'}</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-gray-400 line-through">{overrideWarningData.originalPrice}</span>
                    <ArrowRight className="w-3 h-3 text-rose-500" />
                    <span className="font-bold text-rose-600">{selectedItem.price} {t('common.currency')}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowOverrideWarning(false)}
                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors text-sm"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  setShowOverrideWarning(false);
                  if (selectedItem.isCouple) {
                    setStep('COUPLE_PROMO_SEARCH');
                  } else {
                    setStep('SELECT_PAYMENT');
                  }
                }}
                className="flex-1 px-4 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors text-sm shadow-md"
              >
                {language === 'ar' ? 'متابعة وتأكيد' : 'Confirm & Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
