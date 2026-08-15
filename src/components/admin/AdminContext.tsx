import React, { createContext, useContext, useState, useEffect } from 'react';
import { Staff, Package, Invoice, Customer, CustomerPackage, CafeCategory, CafeMenuItem, PaymentMethod } from '../../types';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType, ensureFirebaseAuth } from '../../firebase';
import { collection, getDocs, updateDoc, deleteDoc, doc, setDoc, onSnapshot, writeBatch, increment } from 'firebase/firestore';
import { useLanguage } from '../../LanguageContext';
import { triggerWalletUpdate } from '../../utils/wallet';

type AdminActionType =
  | 'soft-delete-invoice'
  | 'soft-delete-customer'
  | 'restore-invoice'
  | 'restore-customer'
  | 'permanent-delete-invoice'
  | 'permanent-delete-customer'
  | 'restore-multiple-customers'
  | 'permanent-delete-multiple-customers'
  | 'restore-multiple-invoices'
  | 'permanent-delete-multiple-invoices'
  | 'empty-all-recycle-bin'
  | 'custom-confirm';

interface AdminConfirmModal {
  isOpen: boolean;
  actionType: AdminActionType;
  targetId: string;
  targetName: string;
  confirmationPromptText?: string;
  confirmationInputPlaceholder?: string;
  confirmationInputValue?: string;
  confirmationOptions?: Array<{ label: string; value: string }>;
  onConfirm?: (inputValue?: string) => Promise<void> | void;
}

export interface AdminContextType {
  // Global States
  staffList: Staff[];
  packagesList: Package[];
  gymList: Package[];
  invoicesList: Invoice[];
  customersList: Customer[];
  customerPackagesList: CustomerPackage[];
  cafeCategories: CafeCategory[];
  cafeMenuItems: CafeMenuItem[];
  dbSynced: boolean;
  actionLoading: boolean;
  toast: { message: string; type: 'success' | 'ref' | 'error' } | null;
  
  // Shared Utilities
  triggerToast: (message: string, type?: 'success' | 'ref' | 'error') => void;
  loadAllData: () => Promise<void>;
  
  // Modals & Overlays
  adminConfirmModal: AdminConfirmModal;
  setAdminConfirmModal: React.Dispatch<React.SetStateAction<AdminConfirmModal>>;
  viewEODStaffName: string | null;
  setViewEODStaffName: React.Dispatch<React.SetStateAction<string | null>>;
  viewEODStaffId: string | null;
  setViewEODStaffId: React.Dispatch<React.SetStateAction<string | null>>;
  
  // Actions
  handleExecuteAdminAction: () => Promise<void>;
  handleWipeCustomerData: () => Promise<void>;
  
  // Company state needed globally
  editCompanyNameInput: string;
  setEditCompanyNameInput: React.Dispatch<React.SetStateAction<string>>;
  editPublicAppUrlInput: string;
  setEditPublicAppUrlInput: React.Dispatch<React.SetStateAction<string>>;
  availableBranches: string[];
  onBranchesUpdate: (b: string[]) => void;
  onCompanyNameUpdate: (n: string) => void;
  
  // Recycle bin state
  selectedRecycleCustomers: string[];
  setSelectedRecycleCustomers: React.Dispatch<React.SetStateAction<string[]>>;
  selectedRecycleInvoices: string[];
  setSelectedRecycleInvoices: React.Dispatch<React.SetStateAction<string[]>>;
  
  // Missing exposed setters & state
  setActionLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setStaffList: React.Dispatch<React.SetStateAction<Staff[]>>;
  setInvoicesList: React.Dispatch<React.SetStateAction<Invoice[]>>;
  companyName: string;
  getCustomerName: (id: string) => string;
  getInvoiceCustomerName: (inv: Invoice) => string;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export function useAdminContext() {
  const context = useContext(AdminContext);
  if (!context) throw new Error("useAdminContext must be used within an AdminProvider");
  return context;
}

// Constants from original
// Hardcoded initial list of salon packages to seed as database baseline
const INITIAL_SALON_PACKAGES = [
  { name: 'Therapeutic Henna without wash', price: 20.000, sessions: 1 },
  { name: 'Therapeutic Henna with wash', price: 25.000, sessions: 1 },
  { name: 'Red Mashat without wash', price: 20.000, sessions: 1 },
  { name: 'Red Mashat with wash', price: 25.000, sessions: 1 },
  { name: 'Sidr with wash', price: 20.000, sessions: 1 },
  { name: 'Oil Massage without wash', price: 15.000, sessions: 1 },
  { name: 'Oil Massage with wash', price: 18.000, sessions: 1 },
  { name: 'Green Mashat with wash', price: 30.000, sessions: 1 }
];

// Hardcoded initial list of gym memberships to seed as database baseline
const INITIAL_GYM_MEMBERSHIPS = [
  { name: '1-Day Pass', price: 5.500, sessions: 1 },
  { name: '1 Month', price: 45.000, sessions: 1 },
  { name: '3 Months', price: 120.000, sessions: 3 },
  { name: '6 Months', price: 210.000, sessions: 6 }
];

export function AdminProvider({ children, availableBranches, onBranchesUpdate, companyName, onCompanyNameUpdate }: { children: React.ReactNode, availableBranches: string[], onBranchesUpdate: (b: string[])=>void, companyName: string, onCompanyNameUpdate: (n: string)=>void }) {
  const { language, t } = useLanguage();

  const [adminConfirmModal, setAdminConfirmModal] = useState<AdminConfirmModal>({ isOpen: false, actionType: 'soft-delete-invoice', targetId: '', targetName: '' });
  const [viewEODStaffName, setViewEODStaffName] = useState<string | null>(null);
  const [viewEODStaffId, setViewEODStaffId] = useState<string | null>(null);

  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [packagesList, setPackagesList] = useState<Package[]>([]);
  const [gymList, setGymList] = useState<Package[]>([]);
  const [invoicesList, setInvoicesList] = useState<Invoice[]>([]);
  const [customersList, setCustomersList] = useState<Customer[]>([]);
  const [customerPackagesList, setCustomerPackagesList] = useState<CustomerPackage[]>([]);
  const [cafeCategories, setCafeCategories] = useState<CafeCategory[]>([]);
  const [cafeMenuItems, setCafeMenuItems] = useState<CafeMenuItem[]>([]);
  const [dbSynced, setDbSynced] = useState(isFirebaseConfigured);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'ref' | 'error' } | null>(null);

  const [editCompanyNameInput, setEditCompanyNameInput] = useState(companyName);
  const [editPublicAppUrlInput, setEditPublicAppUrlInput] = useState('');

  const [selectedRecycleCustomers, setSelectedRecycleCustomers] = useState<string[]>([]);
  const [selectedRecycleInvoices, setSelectedRecycleInvoices] = useState<string[]>([]);

  const getCustomerName = (id: string) => {
    const cust = customersList.find(c => c.id === id);
    return cust ? cust.name : id;
  };

  const getInvoiceCustomerName = (inv: Invoice) => {
    if (inv.customerName) return inv.customerName;
    if (inv.primaryCustomerId) return getCustomerName(inv.primaryCustomerId);
    return language === 'ar' ? 'عميل غير معروف' : 'Unknown Customer';
  };

  const triggerToast = (message: string, type: 'success' | 'ref' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    let unsubscribePackages: () => void = () => {};

    if (isFirebaseConfigured && db) {
      const seedAndSubscribe = async () => {
        try {
          const pkgSnap = await getDocs(collection(db, 'packages'));
          if (pkgSnap.empty) {
            triggerToast('Seeding initial brand services...', 'ref');
            
            // Seed Salon Packages
            for (const sp of INITIAL_SALON_PACKAGES) {
              const docRef = doc(collection(db, 'packages'));
              await setDoc(docRef, {
                name: sp.name,
                price: sp.price,
                sessions: sp.sessions,
                category: 'salon',
                createdAt: new Date().toISOString()
              });
            }

            // Seed Gym Memberships
            for (const gm of INITIAL_GYM_MEMBERSHIPS) {
              const docRef = doc(collection(db, 'packages'));
              await setDoc(docRef, {
                name: gm.name,
                price: gm.price,
                sessions: gm.sessions,
                category: 'gym',
                createdAt: new Date().toISOString()
              });
            }
          }
        } catch (err) {
          console.error('[AdminConfig] Seeding failed:', err);
        }

        // Real-time live onSnapshot listener for dynamic updates
        unsubscribePackages = onSnapshot(collection(db, 'packages'), (snapshot) => {
          const firestorePackages: Package[] = [];
          snapshot.forEach(docSnap => {
            const d = docSnap.data();
            firestorePackages.push({
              id: docSnap.id,
              name: d.name,
              price: d.price,
              sessions: d.sessions,
              category: d.category,
              createdAt: d.createdAt
            });
          });
          setPackagesList(firestorePackages.filter(p => p.category === 'salon'));
          setGymList(firestorePackages.filter(p => p.category === 'gym'));
        }, (err) => {
          handleFirestoreError(err, OperationType.GET, 'packages');
          triggerToast('Failed to sync packages in real-time.', 'error');
        });
      };

      seedAndSubscribe();
    }

    let unsubscribeCategories: () => void = () => {};
    let unsubscribeItems: () => void = () => {};

    if (isFirebaseConfigured && db) {
      unsubscribeCategories = onSnapshot(collection(db, 'cafe_categories'), (snapshot) => {
        try {
          const cats: CafeCategory[] = [];
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            cats.push({ id: docSnap.id, ...data } as CafeCategory);
          });
          console.log('[Cafe Fetch] Categories loaded:', cats.length);
          setCafeCategories(cats.sort((a, b) => (a.order || 0) - (b.order || 0)));
        } catch (err) {
          console.error('[Cafe Fetch] Categories error:', err);
        }
      });

      unsubscribeItems = onSnapshot(collection(db, 'cafe_items'), (snapshot) => {
        try {
          const items: CafeMenuItem[] = [];
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            items.push({ id: docSnap.id, ...data } as CafeMenuItem);
          });
          console.log('[Cafe Fetch] Items loaded:', items.length);
          setCafeMenuItems(items.sort((a, b) => (a.order || 0) - (b.order || 0)));
        } catch (err) {
          console.error('[Cafe Fetch] Items error:', err);
        }
      });
    }

    loadAllData();

    return () => {
      unsubscribePackages();
      unsubscribeCategories();
      unsubscribeItems();
    };
  }, []);

  const loadAllData = async () => {
    setActionLoading(true);
    try {
      if (isFirebaseConfigured && db) {
        try {
          await ensureFirebaseAuth();
        } catch (authErr) {
          console.error('[AdminContext] Firebase auth unavailable:', authErr);
          triggerToast('Firebase authentication is not ready. Please refresh and try again.', 'error');
          setActionLoading(false);
          return;
        }

        // --- 1. Load Staff ---
        const staffSnap = await getDocs(collection(db, 'staff'));
        const loadedStaff: Staff[] = [];
        staffSnap.forEach(docSnap => {
          const d = docSnap.data();
          loadedStaff.push({
            id: docSnap.id,
            name: d.name,
            pin: d.pin,
            role: d.role,
            branchPermissions: d.branchPermissions || ['All'],
            createdAt: d.createdAt
          });
        });
        setStaffList(loadedStaff);
        localStorage.setItem('local_staff', JSON.stringify(loadedStaff));

        // --- 1b. Load Invoices & Customers for Reports ---
        try {
          const invoicesSnap = await getDocs(collection(db, 'invoices'));
          const tempInvoices: Invoice[] = [];
          invoicesSnap.forEach(snap => {
            tempInvoices.push({ id: snap.id, ...snap.data() } as Invoice);
          });
          setInvoicesList(tempInvoices);
          localStorage.setItem('local_invoices', JSON.stringify(tempInvoices));
        } catch (invErr) {
          console.error('[AdminConfig] Invoices load failed:', invErr);
        }

        try {
          const customersSnap = await getDocs(collection(db, 'customers'));
          const tempCustomers: Customer[] = [];
          customersSnap.forEach(snap => {
            tempCustomers.push({ id: snap.id, ...snap.data() } as Customer);
          });
          
          // Merge local offline customers to resolve names created while offline
          const localCustomers: Customer[] = JSON.parse(localStorage.getItem('local_customers') || '[]');
          localCustomers.forEach(localCust => {
            if (!tempCustomers.find(c => c.id === localCust.id)) {
              tempCustomers.push(localCust);
            }
          });

          setCustomersList(tempCustomers);
          localStorage.setItem('local_customers', JSON.stringify(tempCustomers));
        } catch (custErr) {
          console.error('[AdminConfig] Customers load failed:', custErr);
        }

        try {
          const cpSnap = await getDocs(collection(db, 'customerPackages'));
          const tempCPkgs: CustomerPackage[] = [];
          cpSnap.forEach(snap => {
            tempCPkgs.push({ id: snap.id, ...snap.data() } as CustomerPackage);
          });
          setCustomerPackagesList(tempCPkgs);
          localStorage.setItem('local_customer_packages', JSON.stringify(tempCPkgs));
        } catch (cpErr) {
          console.error('[AdminConfig] Customer packages load failed:', cpErr);
        }

        // --- 2. Load settings/company ---
        const settingsSnap = await getDocs(collection(db, 'settings'));
        if (!settingsSnap.empty) {
          const globalSet = settingsSnap.docs[0].data();
          if (globalSet.companyName) {
            onCompanyNameUpdate(globalSet.companyName);
            setEditCompanyNameInput(globalSet.companyName);
          }
          if (globalSet.branches) {
            onBranchesUpdate(globalSet.branches);
          }
          if (globalSet.publicAppUrl) {
            setEditPublicAppUrlInput(globalSet.publicAppUrl);
          }
        } else {
          // Create initial system config
          await setDoc(doc(db, 'settings', 'config'), {
            companyName: 'Hayat Beauty & Care',
            branches: ['Riffa', 'Janabiya', 'Busaiteen', 'Askar'],
            publicAppUrl: '',
            updatedAt: new Date().toISOString()
          });
        }

      } else {
        // Fallback LocalStorage Sync
        const localStaff = localStorage.getItem('local_staff');
        const localPkgs = localStorage.getItem('local_packages');
        
        let loadedPkgs: Package[] = [];
        if (localPkgs) {
          loadedPkgs = JSON.parse(localPkgs);
        } else {
          // No local packages - Seed hardcoded list locally
          let idCounter = 1;
          const initialLocal: Package[] = [
            ...INITIAL_SALON_PACKAGES.map(sp => ({
              id: `sp-${idCounter++}`,
              name: sp.name,
              price: sp.price,
              sessions: sp.sessions,
              category: 'salon' as const,
              createdAt: new Date().toISOString()
            })),
            ...INITIAL_GYM_MEMBERSHIPS.map(gm => ({
              id: `gm-${idCounter++}`,
              name: gm.name,
              price: gm.price,
              sessions: gm.sessions,
              category: 'gym' as const,
              createdAt: new Date().toISOString()
            }))
          ];
          localStorage.setItem('local_packages', JSON.stringify(initialLocal));
          loadedPkgs = initialLocal;
        }

        setPackagesList(loadedPkgs.filter(p => p.category === 'salon'));
        setGymList(loadedPkgs.filter(p => p.category === 'gym'));

        if (localStaff) {
          setStaffList(JSON.parse(localStaff));
        } else {
          setStaffList([]);
        }

        const localInvoices = JSON.parse(localStorage.getItem('local_invoices') || '[]');
        setInvoicesList(localInvoices);

        const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
        setCustomersList(localCustomers);

        const localCPkgs = JSON.parse(localStorage.getItem('local_customer_packages') || '[]');
        setCustomerPackagesList(localCPkgs);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'packages');
      triggerToast('Failed to load system configs.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleWipeCustomerData = async () => {
    const confirmationText = language === 'ar' ? 'مسح' : 'delete';
    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: 'wipe-data',
      targetName: language === 'ar' ? 'مسح بيانات العملاء' : 'Wipe customer data',
      confirmationPromptText: language === 'ar'
        ? `تحذير هام ومصيري!\n\nسيؤدي هذا الإجراء إلى حذف جميع:\n1. عمليات الكاش والبنفت والبطاقة\n2. ملفات العملاء\n3. سجل الاشتراكات والعضويات\n4. سجل الحركات والتدقيق\n\n- الباقات والأسعار للمحل سيبقى تكوينها محفوظاً.\n- الموظفين وصلاحياتهم سيبقون محفوظين بالكامل دون أي مسح.\n\nلتأكيد المسح النهائي الفوري، يرجى كتابة الكلمة "${confirmationText}" بالأسفل ثم اضغط تأكيد:`
        : `CRITICAL ACTION!\n\nThis will permanently purge:\n1. Invoices (Cash, Benefit, Card)\n2. Customers profiles\n3. Customer purchased packages\n4. Activity/audit logs\n\n- Catalog services and packages will NOT be deleted.\n- Authorized employee accounts and PINs will NOT be deleted.\n\nTo confirm, type "${confirmationText}" and click Confirm:`,
      confirmationInputPlaceholder: confirmationText,
      confirmationInputValue: '',
      onConfirm: async (inputValue) => {
        if ((inputValue || '').trim() !== confirmationText) {
          triggerToast(language === 'ar' ? 'تم إلغاء عملية تهيئة البيانات.' : 'Data reset cancelled.', 'error');
          return;
        }

        setActionLoading(true);
        triggerToast(language === 'ar' ? 'جاري مسح وتنظيف السجلات وقاعدة البيانات...' : 'Purging records & clearing database...', 'ref');

        try {
          if (isFirebaseConfigured && db) {
            // 1. Delete Invoices
            const invoicesSnap = await getDocs(collection(db, 'invoices'));
            for (const docSnap of invoicesSnap.docs) {
              await deleteDoc(doc(db, 'invoices', docSnap.id));
            }

            // 2. Delete Customer Packages
            const custPkgsSnap = await getDocs(collection(db, 'customerPackages'));
            for (const docSnap of custPkgsSnap.docs) {
              await deleteDoc(doc(db, 'customerPackages', docSnap.id));
            }

            // 3. Delete Audit Logs
            const auditSnap = await getDocs(collection(db, 'auditLogs'));
            for (const docSnap of auditSnap.docs) {
              await deleteDoc(doc(db, 'auditLogs', docSnap.id));
            }

            // 4. Delete Customers
            const custSnap = await getDocs(collection(db, 'customers'));
            for (const docSnap of custSnap.docs) {
              await deleteDoc(doc(db, 'customers', docSnap.id));
            }
          } else {
            // Fallback local persistence
            localStorage.removeItem('local_invoices');
            localStorage.removeItem('local_customers');
            localStorage.removeItem('local_logs');
            localStorage.removeItem('local_packages');
          }

          await loadAllData();
          triggerToast(
            language === 'ar'
              ? 'تم تفريغ كافة السجلات وتنظيف قاعدة البيانات بنجاح تام!'
              : 'Database cleaned and prepared successfully!',
            'success'
          );
        } catch (err: any) {
          console.error('[AdminConfig] Master purge failed:', err);
          triggerToast(
            language === 'ar'
              ? `فشلت عملية التنظيف: ${err.message}`
              : `Clearance failed: ${err.message}`,
            'error'
          );
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleExecuteAdminAction = async () => {
    const { actionType, targetId, targetName, onConfirm } = adminConfirmModal;
    setActionLoading(true);
    try {
      if (onConfirm) {
        const confirmationValue = typeof adminConfirmModal.confirmationInputValue === 'string'
          ? adminConfirmModal.confirmationInputValue.trim()
          : adminConfirmModal.confirmationInputValue;
        await onConfirm(confirmationValue);
      } else if (isFirebaseConfigured && db) {
        if (actionType === 'soft-delete-invoice') {
          await updateDoc(doc(db, 'invoices', targetId), {
            isDeleted: true,
            deletedAt: new Date().toISOString()
          });
          triggerToast(language === 'ar' ? `تم نقل الفاتورة (${targetName}) إلى سلة المهملات` : `Invoice (${targetName}) moved to Recycle Bin.`);
        } else if (actionType === 'soft-delete-customer') {
          await updateDoc(doc(db, 'customers', targetId), {
            isDeleted: true,
            deletedAt: new Date().toISOString()
          });
          triggerWalletUpdate(targetId).catch(() => {});
          triggerToast(language === 'ar' ? `تم نقل العميل (${targetName}) إلى سلة المهملات` : `Customer (${targetName}) moved to Recycle Bin.`);
        } else if (actionType === 'restore-invoice') {
          await updateDoc(doc(db, 'invoices', targetId), {
            isDeleted: false,
            deletedAt: null
          });
          triggerToast(language === 'ar' ? 'تمت استعادة الفاتورة بنجاح' : 'Invoice restored successfully!');
        } else if (actionType === 'restore-customer') {
          await updateDoc(doc(db, 'customers', targetId), {
            isDeleted: false,
            deletedAt: null
          });
          triggerWalletUpdate(targetId).catch(() => {});
          triggerToast(language === 'ar' ? 'تمت استعادة العميل بنجاح' : 'Customer restored successfully!');
        } else if (actionType === 'permanent-delete-invoice') {
          await deleteDoc(doc(db, 'invoices', targetId));
          triggerToast(language === 'ar' ? 'تم حذف الفاتورة نهائياً بنجاح' : 'Invoice permanently deleted.');
        } else if (actionType === 'permanent-delete-customer') {
          await deleteDoc(doc(db, 'customers', targetId));
          triggerToast(language === 'ar' ? 'تم حذف ملف العميل نهائياً بنجاح' : 'Customer profile permanently deleted.');
        } else if (actionType === 'restore-multiple-customers') {
          const batch = writeBatch(db);
          selectedRecycleCustomers.forEach(id => {
            batch.update(doc(db, 'customers', id), { isDeleted: false, deletedAt: null });
          });
          await batch.commit();
          selectedRecycleCustomers.forEach(id => triggerWalletUpdate(id).catch(() => {}));
          setSelectedRecycleCustomers([]);
          triggerToast(language === 'ar' ? 'تمت استعادة الأعضاء بنجاح' : 'Customers restored successfully!');
        } else if (actionType === 'permanent-delete-multiple-customers') {
          const batch = writeBatch(db);
          selectedRecycleCustomers.forEach(id => {
            batch.delete(doc(db, 'customers', id));
          });
          await batch.commit();
          setSelectedRecycleCustomers([]);
          triggerToast(language === 'ar' ? 'تم الحذف النهائي للأعضاء المحددين' : 'Customers permanently deleted.');
        } else if (actionType === 'restore-multiple-invoices') {
          const batch = writeBatch(db);
          selectedRecycleInvoices.forEach(id => {
            batch.update(doc(db, 'invoices', id), { isDeleted: false, deletedAt: null });
          });
          await batch.commit();
          setSelectedRecycleInvoices([]);
          triggerToast(language === 'ar' ? 'تمت استعادة الفواتير المحددة بنجاح' : 'Invoices restored successfully!');
        } else if (actionType === 'permanent-delete-multiple-invoices') {
          const batch = writeBatch(db);
          selectedRecycleInvoices.forEach(id => {
            batch.delete(doc(db, 'invoices', id));
          });
          await batch.commit();
          setSelectedRecycleInvoices([]);
          triggerToast(language === 'ar' ? 'تم الحذف النهائي للفواتير المحددة' : 'Invoices permanently deleted.');
        } else if (actionType === 'empty-all-recycle-bin') {
          const batch = writeBatch(db);
          customersList.filter((c: any) => c.isDeleted).forEach((c: any) => {
            if (c.id) batch.delete(doc(db, 'customers', c.id));
          });
          invoicesList.filter((i: any) => i.isDeleted).forEach((i: any) => {
            if (i.id) batch.delete(doc(db, 'invoices', i.id));
          });
          await batch.commit();
          setSelectedRecycleCustomers([]);
          setSelectedRecycleInvoices([]);
          triggerToast(language === 'ar' ? 'تم إفراغ سلة المهملات بالكامل' : 'Recycle bin emptied completely.');
        }
        await loadAllData();
      } else {
        // Fallback local persistence soft deletions
        const updatedLocalInv = invoicesList.map((i: any) => {
          if (i.id === targetId) {
            if (actionType === 'soft-delete-invoice') return { ...i, isDeleted: true, deletedAt: new Date().toISOString() };
            if (actionType === 'restore-invoice') return { ...i, isDeleted: false, deletedAt: null };
          }
          if (actionType === 'restore-multiple-invoices' && selectedRecycleInvoices.includes(i.id)) {
            return { ...i, isDeleted: false, deletedAt: null };
          }
          return i;
        }).filter(i => {
          if (i.id === targetId && actionType === 'permanent-delete-invoice') return false;
          if (actionType === 'permanent-delete-multiple-invoices' && selectedRecycleInvoices.includes(i.id)) return false;
          return true;
        });
        localStorage.setItem('local_invoices', JSON.stringify(updatedLocalInv));
        setInvoicesList(updatedLocalInv);
        if (actionType.includes('multiple-invoices')) setSelectedRecycleInvoices([]);

        const updatedLocalCust = customersList.map((c: any) => {
          if (c.id === targetId) {
            if (actionType === 'soft-delete-customer') return { ...c, isDeleted: true, deletedAt: new Date().toISOString() };
            if (actionType === 'restore-customer') return { ...c, isDeleted: false, deletedAt: null };
          }
          if (actionType === 'restore-multiple-customers' && selectedRecycleCustomers.includes(c.id)) {
            return { ...c, isDeleted: false, deletedAt: null };
          }
          return c;
        }).filter(c => {
          if (c.id === targetId && actionType === 'permanent-delete-customer') return false;
          if (actionType === 'permanent-delete-multiple-customers' && selectedRecycleCustomers.includes(c.id)) return false;
          if (actionType === 'empty-all-recycle-bin' && c.isDeleted) return false;
          return true;
        });
        localStorage.setItem('local_customers', JSON.stringify(updatedLocalCust));
        setCustomersList(updatedLocalCust);
        if (actionType.includes('multiple-customers')) setSelectedRecycleCustomers([]);

        if (actionType === 'empty-all-recycle-bin') {
          const emptyInv = invoicesList.filter(i => !i.isDeleted);
          localStorage.setItem('local_invoices', JSON.stringify(emptyInv));
          setInvoicesList(emptyInv);
          setSelectedRecycleCustomers([]);
          setSelectedRecycleInvoices([]);
        }

        triggerToast(language === 'ar' ? 'تم تحديث البيانات محلياً بنجاح' : 'Local storage state updated successfully.');
      }
    } catch (err: any) {
      console.error('Error executing admin action:', err);
      triggerToast(language === 'ar' ? 'فشلت معالجة الطلب الدقيق' : 'Action failed to process.', 'error');
    } finally {
      setActionLoading(false);
      setAdminConfirmModal({
        isOpen: false,
        actionType: 'soft-delete-invoice',
        targetId: '',
        targetName: '',
        confirmationPromptText: undefined,
        confirmationInputPlaceholder: undefined,
        confirmationInputValue: undefined,
        confirmationOptions: undefined,
        onConfirm: undefined
      });
    }
  };

  const value = {
    staffList, packagesList, gymList, invoicesList, customersList, customerPackagesList,
    cafeCategories, cafeMenuItems, dbSynced, actionLoading, toast,
    triggerToast,
    loadAllData,
    adminConfirmModal,
    setAdminConfirmModal,
    viewEODStaffName,
    setViewEODStaffName,
    viewEODStaffId,
    setViewEODStaffId,
    handleExecuteAdminAction,
    handleWipeCustomerData,
    editCompanyNameInput,
    setEditCompanyNameInput,
    editPublicAppUrlInput,
    setEditPublicAppUrlInput,
    availableBranches,
    onBranchesUpdate,
    onCompanyNameUpdate,
    selectedRecycleCustomers,
    setSelectedRecycleCustomers,
    selectedRecycleInvoices,
    setSelectedRecycleInvoices,
    setActionLoading,
    setStaffList,
    setInvoicesList,
    companyName,
    getCustomerName,
    getInvoiceCustomerName
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}
