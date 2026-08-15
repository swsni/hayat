import React, { useState, useEffect } from 'react';
import { useCurrency } from '../LanguageContext';
import { Customer, CustomerPackage, AuditLog } from '../types';
import { ArrowLeft, User, Phone, CheckCircle2, History, Dumbbell, Tag, CalendarClock, Minus, RotateCcw, AlertTriangle, Printer, Wallet, ShoppingBag, Edit3, X, Users, Plus, ChevronRight, Receipt, Coffee, Trash2, ShieldBan, ShieldCheck, KeyRound, Snowflake } from 'lucide-react';
import { db, isFirebaseConfigured, auth } from '../firebase';
import { collection, query, where, orderBy, getDocs, doc, getDoc, updateDoc, addDoc, writeBatch, increment, deleteDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import CustomerInvoicesModal from './CustomerInvoicesModal';
import { showToast } from '../utils/toast';
import { offlineSyncService } from '../utils/offlineSync';
import { useLanguage } from '../LanguageContext';
import { triggerWalletUpdate } from '../utils/wallet';
import { generateReceiptPdf } from '../utils/receiptGenerator';
import CoffeeSalesModal from './CoffeeSalesModal';
import { isCafeBranchEnabled } from '../utils/cafeBranch';
import { ErrorBoundary } from './ErrorBoundary';
import { isQatarBranch, getActiveBranch } from '../utils/branchHelpers';

interface CustomerProfileProps {
  customer: Customer;
  staffName: string;
  staffId?: string;
  branch: string;
  isAdmin?: boolean;
  onCustomerUpdated?: (updatedCustomer: Customer) => void;
  onBack: () => void;
  onPurchase: (type: 'gym' | 'salon' | 'cafe', cafeItem?: any) => void;
}

export default function CustomerProfile({ customer, staffName, staffId, branch, isAdmin, onCustomerUpdated, onBack, onPurchase }: CustomerProfileProps) {
  const { language, t } = useLanguage();
  const currency = useCurrency();
  const activeBranch = getActiveBranch();
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // States for session deduction confirmation
  const [confirmDeductId, setConfirmDeductId] = useState<string | null>(null);
  const [isProcessingSession, setIsProcessingSession] = useState(false);
  
  const [isPrinting, setIsPrinting] = useState(false);
const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [appleWalletStatus, setAppleWalletStatus] = useState<string | null>(null);

  // States for Apple Wallet QR Modal
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [isPrintingLog, setIsPrintingLog] = useState<string | null>(null);
  const [walletQrUrl, setWalletQrUrl] = useState<string | null>(null);

  // States for Invoices Modal
  const [isInvoicesModalOpen, setIsInvoicesModalOpen] = useState(false);

  // States for Edit Profile
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState(customer.name);
  const [editPhone, setEditPhone] = useState(customer.phone);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // States for Family
  const [familyMembers, setFamilyMembers] = useState<Customer[]>([]);
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [newFamilyMemberName, setNewFamilyMemberName] = useState('');
  const [isSavingFamilyMember, setIsSavingFamilyMember] = useState(false);

  // States for Edit Package
  const [isEditPackageModalOpen, setIsEditPackageModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<CustomerPackage | null>(null);
  const [editPkgTotalSessions, setEditPkgTotalSessions] = useState<number>(0);
  const [editPkgRemainingSessions, setEditPkgRemainingSessions] = useState<number>(0);
  const [editPkgStartDate, setEditPkgStartDate] = useState<string>('');
  const [editPkgEndDate, setEditPkgEndDate] = useState<string>('');
  const [isSavingPackageEdit, setIsSavingPackageEdit] = useState(false);

  // States for Freeze Package
  const [isFreezeModalOpen, setIsFreezeModalOpen] = useState(false);
  const [freezingPackage, setFreezingPackage] = useState<CustomerPackage | null>(null);
  const [freezeDays, setFreezeDays] = useState<number>(1);
  const [isFreezingAction, setIsFreezingAction] = useState(false);

  // States for Ghost Packages
  const [resolvingGhostPackage, setResolvingGhostPackage] = useState<CustomerPackage | null>(null);
  const [isResolvingGhost, setIsResolvingGhost] = useState(false);

  const isGhostPackage = (pkg: CustomerPackage) => {
    if (pkg.isVerified) return false;
    
    const pkgTime = new Date(pkg.purchasedAt).getTime();
    let hasPurchaseLog = false;
    let hasDeductOrUpdateLog = false;

    auditLogs.forEach(log => {
      // Check for purchase match (allow 10 seconds diff to be safe, though usually exactly same)
      if (log.action === 'Purchase' || log.action === 'Bonus Provision') {
        const logTime = new Date(log.timestamp).getTime();
        if (Math.abs(logTime - pkgTime) < 10000) {
          hasPurchaseLog = true;
        }
      }
      // Check for deduction or update history
      if (log.description.includes(pkg.packageName)) {
        hasDeductOrUpdateLog = true;
      }
    });

    const isGhost = !hasPurchaseLog && !hasDeductOrUpdateLog;

    // Twin Check: Is there another package with the exact same name and time?
    const isTwin = packages.some(otherPkg => {
      if (otherPkg.id === pkg.id) return false;
      if (otherPkg.packageName !== pkg.packageName) return false;
      const otherTime = new Date(otherPkg.purchasedAt).getTime();
      return Math.abs(otherTime - pkgTime) < 5000; // within 5 seconds
    });

    return isGhost || isTwin;
  };

  const getTranslatedDescription = (desc: string) => {
    if (language !== 'ar') return desc;
    let translated = desc;
    
    // Normalize and translate session deduction templates
    if (desc.startsWith('Deduction of 1 session from "') || desc.startsWith('Deducted 1 session from "')) {
      translated = desc
        .replace(/Deduction of 1 session from "/g, 'تم خصم جلسة واحدة من باقة "')
        .replace(/Deducted 1 session from "/g, 'تم خصم جلسة واحدة من باقة "')
        .replace(/" \(/g, '" (المتبقي: ')
        .replace(/ remaining\)/g, ' جلسة)');
    } else if (desc.startsWith('Restored 1 session to "') || desc.startsWith('Restored 1 session in "')) {
      translated = desc
        .replace(/Restored 1 session to "/g, 'تم إرجاع وتأكيد جلسة لباقة "')
        .replace(/Restored 1 session in "/g, 'تم إرجاع وتأكيد جلسة لباقة "')
        .replace(/" \(/g, '" (المتبقي: ')
        .replace(/ remaining\)/g, ' جلسة)');
    } else if (desc.includes('Purchased "')) {
      translated = desc
        .replace(/Purchased "/g, 'تم شراء باقة "')
        .replace(/" with /g, '" بـ ')
        .replace(/payment/g, 'دفع')
        .replace(/Cash/g, 'نقداً (كاش)')
        .replace(/Card\/POS/g, 'بطاقة صراف/بوابة الدفع')
        .replace(/BenefitPay/g, 'بنفت باي (BenefitPay)')
        .replace(/Previously Paid/g, 'مدفوع مسبقاً');
    }
    return translated;
  };
  const [walletPassDownloadUrl, setWalletPassDownloadUrl] = useState<string>('');
  const [publicAppUrl, setPublicAppUrl] = useState<string>('');

  // ── De-duplication helper ────────────────────────────────────────────────────
  // Cross-references packages against audit logs.  Every legitimate purchase
  // produces a matching "Purchase" audit log.  Merge-created duplicates do NOT
  // have a matching log.  If N twin packages exist but only M < N purchase logs
  // match, we keep the M most-evidenced copies and discard the rest.
  const deduplicatePackages = (pkgs: CustomerPackage[], logs: AuditLog[]): CustomerPackage[] => {
    if (pkgs.length <= 1) return pkgs;

    const TWIN_WINDOW_MS = 60_000;   // 60s to group twins
    const LOG_MATCH_MS   = 30_000;   // 30s to match a log to a package

    const purchaseLogs = logs.filter(l => l.action === 'Purchase' || l.action === 'Bonus Provision');
    const usageLogs    = logs.filter(l => l.action === 'Deduct' || l.action === 'Undo');

    const sorted = [...pkgs].sort((a, b) =>
      new Date(a.purchasedAt).getTime() - new Date(b.purchasedAt).getTime()
    );

    const keep = new Set<string>();   // IDs to keep
    const consumed = new Set<string>();

    for (let i = 0; i < sorted.length; i++) {
      if (consumed.has(sorted[i].id!)) continue;

      // Build twin group (same packageName, close purchasedAt)
      const twins = [sorted[i]];
      for (let j = i + 1; j < sorted.length; j++) {
        if (consumed.has(sorted[j].id!)) continue;
        if (sorted[i].packageName !== sorted[j].packageName) continue;
        const diff = Math.abs(
          new Date(sorted[i].purchasedAt).getTime() -
          new Date(sorted[j].purchasedAt).getTime()
        );
        if (diff <= TWIN_WINDOW_MS) twins.push(sorted[j]);
      }

      if (twins.length <= 1) {
        keep.add(twins[0].id!);
        continue;
      }

      // Count unique Purchase logs that match ANY twin in this group
      const matchedLogIds = new Set<string>();
      for (const twin of twins) {
        const tTime = new Date(twin.purchasedAt).getTime();
        purchaseLogs.forEach(log => {
          const lTime = new Date(log.timestamp).getTime();
          if (Math.abs(lTime - tTime) < LOG_MATCH_MS &&
              log.description?.includes(twin.packageName)) {
            matchedLogIds.add(log.id!);
          }
        });
      }

      const logCount = matchedLogIds.size;

      // If enough logs for all twins → all are legit
      if (logCount >= twins.length) {
        twins.forEach(t => keep.add(t.id!));
        twins.forEach(t => consumed.add(t.id!));
        continue;
      }

      // Rank twins by evidence (best evidence = most likely real)
      twins.sort((a, b) => {
        const aUsed = usageLogs.some(l => l.description?.includes(a.packageName));
        const bUsed = usageLogs.some(l => l.description?.includes(b.packageName));
        if (aUsed !== bUsed) return aUsed ? -1 : 1;
        if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
        return (a.remainingSessions ?? 999) - (b.remainingSessions ?? 999);
      });

      const keepCount = Math.max(1, logCount);
      twins.slice(0, keepCount).forEach(t => keep.add(t.id!));
      twins.forEach(t => consumed.add(t.id!));
    }

    return pkgs.filter(p => keep.has(p.id!));
  };

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        // Fetch Customer Document, Packages and Audit Logs in parallel for performance
        const custRef = doc(db, 'customers', customer.id);
        const pkgQuery = query(collection(db, 'customerPackages'), where('customerId', '==', customer.id));
        const logQuery = query(collection(db, 'auditLogs'), where('customerId', '==', customer.id));
        const [custSnap, pkgSnap, logSnap] = await Promise.all([getDoc(custRef), getDocs(pkgQuery), getDocs(logQuery)]);

        if (custSnap.exists()) {
          const freshCustomer = { id: custSnap.id, ...custSnap.data() } as Customer;
          if (onCustomerUpdated && freshCustomer.walletBalance !== customer.walletBalance) {
            onCustomerUpdated(freshCustomer);
          }
        }

        const pkgsData: CustomerPackage[] = [];
        pkgSnap.forEach(d => pkgsData.push({ id: d.id, ...d.data() } as CustomerPackage));

        const logsData: AuditLog[] = [];
        logSnap.forEach(d => logsData.push({ id: d.id, ...d.data() } as AuditLog));
        const sortedLogs = logsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setAuditLogs(sortedLogs);

        // De-duplicate packages using audit logs as evidence
        const dedupedPkgs = deduplicatePackages(pkgsData, sortedLogs);
        const sortedPkgs = dedupedPkgs.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());
        setPackages(sortedPkgs);

        // Fetch Family Members
        const familyQuery = query(collection(db, 'customers'), where('phone', '==', customer.phone));
        const familySnap = await getDocs(familyQuery);
        const familyData: Customer[] = [];
        familySnap.forEach(d => {
          if (d.id !== customer.id) {
             const cust = { id: d.id, ...d.data() } as Customer;
             if (!cust.isDeleted) familyData.push(cust);
          }
        });
        setFamilyMembers(familyData);

        // Fetch settings/config for Apple Wallet publicAppUrl
        try {
          const configSnap = await getDoc(doc(db, 'settings', 'config'));
          if (configSnap.exists()) {
            const configData = configSnap.data();
            if (configData.publicAppUrl) {
              setPublicAppUrl(configData.publicAppUrl.trim());
            }
          }
        } catch (settingsErr) {
          console.warn('Could not load global settings/config', settingsErr);
        }

        // Merge/Sync to offline storage cache
        const localPkgs = JSON.parse(localStorage.getItem('local_packages') || '[]');
        const filteredLocalPkgs = localPkgs.filter((p: CustomerPackage) => p.customerId !== customer.id);
        localStorage.setItem('local_packages', JSON.stringify([...filteredLocalPkgs, ...sortedPkgs]));

        const localLogs = JSON.parse(localStorage.getItem('local_logs') || '[]');
        const filteredLocalLogs = localLogs.filter((l: AuditLog) => l.customerId !== customer.id);
        localStorage.setItem('local_logs', JSON.stringify([...filteredLocalLogs, ...sortedLogs]));
      } else {
        // Fallback or offline — load logs first, then dedup packages with them
        const localLogs = JSON.parse(localStorage.getItem('local_logs') || '[]');
        const customerLogs = localLogs.filter((l: AuditLog) => l.customerId === customer.id);
        setAuditLogs(customerLogs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

        const localPkgs = JSON.parse(localStorage.getItem('local_packages') || '[]');
        const customerPkgs = localPkgs.filter((p: CustomerPackage) => p.customerId === customer.id);
        setPackages(deduplicatePackages(customerPkgs, customerLogs).sort((a: any, b: any) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()));

        const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
        setFamilyMembers(localCustomers.filter((c: Customer) => c.phone === customer.phone && c.id !== customer.id && !c.isDeleted));
      }
    } catch (err) {
      console.warn('[Offline Load] Firestore profiles failed to load, falling back to local cache.', err);
      const localLogs = JSON.parse(localStorage.getItem('local_logs') || '[]');
      const customerLogs = localLogs.filter((l: AuditLog) => l.customerId === customer.id);
      setAuditLogs(customerLogs.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));

      const localPkgs = JSON.parse(localStorage.getItem('local_packages') || '[]');
      const customerPkgs = localPkgs.filter((p: CustomerPackage) => p.customerId === customer.id);
      setPackages(deduplicatePackages(customerPkgs, customerLogs).sort((a: any, b: any) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime()));

      const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
      setFamilyMembers(localCustomers.filter((c: Customer) => c.phone === customer.phone && c.id !== customer.id && !c.isDeleted));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [customer.id]);

  const handleAddFamilyMember = async () => {
    const trimmedName = newFamilyMemberName.trim();
    if (!trimmedName) {
      showToast(language === 'ar' ? 'يرجى إدخال اسم التابع' : 'Please enter the name', 'error');
      return;
    }

    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(trimmedName)) {
      showToast(language === 'ar' ? 'الرجاء كتابة اسم العميل باللغة الإنجليزية فقط.' : 'Please enter the name in English only.', 'error');
      return;
    }

    setIsSavingFamilyMember(true);
    try {
      const parentIdToUse = customer.parentId || customer.id;
      const parentNameToUse = customer.parentName || customer.name;
      
      const customerData = {
        name: trimmedName,
        phone: customer.phone,
        parentId: parentIdToUse,
        parentName: parentNameToUse,
        createdAt: new Date().toISOString()
      };

      if (isFirebaseConfigured && db && navigator.onLine) {
        await addDoc(collection(db, 'customers'), customerData);
        showToast(language === 'ar' ? `تمت إضافة ${trimmedName} بنجاح!` : `Added ${trimmedName} successfully!`, 'success');
      } else {
        offlineSyncService.queueAction('create_customer', {
          id: `cust-${Date.now()}`,
          ...customerData
        });
      }
      
      setNewFamilyMemberName('');
      setIsFamilyModalOpen(false);
      window.dispatchEvent(new CustomEvent('hala_refresh_profile'));
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء الإضافة' : 'Failed to add family member', 'error');
    } finally {
      setIsSavingFamilyMember(false);
    }
  };

  // Exposed method to trigger reload from App.tsx after purchase
  useEffect(() => {
    const handleGlobalTrigger = () => fetchProfileData();
    window.addEventListener('hala_refresh_profile', handleGlobalTrigger);
    return () => window.removeEventListener('hala_refresh_profile', handleGlobalTrigger);
  }, []);

  const handleSaveProfile = async () => {
    if (!editName.trim() || !editPhone.trim()) {
      showToast(language === 'ar' ? 'يرجى تعبئة جميع الحقول' : 'Please fill all fields', 'error');
      return;
    }

    setIsSavingEdit(true);
    try {
      const now = new Date().toISOString();
      if (isFirebaseConfigured && db && navigator.onLine) {
        const batch = writeBatch(db);
        const customerRef = doc(db, 'customers', customer.id);
        
        batch.update(customerRef, {
          name: editName,
          phone: editPhone
        });

        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          customerId: customer.id,
          action: 'Profile Update',
          description: `Updated profile info. Name: ${editName}, Phone: ${editPhone}`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);

        await batch.commit();
        showToast(language === 'ar' ? 'تم تحديث الملف بنجاح!' : 'Profile updated successfully!', 'success');
        
        // Trigger Apple Wallet pass update so the new name appears on the card
        triggerWalletUpdate(customer.id);
        
        if (onCustomerUpdated) {
          onCustomerUpdated({ ...customer, name: editName, phone: editPhone });
        }
        setIsEditModalOpen(false);
        fetchProfileData();
      } else {
        showToast(language === 'ar' ? 'لا يمكن التعديل حالياً بدون إنترنت' : 'Cannot edit profile while offline', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء حفظ التعديلات' : 'Failed to update profile', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteGhostPackage = async () => {
    if (!resolvingGhostPackage || !resolvingGhostPackage.id) return;
    setIsResolvingGhost(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        // Delete package from Firestore
        await deleteDoc(doc(db, 'customerPackages', resolvingGhostPackage.id));

        // Update local state
        setPackages(prev => prev.filter(p => p.id !== resolvingGhostPackage.id));
        showToast(language === 'ar' ? 'تم حذف الباقة بنجاح' : 'Package deleted successfully', 'success');
      } else {
        showToast(language === 'ar' ? 'يرجى الاتصال بالإنترنت' : 'Please connect to internet', 'error');
      }
    } catch (err) {
      console.error('Error deleting ghost package:', err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Failed to delete package', 'error');
    } finally {
      setIsResolvingGhost(false);
      setResolvingGhostPackage(null);
    }
  };

  const handleKeepGhostPackage = async () => {
    if (!resolvingGhostPackage || !resolvingGhostPackage.id) return;
    setIsResolvingGhost(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        // Update package in Firestore to mark as verified
        await updateDoc(doc(db, 'customerPackages', resolvingGhostPackage.id), {
          isVerified: true
        });

        // Update local state
        setPackages(prev => prev.map(p => 
          p.id === resolvingGhostPackage.id ? { ...p, isVerified: true } : p
        ));
        
        showToast(language === 'ar' ? 'تم تأكيد إبقاء الباقة' : 'Package verified and kept', 'success');
      } else {
        showToast(language === 'ar' ? 'يرجى الاتصال بالإنترنت' : 'Please connect to internet', 'error');
      }
    } catch (err) {
      console.error('Error verifying ghost package:', err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء التحديث' : 'Failed to verify package', 'error');
    } finally {
      setIsResolvingGhost(false);
      setResolvingGhostPackage(null);
    }
  };

  const openEditPackageModal = (pkg: CustomerPackage) => {
    setEditingPackage(pkg);
    setEditPkgTotalSessions(pkg.totalSessions || 1);
    setEditPkgRemainingSessions(pkg.remainingSessions || 0);
    setEditPkgStartDate(pkg.startDate || '');
    setEditPkgEndDate(pkg.endDate || '');
    setIsEditPackageModalOpen(true);
  };

  const handleSavePackageEdit = async () => {
    if (!editingPackage || !editingPackage.id) return;

    if (editPkgRemainingSessions < 0 || editPkgTotalSessions <= 0 || editPkgRemainingSessions > editPkgTotalSessions) {
      showToast(language === 'ar' ? 'يرجى إدخال عدد جلسات صحيح' : 'Please enter valid session numbers', 'error');
      return;
    }

    setIsSavingPackageEdit(true);
    try {
      const now = new Date().toISOString();
      if (isFirebaseConfigured && db && navigator.onLine) {
        const batch = writeBatch(db);
        const pkgRef = doc(db, 'customerPackages', editingPackage.id);
        
        batch.update(pkgRef, {
          totalSessions: editPkgTotalSessions,
          remainingSessions: editPkgRemainingSessions,
          startDate: editPkgStartDate || null,
          endDate: editPkgEndDate || null
        });

        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          customerId: customer.id,
          action: 'Bonus Provision', // using existing type in their code
          description: `تعديل باقة "${editingPackage.packageName}" | الجلسات: ${editPkgRemainingSessions}/${editPkgTotalSessions}`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);

        await batch.commit();
        // Trigger Apple Wallet push notification
        triggerWalletUpdate(customer.id);
        showToast(language === 'ar' ? 'تم التحديث بنجاح!' : 'Updated successfully!', 'success');
        
        setIsEditPackageModalOpen(false);
        setEditingPackage(null);
        await fetchProfileData();
      } else {
        showToast(language === 'ar' ? 'لا يمكن التعديل حالياً بدون إنترنت' : 'Cannot edit offline', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء الحفظ' : 'Failed to update package', 'error');
    } finally {
      setIsSavingPackageEdit(false);
    }
  };

  const openFreezeModal = (pkg: CustomerPackage) => {
    setFreezingPackage(pkg);
    setFreezeDays(1);
    setIsFreezeModalOpen(true);
  };

  const handleFreezePackage = async () => {
    if (!freezingPackage || !freezingPackage.id || freezeDays < 1) return;
    setIsFreezingAction(true);
    try {
      if (!isFirebaseConfigured || !navigator.onLine) {
        showToast(language === 'ar' ? 'لا يمكن التعديل حالياً بدون إنترنت' : 'Cannot edit offline', 'error');
        return;
      }
      const batch = writeBatch(db);
      const pkgRef = doc(db, 'customerPackages', freezingPackage.id);
      
      const now = new Date();
      const frozenUntilDate = new Date();
      frozenUntilDate.setDate(now.getDate() + freezeDays);
      
      const updateData: any = {
        isFrozen: true,
        frozenAt: now.toISOString(),
        frozenUntil: frozenUntilDate.toISOString()
      };

      if (freezingPackage.endDate) {
        const oldEndDate = new Date(freezingPackage.endDate);
        if (!isNaN(oldEndDate.getTime())) {
          oldEndDate.setDate(oldEndDate.getDate() + freezeDays);
          updateData.endDate = oldEndDate.toISOString().split('T')[0];
        }
      }

      batch.update(pkgRef, updateData);

      const logRef = doc(collection(db, 'auditLogs'));
      batch.set(logRef, {
        customerId: customer.id,
        action: 'Freeze Subscription',
        description: language === 'ar' 
          ? `تجميد اشتراك "${freezingPackage.packageName}" لمدة ${freezeDays} أيام` 
          : `Froze subscription "${freezingPackage.packageName}" for ${freezeDays} days`,
        timestamp: now.toISOString(),
        staffName,
        staffId: staffId || 'unknown',
        branch: branch || 'Unknown'
      });

      await batch.commit();
      
      setIsFreezeModalOpen(false);
      setFreezingPackage(null);
      await fetchProfileData();
      showToast(language === 'ar' ? 'تم التجميد بنجاح' : 'Frozen successfully', 'success');
      triggerWalletUpdate(customer.id);
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء التجميد' : 'Error freezing package', 'error');
    } finally {
      setIsFreezingAction(false);
    }
  };

  const handleUnfreezePackage = async (pkg: CustomerPackage) => {
    if (!pkg.id) return;
    try {
      if (!isFirebaseConfigured || !navigator.onLine) {
        showToast(language === 'ar' ? 'لا يمكن التعديل حالياً بدون إنترنت' : 'Cannot edit offline', 'error');
        return;
      }
      const batch = writeBatch(db);
      const pkgRef = doc(db, 'customerPackages', pkg.id);
      
      batch.update(pkgRef, {
        isFrozen: false,
        frozenAt: null,
        frozenUntil: null
      });

      const logRef = doc(collection(db, 'auditLogs'));
      batch.set(logRef, {
        customerId: customer.id,
        action: 'Unfreeze Subscription',
        description: language === 'ar' 
          ? `إلغاء تجميد اشتراك "${pkg.packageName}"` 
          : `Unfroze subscription "${pkg.packageName}"`,
        timestamp: new Date().toISOString(),
        staffName,
        staffId: staffId || 'unknown',
        branch: branch || 'Unknown'
      });

      await batch.commit();
      await fetchProfileData();
      showToast(language === 'ar' ? 'تم فك التجميد بنجاح' : 'Unfrozen successfully', 'success');
      triggerWalletUpdate(customer.id);
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ' : 'Error unfreezing package', 'error');
    }
  };

  const handleDeductSession = async (pkg: CustomerPackage) => {
    if (pkg.remainingSessions <= 0) {
      showToast('No remaining sessions left to deduct!', 'error');
      setConfirmDeductId(null);
      return;
    }
    
    setIsProcessingSession(true);
    try {
      const now = new Date().toISOString();
      const newRemaining = pkg.remainingSessions - 1;
      
      if (isFirebaseConfigured && db && pkg.id && navigator.onLine) {
        const batch = writeBatch(db);
        
        const pkgRef = doc(db, 'customerPackages', pkg.id);
        batch.update(pkgRef, { remainingSessions: newRemaining });
 
        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          customerId: customer.id,
          action: 'Deduct',
          description: `Deducted 1 session from "${pkg.packageName}" (${newRemaining} remaining)`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);
 
        await batch.commit();
        // Trigger Apple Wallet push notification
        triggerWalletUpdate(customer.id);
        showToast(`Deducted 1 session from "${pkg.packageName}"!`);
      } else {
        // Fallback or offline
        offlineSyncService.queueAction('deduct_session', {
          pkgId: pkg.id,
          customerId: customer.id,
          packageName: pkg.packageName,
          staffName,
          staffId,
          branch,
          timestamp: now
        });
      }
      
      setConfirmDeductId(null);
      await fetchProfileData();
    } catch (err: any) {
      console.warn('Firebase deduct session failed. Registering action offline.', err);
      // Fallback on direct Firebase error
      const now = new Date().toISOString();
      offlineSyncService.queueAction('deduct_session', {
        pkgId: pkg.id,
        customerId: customer.id,
        packageName: pkg.packageName,
        staffName,
        staffId,
        branch,
        timestamp: now
      });
      setConfirmDeductId(null);
      await fetchProfileData();
    } finally {
      setIsProcessingSession(false);
    }
  };
 
  const handleUndoDeduct = async (pkg: CustomerPackage) => {
    const newRemaining = pkg.remainingSessions + 1;
    if (newRemaining > pkg.totalSessions) {
      showToast('Sessions are already fully restored!', 'error');
      return;
    }

    setIsProcessingSession(true);
    try {
      const now = new Date().toISOString();
      if (isFirebaseConfigured && db && pkg.id && navigator.onLine) {
        const batch = writeBatch(db);
        
        const pkgRef = doc(db, 'customerPackages', pkg.id);
        batch.update(pkgRef, { remainingSessions: newRemaining });
 
        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          customerId: customer.id,
          action: 'Undo',
          description: `Restored 1 session to "${pkg.packageName}" (${newRemaining} remaining)`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);
 
        await batch.commit();
        // Trigger Apple Wallet push notification
        triggerWalletUpdate(customer.id);
        showToast(`Restored 1 session in "${pkg.packageName}"!`);
      } else {
        // Fallback or offline
        offlineSyncService.queueAction('undo_session', {
          pkgId: pkg.id,
          customerId: customer.id,
          packageName: pkg.packageName,
          staffName,
          staffId,
          branch,
          timestamp: now,
          totalSessions: pkg.totalSessions
        });
      }
      
      await fetchProfileData();
    } catch (err: any) {
      console.warn('Firebase undo session failed. Registering action offline.', err);
      const now = new Date().toISOString();
      offlineSyncService.queueAction('undo_session', {
        pkgId: pkg.id,
        customerId: customer.id,
        packageName: pkg.packageName,
        staffName,
        staffId,
        branch,
        timestamp: now,
        totalSessions: pkg.totalSessions
      });
      await fetchProfileData();
    } finally {
      setIsProcessingSession(false);
    }
  };

  const handlePrintCard = async () => {
    setIsPrinting(true);
    showToast('Preparing physical card template...', 'ref');
    try {
      // 1. Generate QR Code - use numeric gateCardNumber for gate compatibility
      const qrPayload = (customer as any).gateCardNumber 
        ? (customer as any).gateCardNumber.toString() 
        : `HAYAT-${customer.id}`;
      const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 1 });
      
      // Bypass fetch(qrDataUrl) which can be blocked by browsers or service workers for data: URLs.
      // Convert data URL base64 representation to native Uint8Array buffer dynamically.
      const base64Part = qrDataUrl.split(',')[1];
      const binaryString = atob(base64Part);
      const binaryLength = binaryString.length;
      const bytes = new Uint8Array(binaryLength);
      for (let i = 0; i < binaryLength; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const qrImageBytes = bytes.buffer;

      showToast('Downloading card background...', 'ref');

      // 2. Fetch the specific physically printed PDF template
      // We first try with a cache-busting timestamp query parameter to bypass service worker caches and fetch fresh from network
      // If that fails (e.g. offline), we fetch without a query param so that the Service Worker serves it from cache.
      let res;
      const primaryUrl = encodeURI('/البطاقة المطبوعة .pdf');
      try {
        res = await fetch(`${primaryUrl}?_cb=${Date.now()}`);
        if (!res.ok) throw new Error('Network-first fetch failed');
      } catch (err) {
        console.warn('[Print Card] Pure network fetch failed, trying cached version...', err);
        res = await fetch(primaryUrl);
      }
      
      if (!res || !res.ok) {
        throw new Error("Could not find the card template. Please ensure 'البطاقة المطبوعة .pdf' is inside the /public folder.");
      }
      const pdfBytes = await res.arrayBuffer();

      showToast('Customizing card with QR code...', 'ref');

      // 3. Load PDF and embed Arabic-supporting font (Cairo Bold from Google Fonts)
      const pdfDoc = await PDFDocument.load(pdfBytes);
      pdfDoc.registerFontkit(fontkit);
      const qrImage = await pdfDoc.embedPng(qrImageBytes);

      // Fetch Cairo Bold font which fully supports Arabic characters
      let customFont;
      try {
        const fontUrl = 'https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIkTp2mxdt0UX8.woff2';
        const fontResponse = await fetch(fontUrl);
        const fontBytes = await fontResponse.arrayBuffer();
        customFont = await pdfDoc.embedFont(fontBytes);
      } catch (fontErr) {
        console.warn('[Print Card] Could not load Cairo font, using Helvetica fallback:', fontErr);
        const { StandardFonts } = await import('pdf-lib');
        customFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      }
      
      const pages = pdfDoc.getPages();
      // Assuming back of card is the second page, or it's a 1-page template. We write on the first page if it's 1 page.
      const page = pages.length > 1 ? pages[1] : pages[0];
      const { width, height } = page.getSize();

      // Calculate dynamic dimensions for perfect centering and fit (avoiding clipping on IDP-Smart-51)
      const minDimension = Math.min(width, height);
      const qrSize = minDimension * 0.50; // 50% of the shortest side for QR
      const fontSize = Math.max(14, minDimension * 0.12); // Bigger font size for clear readability
      
      const gap = minDimension * 0.04; // Gap between QR and text
      const totalBlockHeight = qrSize + gap + fontSize;
      
      // Calculate Y positions (PDF origin 0,0 is bottom-left)
      const textY = (height - totalBlockHeight) / 2;
      const qrY = textY + fontSize + gap;
      const qrX = (width / 2) - (qrSize / 2);

      // Draw QR Code
      page.drawImage(qrImage, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      // Write customer name (Arabic or English) below the QR Code
      const nameText = customer.name;
      const textWidth = customFont.widthOfTextAtSize(nameText, fontSize);
      page.drawText(nameText, {
        x: (width / 2) - (textWidth / 2),
        y: textY, // Text baseline
        size: fontSize,
        font: customFont,
        color: rgb(1, 1, 1), // White color
      });

      showToast('Compiling custom card PDF...', 'ref');

      // 4. Save and trigger print / download
      const modifiedPdfBytes = await pdfDoc.save();
      const blob = new Blob([new Uint8Array(modifiedPdfBytes)], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);

      showToast(language === 'ar' ? 'جاري فتح نافذة الطباعة...' : 'Opening print preview...', 'ref');

      // Open the generated PDF in a new tab to reliably trigger the browser's native print dialog
      const newWindow = window.open(blobUrl, '_blank');
      if (!newWindow) {
        // If popup blocked, fallback to direct download/click
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Hayat_Card_${customer.id}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
      // Revoke the blob URL after enough time for the new tab/download to start
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      
    } catch (err: any) {
      showToast(err.message || 'Failed to print physical card.', 'error');
      console.error(err);
    } finally {
      setIsPrinting(false);
    }
  };

  // Generate PDF receipt for customer purchases
  const handleGenerateReceipt = async () => {
    setIsGeneratingReceipt(true);
    try {
      if (!isFirebaseConfigured || !db) {
        showToast('Firebase not configured.', 'error');
        return;
      }
      const q1 = query(collection(db, 'invoices'), where('primaryCustomerId', '==', customer.id));
      const q2 = query(collection(db, 'invoices'), where('customerId', '==', customer.id));
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      
      const allDocs = [...snap1.docs, ...snap2.docs];
      const items = allDocs.map(doc => {
        const data = doc.data();
        return { description: data.description || 'Item', amount: data.amount || 0 };
      });
      if (items.length === 0) {
        showToast('No invoices found for this customer.', 'ref');
        return;
      }

      const total = items.reduce((sum, item) => sum + item.amount, 0);

      const { printReceipt } = await import('../utils/printReceipt');
      await printReceipt({
        receiptNumber: `ALL-${customer.id.substring(0, 5).toUpperCase()}`,
        date: new Date().toLocaleString(),
        customerName: customer.name,
        processedBy: staffName || 'Admin',
        items: items,
        subtotal: total,
        total: total,
        paymentMethod: 'Multiple / History',
        status: 'Completed'
      });
      
      showToast('Receipt printed successfully.', 'success');
    } catch (e) {
      console.error(e);
      showToast('Failed to generate receipt.', 'error');
    } finally {
      setIsGeneratingReceipt(false);
    }
  };

  const handlePrintLog = async (log: any) => {
    setIsPrintingLog(log.id!);
    try {
      const { printReceipt } = await import('../utils/printReceipt');
      
      let amount = 0;
      let paymentMethod = 'N/A';
      let itemName = log.description;

      const amountMatch = log.description.match(/\(([\d.]+)\s*(?:BHD|ر\.ق)\)/i);
      if (amountMatch) amount = parseFloat(amountMatch[1]);

      const paymentMatch = log.description.match(/via\s+(.+)$/i);
      if (paymentMatch) paymentMethod = paymentMatch[1].trim();

      const itemMatch = log.description.match(/Purchased\s+(.+?)\s*\(/i);
      if (itemMatch) {
        itemName = itemMatch[1].trim();
      } else if (amountMatch) {
         const beforeAmt = log.description.split('(')[0];
         itemName = beforeAmt.replace('Purchased', '').trim();
      }

      await printReceipt({
        receiptNumber: log.id || `REC-${Date.now()}`,
        date: new Date(log.timestamp).toLocaleString(),
        customerName: customer.name,
        processedBy: log.staffName || staffName || 'Staff',
        items: [{ description: itemName, amount }],
        subtotal: amount,
        total: amount,
        paymentMethod: paymentMethod,
        status: 'Completed'
      });
      
    } catch (err) {
      console.error(err);
      showToast('Failed to generate receipt.', 'error');
    } finally {
      setIsPrintingLog(null);
    }
  };

  const handleAppleWallet = async () => {
    // ── Cache hit: QR already generated for this profile session ──────────
    // If both the QR data URL and the download URL are already in state,
    // skip the API call and QRCode generation — just reopen the modal.
    // The cache is cleared when the CustomerProfile component unmounts
    // (i.e., when the staff navigates to a different customer).
    if (walletQrUrl && walletPassDownloadUrl) {
      setIsWalletModalOpen(true);
      return;
    }

    // ── Cache miss: generate QR for the first time ─────────────────────────
    setAppleWalletStatus('loading');
    showToast('Preparing Apple Wallet integration...', 'ref');
    try {
      let downloadUrl = '';

      try {
        const headers: Record<string, string> = {};
        if (auth?.currentUser) {
          headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
        }
        const linkRes = await fetch(`/api/wallet/pass-link?customerId=${encodeURIComponent(customer.id)}&origin=${encodeURIComponent(window.location.origin)}`, {
          method: 'GET',
          headers
        });
        if (linkRes.ok) {
          const linkPayload = await linkRes.json();
          if (typeof linkPayload?.url === 'string' && linkPayload.url.trim()) {
            downloadUrl = linkPayload.url.trim();
          }
        }
      } catch (linkErr) {
        console.warn('[Wallet] Signed pass-link endpoint unavailable, falling back to legacy link:', linkErr);
      }

      // Fallback for legacy setups where pass-link endpoint/signing is not yet enabled
      if (!downloadUrl) {
        let baseOrigin = window.location.origin;
        if (publicAppUrl) {
          baseOrigin = publicAppUrl.replace(/\/$/, '');
        }
        downloadUrl = `${baseOrigin}/api/wallet/pass?customerId=${customer.id}&customerName=${encodeURIComponent(customer.name)}`;
      }
       
      // 2. Generate high-resolution QR with branding colors and low margin
      const qrDataUrl = await QRCode.toDataURL(downloadUrl, {
        width: 350,
        margin: 2,
        color: {
          dark: '#2E331F', // olive-dark for strict brand alignment
          light: '#FFFFFF'
        }
      });

      setWalletPassDownloadUrl(downloadUrl);
      setWalletQrUrl(qrDataUrl);
      setIsWalletModalOpen(true);
      setAppleWalletStatus(null);
      showToast('Scan QR Code to add to phone!', 'success');
    } catch (err: any) {
      console.error(err);
      setAppleWalletStatus(null);
      showToast(err.message || 'Could not prepare QR Code.', 'error');
    }
  };

  const submitWalletTopUp = async () => {
    if (!topUpAmount || topUpAmount <= 0) {
      showToast(language === 'ar' ? 'يرجى إدخال مبلغ صحيح' : 'Please enter a valid amount', 'error');
      return;
    }
    setIsProcessingTopUp(true);
    try {
      const customerRef = doc(db, 'customers', customer.id);
      await updateDoc(customerRef, {
        walletBalance: increment(topUpAmount)
      });
      
      await addDoc(collection(db, 'auditLogs'), {
        customerId: customer.id,
        action: 'Manual Top-Up',
        description: `Wallet top-up of ${topUpAmount} ${currency}.${topUpNotes ? ' Note: ' + topUpNotes : ''}`,
        timestamp: new Date().toISOString(),
        staffName: staffName,
        branch: branch
      });
      
      showToast(language === 'ar' ? 'تم شحن الرصيد بنجاح!' : 'Wallet balance topped up successfully!');
      setIsTopUpModalOpen(false);
      setTopUpAmount('');
      setTopUpNotes('');
      
      // Trigger Apple Wallet pass update so the new balance appears on the card
      triggerWalletUpdate(customer.id);
      
      if (onCustomerUpdated) {
        onCustomerUpdated({ ...customer, walletBalance: (customer.walletBalance || 0) + Number(topUpAmount) });
      }
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'فشل شحن الرصيد.' : 'Failed to top up wallet.', 'error');
    } finally {
      setIsProcessingTopUp(false);
    }
  };

  const hasActiveGym = packages.some(p => p.category === 'gym' && p.isActive);
  const [isCoffeeModalOpen, setIsCoffeeModalOpen] = useState(false);
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState<number | ''>('');
  const [topUpNotes, setTopUpNotes] = useState('');
  const [isProcessingTopUp, setIsProcessingTopUp] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);

  // States for Block Customer
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isProcessingBlock, setIsProcessingBlock] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const handleDeleteProfile = async () => {
    setIsDeletingProfile(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        const customerRef = doc(db, 'customers', customer.id);
        await updateDoc(customerRef, {
          isDeleted: true,
          deletedAt: new Date().toISOString()
        });
        
        await addDoc(collection(db, 'auditLogs'), {
          customerId: customer.id,
          action: 'Delete Profile',
          description: `Customer profile was deleted/archived.`,
          timestamp: new Date().toISOString(),
          staffName: staffName,
          branch: branch
        });

        triggerWalletUpdate(customer.id).catch(() => {});
        showToast(language === 'ar' ? 'تم حذف الملف بنجاح' : 'Profile deleted successfully', 'success');
        setIsDeleteModalOpen(false);
        onBack();
      } else {
        showToast(language === 'ar' ? 'لا يمكن الحذف حالياً بدون إنترنت' : 'Cannot delete profile while offline', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء الحذف' : 'Failed to delete profile', 'error');
    } finally {
      setIsDeletingProfile(false);
    }
  };

  const handleBlockCustomer = async () => {
    setIsProcessingBlock(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        const now = new Date().toISOString();
        const batch = writeBatch(db);
        const customerRef = doc(db, 'customers', customer.id);
        
        batch.update(customerRef, {
          isBlocked: true,
          blockedAt: now,
          blockedBy: staffName,
          blockedReason: blockReason.trim() || null
        });

        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          customerId: customer.id,
          action: 'Block Customer',
          description: `Customer blocked from all branches.${blockReason.trim() ? ' Reason: ' + blockReason.trim() : ''}`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);

        await batch.commit();
        showToast(language === 'ar' ? 'تم حظر العميل من جميع الفروع' : 'Customer blocked from all branches', 'success');
        setIsBlockModalOpen(false);
        setBlockReason('');
        
        if (onCustomerUpdated) {
          onCustomerUpdated({ ...customer, isBlocked: true, blockedAt: now, blockedBy: staffName, blockedReason: blockReason.trim() || undefined });
        }
        fetchProfileData();
      } else {
        showToast(language === 'ar' ? 'لا يمكن الحظر حالياً بدون إنترنت' : 'Cannot block customer while offline', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء حظر العميل' : 'Failed to block customer', 'error');
    } finally {
      setIsProcessingBlock(false);
    }
  };

  const handleUnblockCustomer = async () => {
    setIsProcessingBlock(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        const now = new Date().toISOString();
        const batch = writeBatch(db);
        const customerRef = doc(db, 'customers', customer.id);
        
        batch.update(customerRef, {
          isBlocked: false,
          blockedAt: null,
          blockedBy: null,
          blockedReason: null
        });

        const logRef = doc(collection(db, 'auditLogs'));
        batch.set(logRef, {
          customerId: customer.id,
          action: 'Unblock Customer',
          description: `Customer unblocked and access restored to all branches.`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);

        await batch.commit();
        showToast(language === 'ar' ? 'تم إلغاء حظر العميل بنجاح' : 'Customer unblocked successfully', 'success');
        setIsBlockModalOpen(false);
        
        if (onCustomerUpdated) {
          onCustomerUpdated({ ...customer, isBlocked: false, blockedAt: undefined, blockedBy: undefined, blockedReason: undefined });
        }
        fetchProfileData();
      } else {
        showToast(language === 'ar' ? 'لا يمكن إلغاء الحظر حالياً بدون إنترنت' : 'Cannot unblock customer while offline', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'حدث خطأ أثناء إلغاء الحظر' : 'Failed to unblock customer', 'error');
    } finally {
      setIsProcessingBlock(false);
    }
  };

  const handleUpdateGymAccess = async (access: 'member' | 'staff' | 'family') => {
    if (!isFirebaseConfigured || !db || !navigator.onLine) {
      showToast(language === 'ar' ? 'لا يمكن تحديث الصلاحيات بدون إنترنت' : 'Cannot update access while offline', 'error');
      return;
    }
    try {
      const customerRef = doc(db, 'customers', customer.id);
      const batch = writeBatch(db);
      
      batch.update(customerRef, {
        gymAccess: access
      });

      const accessNames = {
        member: language === 'ar' ? 'عضو (باشتراك)' : 'Member',
        staff: language === 'ar' ? 'موظف (دخول دائم)' : 'Staff (Always Open)',
        family: language === 'ar' ? 'عائلة (دخول دائم)' : 'Family (Always Open)'
      };

      const logRef = doc(collection(db, 'auditLogs'));
      batch.set(logRef, {
        customerId: customer.id,
        action: 'Profile Update',
        description: `Gym access level changed to: ${accessNames[access]}`,
        timestamp: new Date().toISOString(),
        staffName,
        staffId,
        branch
      } as AuditLog);

      await batch.commit();
      
      if (onCustomerUpdated) {
        onCustomerUpdated({ ...customer, gymAccess: access });
      }
      showToast(language === 'ar' ? 'تم تحديث صلاحية الدخول' : 'Access level updated', 'success');
      fetchProfileData();
    } catch (err) {
      console.error(err);
      showToast(language === 'ar' ? 'فشل التحديث' : 'Update failed', 'error');
    }
  };

  const activeGymPackage = packages.find(p => {
    if (p.category !== 'gym' || !p.isActive) return false;
    if (!p.endDate) return true;
    const end = new Date(p.endDate);
    end.setHours(23, 59, 59, 999);
    return end >= new Date();
  });
  const isGymFrozen = activeGymPackage?.isFrozen && activeGymPackage?.frozenUntil && new Date(activeGymPackage.frozenUntil) > new Date();
  const salonPackages = packages.filter(p => p.category === 'salon' && p.remainingSessions > 0);
  const activeSalonPackagesCount = salonPackages.length;

  return (
    <div className="w-full flex flex-col pt-6 pb-12 animate-fade-in relative">
      
      {/* Navigation & Header */}
      <button 
        onClick={onBack}
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-brand-olive transition-colors mb-6 w-fit cursor-pointer font-sans"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t('customerProfile.search_card_back')}</span>
      </button>

      <div className={`bg-white border ${customer.isBlocked ? 'border-rose-300' : 'border-olive-light'} rounded-2xl shadow-sm overflow-hidden mb-6`}>
        {/* Blocked Customer Banner */}
        {customer.isBlocked && (
          <div className="bg-rose-600 text-white px-6 py-4 flex items-center gap-3 animate-fade-in">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <ShieldBan className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm uppercase tracking-wider">
                {language === 'ar' ? '⛔ هذا العميل محظور من جميع الفروع' : '⛔ This Customer is Blocked from All Branches'}
              </h4>
              <p className="text-[11px] text-rose-100 mt-0.5 leading-relaxed">
                {language === 'ar' 
                  ? `لا يمكن إجراء أي معاملة على هذا الحساب. ${customer.blockedReason ? 'السبب: ' + customer.blockedReason : ''} ${customer.blockedBy ? '• الحظر بواسطة: ' + customer.blockedBy : ''}` 
                  : `No transactions can be performed on this account. ${customer.blockedReason ? 'Reason: ' + customer.blockedReason : ''} ${customer.blockedBy ? '• Blocked by: ' + customer.blockedBy : ''}`
                }
              </p>
            </div>
          </div>
        )}

        {/* Top Banner Accent */}
        <div className={`h-16 ${customer.isBlocked ? 'bg-linear-to-r from-rose-700 to-rose-500 opacity-60' : 'bg-linear-to-r from-olive-dark to-brand-olive opacity-90'}`} />
        
        <div className="px-6 md:px-10 pb-8 relative">
          {/* Avatar overlap */}
          <div className="absolute -top-10 border-4 border-white bg-olive-soft w-20 h-20 rounded-full flex items-center justify-center shadow-sm">
            <User className="w-8 h-8 text-brand-olive" />
          </div>

          <div className="pt-12 flex flex-col md:flex-row md:items-start justify-between gap-6 text-start">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="font-serif text-3xl font-extrabold text-olive-dark tracking-tight">
                  {customer.name}
                </h2>
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => setIsEditModalOpen(true)}
                      className="p-1.5 text-gray-400 hover:text-brand-olive hover:bg-olive-soft rounded-lg transition-colors cursor-pointer"
                      title={language === 'ar' ? 'تعديل الملف' : 'Edit Profile'}
                    >
                      <Edit3 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setIsDeleteModalOpen(true)}
                      className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title={language === 'ar' ? 'حذف الملف' : 'Delete Profile'}
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    <button 
                      onClick={() => setIsBlockModalOpen(true)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        customer.isBlocked 
                          ? 'text-green-500 hover:text-green-600 hover:bg-green-50' 
                          : 'text-gray-400 hover:text-rose-600 hover:bg-rose-50'
                      }`}
                      title={customer.isBlocked 
                        ? (language === 'ar' ? 'إلغاء حظر العميل' : 'Unblock Customer') 
                        : (language === 'ar' ? 'حظر العميل' : 'Block Customer')}
                    >
                      {customer.isBlocked ? <ShieldCheck className="w-5 h-5" /> : <ShieldBan className="w-5 h-5" />}
                    </button>
                  </div>
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 text-sm text-gray-500 font-mono">
                  <Phone className="w-4 h-4 text-brand-olive" />
                  {customer.phone}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 font-medium font-sans">
                  <CalendarClock className="w-4 h-4 text-gray-300" />
                  <span>
                    {language === 'ar' 
                      ? `${t('customerProfile.registered_since')} ${new Date(customer.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}` 
                      : `Joined ${new Date(customer.createdAt).toLocaleDateString()}`
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-2 w-full md:w-auto font-sans">
              <button 
                onClick={() => onPurchase('salon')}
                disabled={!!customer.isBlocked}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-olive-soft hover:bg-olive-light border border-brand-olive/30 text-olive-dark text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-olive-soft"
              >
                <Tag className="w-4 h-4 text-brand-olive" />
                <span>{language === 'ar' ? 'شراء بطاقة صالون' : 'Add Package'}</span>
              </button>
              <button 
                onClick={() => onPurchase('gym')}
                disabled={!!customer.isBlocked}
                className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-olive-dark hover:bg-olive-dark-hover text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-olive-dark"
              >
                <Dumbbell className="w-4 h-4" />
                <span>{language === 'ar' ? 'شراء عضوية جيم' : 'Add Gym'}</span>
              </button>
              {isCafeBranchEnabled(branch) && (
                <button 
                  onClick={() => setIsCoffeeModalOpen(true)}
                  disabled={!!customer.isBlocked}
                  className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#8C5E58] hover:bg-[#7A504B] text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#8C5E58]"
                >
                  <Coffee className="w-4 h-4" />
                  <span>{t('cafe.sales_button')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Integration & Cards Actions Row */}
          <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t border-gray-100 font-sans">
            <button
              onClick={handlePrintCard}
              disabled={isPrinting}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-olive-dark hover:bg-gray-50 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer disabled:opacity-50"
            >
              {isPrinting ? <div className="w-4 h-4 border-2 border-olive-dark border-t-transparent rounded-full animate-spin" /> : <Printer className="w-4 h-4 text-gray-500" />}
              <span>{isPrinting ? (language === 'ar' ? 'جاري التحضير...' : 'Printing...') : (language === 'ar' ? 'طباعة بطاقة ورقية' : 'Print Physical Card')}</span>
            </button>
            <button
              onClick={() => setIsInvoicesModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-olive-dark hover:bg-gray-50 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-gray-500" />
              <span>{language === 'ar' ? 'عرض الفواتير والرصيد' : 'View Invoices & Receipts'}</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleAppleWallet}
                disabled={appleWalletStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-black text-white hover:bg-gray-900 text-xs font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                {appleWalletStatus === 'loading' ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Wallet className="w-4 h-4 animate-pulse" />}
                <span>{language === 'ar' ? 'إرسال لـ Apple Wallet' : 'Add to Apple Wallet'}</span>
              </button>
            </div>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Account Status Badges & Packages */}
        <div className="lg:col-span-1 flex flex-col gap-4 text-start">
          {/* Wallet Balance Section */}
          <div className="bg-white border border-olive-light p-5 rounded-xl shadow-sm flex flex-col mb-2">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center text-green-600 shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-olive-dark text-base leading-tight">
                    {language === 'ar' ? 'رصيد العميل' : 'Wallet Balance'}
                  </h4>
                  <p className="text-[10px] text-gray-400 font-sans mt-0.5">
                    {language === 'ar' ? 'الرصيد المتاح للاستخدام' : 'Available balance for purchases'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between mt-2">
              <div className="text-3xl font-extrabold text-brand-olive tracking-tight">
                {(customer.walletBalance || 0).toFixed(3)} <span className="text-sm font-medium text-gray-500 uppercase">{currency}</span>
              </div>
              <button
                onClick={() => setIsTopUpModalOpen(true)}
                disabled={!!customer.isBlocked}
                className="px-4 py-2 bg-brand-olive hover:bg-olive-dark text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {language === 'ar' ? 'شحن الرصيد' : 'Top-Up Balance'}
              </button>
            </div>
          </div>

          {/* Family Members Section */}
          <div className="bg-white border border-olive-light p-5 rounded-xl shadow-sm flex flex-col mb-2">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-serif font-bold text-olive-dark text-base leading-tight">
                    {language === 'ar' ? 'حسابات العائلة' : 'Family Accounts'}
                  </h4>
                  <p className="text-[10px] text-gray-400 font-sans mt-0.5">
                    {language === 'ar' ? 'ملفات التابعين بنفس رقم الهاتف' : 'Linked profiles with same phone'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsFamilyModalOpen(true)}
                className="p-1.5 bg-olive-soft text-brand-olive hover:bg-olive-light rounded-lg transition-colors cursor-pointer"
                title={language === 'ar' ? 'إضافة تابع' : 'Add Family Member'}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>

            {familyMembers.length > 0 ? (
              <div className="flex flex-col gap-2 mt-1">
                {familyMembers.map(member => (
                  <div 
                    key={member.id} 
                    onClick={() => onCustomerUpdated && onCustomerUpdated(member)}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 hover:border-olive-light hover:bg-olive-soft/30 cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:text-brand-olive group-hover:bg-white transition-colors">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-olive-dark group-hover:text-brand-olive transition-colors">
                          {member.name}
                        </span>
                        {member.parentId === customer.id ? (
                          <span className="text-[9px] text-gray-400">{language === 'ar' ? 'حساب تابع' : 'Dependent'}</span>
                        ) : member.id === customer.parentId ? (
                          <span className="text-[9px] font-bold text-brand-olive">{language === 'ar' ? 'الحساب الرئيسي' : 'Primary Account'}</span>
                        ) : (
                          <span className="text-[9px] text-gray-400">{language === 'ar' ? 'ملف مرتبط' : 'Linked Profile'}</span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-300 group-hover:text-brand-olive transition-all ${language === 'ar' ? 'rotate-180' : ''}`} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                <span className="text-xs text-gray-400 font-medium">
                  {language === 'ar' ? 'لا توجد حسابات تابعة' : 'No linked accounts'}
                </span>
              </div>
            )}
          </div>

          <h3 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1 px-1 font-sans">
            {language === 'ar' ? 'الاشتراكات والعضويات الحالية' : 'Current Memberships'}
          </h3>
          
          {!isQatarBranch(branch) && (
            <div className="bg-white border border-olive-light p-5 rounded-xl shadow-sm flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 shrink-0">
                <Dumbbell className="w-5 h-5" />
              </div>
            <div>
              <h4 className="font-serif font-bold text-olive-dark text-base leading-tight">{language === 'ar' ? 'حالة عضوية الجيم' : 'Gym Pass Status'}</h4>
              {hasActiveGym ? (
                <div className="space-y-2 mt-1.5 text-start">
                  {isGymFrozen ? (
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded w-fit font-sans">
                      <Snowflake className="w-3.5 h-3.5" />
                      {language === 'ar' ? 'عضوية مجمدة' : 'Frozen Membership'}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded w-fit font-sans">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {language === 'ar' ? 'عضوية نشطة وصالحة' : 'Active Membership'}
                    </div>
                  )}
                  {activeGymPackage && (
                    <div className="flex justify-between items-start gap-2">
                      {activeGymPackage.startDate && activeGymPackage.endDate ? (
                        <div className="flex-1 text-[11px] text-gray-600 bg-olive-soft/40 border border-olive-light/50 rounded-lg p-2 space-y-1 font-sans mt-2">
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-400">{language === 'ar' ? 'تاريخ البدء:' : 'Start:'}</span>
                            <span className="font-mono font-bold text-olive-dark">{activeGymPackage.startDate}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-gray-400">{language === 'ar' ? 'ينتهي في:' : 'Expires:'}</span>
                            <span className="font-mono font-bold text-rose-600">{activeGymPackage.endDate}</span>
                          </div>
                        </div>
                      ) : <div className="flex-1" />}
                      <div className="flex flex-col gap-1 items-center justify-center shrink-0">
                        {isGhostPackage(activeGymPackage) && (
                          <button 
                            onClick={() => setResolvingGhostPackage(activeGymPackage)}
                            className="p-1.5 text-rose-500 hover:text-rose-600 bg-rose-50 rounded-lg transition-colors cursor-pointer border border-rose-100 mt-2"
                            title={language === 'ar' ? 'باقة مجهولة بدون هيستوري - انقر للمراجعة' : 'Ghost package (no history) - click to resolve'}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => openEditPackageModal(activeGymPackage)}
                          className="p-1.5 mt-2 text-gray-400 hover:text-brand-olive hover:bg-olive-soft rounded-lg transition-colors cursor-pointer border border-transparent hover:border-olive-light"
                          title={language === 'ar' ? 'تعديل الباقة' : 'Edit Package'}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-400 leading-relaxed font-sans">
                  {language === 'ar' ? 'لا يوجد اشتراك جيم نشط حالياً لهذا العميل. اضغط "شراء عضوية جيم" للتفعيل.' : "No active gym membership found. Click 'Add Gym' to provision access."}
                </p>
              )}

              {/* Gym Access Level Selector */}
              <div className="mt-5 pt-5 border-t border-gray-100 font-sans">
                <div className="flex items-center gap-2 mb-3">
                  <KeyRound className="w-4 h-4 text-brand-olive" />
                  <span className="text-xs font-bold text-olive-dark uppercase tracking-wider">
                    {language === 'ar' ? 'صلاحية دخول البوابة' : 'Gate Access Level'}
                  </span>
                </div>
                <div className="flex bg-gray-50 p-1 rounded-lg">
                  <button
                    onClick={() => handleUpdateGymAccess('member')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase transition-colors ${(!customer.gymAccess || customer.gymAccess === 'member') ? 'bg-white text-olive-dark shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 cursor-pointer'}`}
                  >
                    {language === 'ar' ? 'عضو' : 'Member'}
                  </button>
                  <button
                    onClick={() => handleUpdateGymAccess('staff')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase transition-colors ${customer.gymAccess === 'staff' ? 'bg-brand-olive text-white shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 cursor-pointer'}`}
                  >
                    {language === 'ar' ? 'موظف' : 'Staff'}
                  </button>
                  <button
                    onClick={() => handleUpdateGymAccess('family')}
                    className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase transition-colors ${customer.gymAccess === 'family' ? 'bg-brand-olive text-white shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:bg-gray-100 cursor-pointer'}`}
                  >
                    {language === 'ar' ? 'عائلة' : 'Family'}
                  </button>
                </div>
                {customer.gymAccess && customer.gymAccess !== 'member' && (
                  <p className="text-[10px] text-brand-olive mt-2 font-medium bg-olive-soft/50 p-2 rounded flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {language === 'ar' 
                      ? 'البوابة ستفتح تلقائياً دائماً لهذا الحساب بدون الحاجة لاشتراك نشط.' 
                      : 'Gate will always open for this account without needing an active subscription.'}
                  </p>
                )}
              </div>
            </div>
          </div>
          )}

          <div className="bg-white border border-olive-light p-5 rounded-xl shadow-sm flex flex-col">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-serif font-bold text-olive-dark text-base leading-tight">{language === 'ar' ? 'باقات وجلسات الصالون' : 'Salon Packages'}</h4>
                {activeSalonPackagesCount > 0 ? (
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-brand-olive bg-olive-light px-2 py-0.5 rounded w-fit font-sans">
                    {language === 'ar' ? `${activeSalonPackagesCount} باقة نشطة متبقية` : `${activeSalonPackagesCount} Active Packages`}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-gray-400 leading-relaxed font-sans">
                    {language === 'ar' ? 'لا توجد جلسات صالون متبقية. يرجى شراء باقة لشحن رصيد الجلسات.' : 'No pending salon sessions. Purchase a package to populate credits here.'}
                  </p>
                )}
              </div>
            </div>

            {/* List Active Salon Packages */}
            {activeSalonPackagesCount > 0 && (
              <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 mt-2 font-sans">
                {salonPackages.map(pkg => (
                  <div key={pkg.id} className="border border-olive-light rounded-lg p-3 bg-olive-soft/40">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="font-serif text-sm font-bold text-olive-dark block leading-tight">
                          {pkg.packageName}
                        </span>
                        {pkg.endDate && (
                          <span className="text-[10px] text-gray-400 block mt-1 font-sans">
                            {language === 'ar' ? 'تاريخ الانتهاء: ' : 'Expiry: '}<span className="font-mono font-bold text-rose-600">{pkg.endDate}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {isGhostPackage(pkg) && (
                          <button 
                            onClick={() => setResolvingGhostPackage(pkg)}
                            className="p-1 text-rose-500 hover:text-rose-600 bg-rose-50 rounded-md transition-colors cursor-pointer border border-rose-100 -mr-1.5 -mt-1.5"
                            title={language === 'ar' ? 'باقة مجهولة بدون هيستوري - انقر للمراجعة' : 'Ghost package (no history) - click to resolve'}
                          >
                            <AlertTriangle className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => openEditPackageModal(pkg)}
                          className={`p-1.5 text-gray-400 hover:text-brand-olive hover:bg-olive-light rounded-md transition-colors cursor-pointer shrink-0 ${isGhostPackage(pkg) ? '-mr-1.5' : '-mr-1.5 -mt-1.5'}`}
                          title={language === 'ar' ? 'تعديل الباقة' : 'Edit Package'}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-2.5">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                        {language === 'ar' ? `الجلسات: ${pkg.remainingSessions}/${pkg.totalSessions}` : `Sessions: ${pkg.remainingSessions}/${pkg.totalSessions}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {pkg.remainingSessions < pkg.totalSessions && (
                          <button 
                            onClick={() => handleUndoDeduct(pkg)}
                            disabled={isProcessingSession || !!customer.isBlocked}
                            className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-olive-dark transition-colors cursor-pointer disabled:opacity-50"
                            title={language === 'ar' ? 'تراجع عن الخصم الآخر' : 'Undo Session Deduction'}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeductId(pkg.id || null)}
                          disabled={isProcessingSession || !!customer.isBlocked}
                          className="px-2 py-1 bg-brand-olive text-white text-[10px] font-bold uppercase tracking-wider rounded-md hover:bg-brand-olive-hover transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {language === 'ar' ? 'خصم جلسة' : 'Deduct'}
                        </button>
                      </div>
                    </div>

                    {/* Deduction Warning Popup Inline */}
                    {confirmDeductId === pkg.id && (
                      <div className="mt-3 p-3 bg-white border border-rose-200 rounded text-center animate-fade-in shadow-sm">
                        <AlertTriangle className="w-4 h-4 text-rose-500 mx-auto mb-1.5" />
                        <span className="text-[10px] block font-bold text-olive-dark uppercase mb-2">{language === 'ar' ? 'تأكيد عملية الخصم المالي؟' : 'Confirm Deduction?'}</span>
                        <div className="flex justify-center gap-2">
                          <button 
                            onClick={() => setConfirmDeductId(null)}
                            className="px-3 py-1 bg-gray-100 text-gray-600 text-[10px] font-bold uppercase rounded cursor-pointer"
                          >
                            {t('common.cancel')}
                          </button>
                          <button 
                            onClick={() => handleDeductSession(pkg)}
                            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold uppercase rounded cursor-pointer transition-colors"
                          >
                            {language === 'ar' ? 'خصم جلسة واحدة' : 'Deduct 1 Session'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Lifetime History Log */}
        <div className="lg:col-span-2 text-start">
          <h3 className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-2 px-1 font-sans">
            {language === 'ar' ? 'سجل العمليات والزيارات والتدقيق للعميل' : 'Activity & Transaction Audit'}
          </h3>

          <div className="bg-white border border-olive-light rounded-xl shadow-sm p-6 min-h-75 flex flex-col max-h-150 overflow-y-auto">
            {loading ? (
              <div className="m-auto flex flex-col items-center justify-center text-gray-400 font-sans">
                <div className="w-6 h-6 border-2 border-brand-olive border-t-transparent rounded-full animate-spin mb-3" />
                <span className="text-[10px] uppercase tracking-widest font-bold">{language === 'ar' ? 'جاري تحميل سجل التدقيق...' : 'Fetching Audit Log...'}</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="m-auto flex flex-col items-center text-center text-gray-400 my-10 font-sans">
                <div className="w-14 h-14 bg-olive-soft rounded-full flex items-center justify-center text-gray-300 mb-3">
                  <History className="w-6 h-6" />
                </div>
                <h4 className="font-serif text-lg font-bold text-olive-dark">{language === 'ar' ? 'سجل العمليات فارغ' : 'Audit Log Clean'}</h4>
                <p className="text-xs max-w-sm mt-1.5 leading-relaxed">
                  {language === 'ar' ? 'سيسجل هذا الحقل جميع عمليات البيع والدفع وخصم وإرجاع الجلسات بترتيبها الزمني فور حدوثها.' : 'This area will log every transaction, checkout, and session deduction chronologically as they happen.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-linear-to-b before:from-transparent before:via-olive-light/50 before:to-transparent">
                {auditLogs.map((log, idx) => {
                  let badgeColors = 'bg-gray-100 text-gray-600';
                  let Icon = Minus;
                  let displayAction = log.action;
                  const logDate = new Date(log.timestamp);
                  const hasValidLogDate = !Number.isNaN(logDate.getTime());
                  const logDateText = hasValidLogDate
                    ? logDate.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-GB')
                    : (language === 'ar' ? 'تاريخ غير متاح' : 'Date unavailable');
                  const logTimeText = hasValidLogDate
                    ? logDate.toLocaleTimeString(language === 'ar' ? 'ar-EG' : [], { hour: '2-digit', minute: '2-digit' })
                    : '--:--';

                  if (log.action === 'Purchase') {
                    badgeColors = 'bg-green-100 text-green-700 border-green-200';
                    Icon = ShoppingBag;
                    displayAction = language === 'ar' ? 'عملية شراء' : 'Purchase';
                  } else if (log.action === 'Deduct') {
                    badgeColors = 'bg-orange-100 text-orange-700 border-orange-200';
                    Icon = Minus;
                    displayAction = language === 'ar' ? 'خصم جلسة' : 'Deduct';
                  } else if (log.action === 'Undo') {
                    badgeColors = 'bg-purple-100 text-purple-700 border-purple-200';
                    Icon = RotateCcw;
                    displayAction = language === 'ar' ? 'تراجع وإرجاع' : 'Undo';
                  } else if (log.action === 'Bonus Provision') {
                    badgeColors = 'bg-rose-100 text-rose-700 border-rose-200';
                    Icon = Tag;
                    displayAction = language === 'ar' ? 'مكافأة مميزة' : 'Bonus Provision';
                  } else if (log.action === 'Block Customer') {
                    badgeColors = 'bg-rose-200 text-rose-800 border-rose-300';
                    Icon = ShieldBan;
                    displayAction = language === 'ar' ? 'حظر العميل' : 'Block Customer';
                  } else if (log.action === 'Unblock Customer') {
                    badgeColors = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                    Icon = ShieldCheck;
                    displayAction = language === 'ar' ? 'إلغاء الحظر' : 'Unblock Customer';
                  }

                  return (
                    <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active mb-6">
                      
                      {/* Timeline Dot */}
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-olive-soft absolute left-0 md:left-1/2 -translate-y-4 sm:translate-y-0 transform md:-translate-x-1/2 z-10 text-brand-olive shadow-sm">
                        <Icon className="w-4 h-4" />
                      </div>
                      
                      {/* Content Box */}
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] ml-auto md:ml-0 md:mr-auto p-4 rounded-xl border border-olive-light bg-white shadow-sm hover:shadow-md transition-shadow font-sans">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${badgeColors}`}>
                              {displayAction}
                            </span>
                            {log.action === 'Purchase' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handlePrintLog(log); }}
                                disabled={isPrintingLog === log.id}
                                className="p-1 text-brand-olive bg-olive-soft hover:bg-brand-olive hover:text-white rounded transition-colors disabled:opacity-50"
                                title={language === 'ar' ? 'طباعة إيصال' : 'Print Receipt'}
                              >
                                {isPrintingLog === log.id ? (
                                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Printer className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                          <span className="text-[10px] font-mono text-gray-400">
                            {logDateText} • {logTimeText}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-olive-dark leading-snug">
                          {getTranslatedDescription(log.description)}
                        </p>
                        <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                          <span className="flex items-center gap-1 font-medium"><User className="w-3 h-3"/> {log.staffName}</span>
                          <span className="font-bold uppercase tracking-wider text-brand-olive/60">{log.branch}</span>
                        </div>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* LUXURY-MINIMAL APPLE WALLET MODAL */}
      {isWalletModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop with blurred glass effect */}
          <div 
            className="fixed inset-0 bg-olive-dark/45 backdrop-blur-md transition-opacity duration-300"
            onClick={() => setIsWalletModalOpen(false)}
          />

          {/* Modal Container */}
          <div className="relative bg-white border border-olive-light w-full max-w-md rounded-3xl shadow-2xl overflow-hidden transform duration-300 scale-100 z-10 font-sans">
            
            {/* Top Minimal Accent Line */}
            <div className="h-1.5 bg-brand-olive" />

            {/* Close Button Header */}
            <div className="p-4 flex justify-between items-center bg-olive-soft/50 border-b border-olive-light/40">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-brand-olive animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest font-bold text-gray-500 font-mono">
                  {language === 'ar' ? 'تكامل بطاقات حياة الذكية' : 'HAYAT Pass Integration'}
                </span>
              </div>
              <button 
                onClick={() => setIsWalletModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-olive-dark transition-colors cursor-pointer"
                title={language === 'ar' ? 'إغلاق' : 'Close'}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Main Showcase Panel */}
            <div className="p-6 md:p-8 flex flex-col items-center">
              
              {/* Luxury Styled Headers */}
              <div className="text-center mb-6">
                <span className="inline-block px-3 py-1 bg-olive-light text-brand-olive text-[10px] font-bold uppercase tracking-widest rounded-full mb-2">
                  {language === 'ar' ? 'بطاقة محفظة آبل الرياضية والجمالية' : 'Apple Wallet Pass'}
                </span>
                <h3 className="font-serif text-2xl font-black text-olive-dark tracking-tight">
                  {customer.name}
                </h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xs font-serif italic border-b border-olive-light pb-2.5 w-full">
                  {language === 'ar' ? 'مزامنة العضوية الفاخرة للخدمات' : 'Luxury Membership & Digital Card Sync'}
                </p>
              </div>

              {/* APPLE WALLET VISUAL CARD MOCKUP */}
              <div 
                className="w-full max-w-sm rounded-3xl shadow-xl overflow-hidden text-white mb-6 border border-white/20 relative flex flex-col p-5 font-sans"
                style={{ backgroundColor: 'rgb(125, 131, 78)' }}
              >
                {/* Decorative Apple Wallet Pass Notch cut design or minimal line */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-white/10 rounded-full" />
                
                {/* Card Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/15">
                  <div className="flex items-center gap-3">
                    <img 
                      src="/logo.png" 
                      alt="Hayat Logo" 
                      className="w-12 h-12 object-contain rounded-full bg-white/90 p-1 border border-white/20 shrink-0 shadow-sm"
                      onError={(e) => {
                        // Fallback in case of image load error
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex flex-col text-left">
                      <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-stone-200">
                        {language === 'ar' ? 'عضوية ذكية' : 'Digital Membership'}
                      </span>
                      <span className="text-xs font-bold font-sans tracking-wide text-white drop-shadow-sm">
                        Hayat Beauty And Care
                      </span>
                    </div>
                  </div>
                  <div className="text-right flex flex-col">
                    <span className="text-[8px] uppercase tracking-wider text-stone-200">
                      {language === 'ar' ? 'رقم العضوة' : 'Member ID'}
                    </span>
                    <span className="font-mono text-xs font-semibold tracking-wider text-stone-100">
                      #{customer.id.substring(0, 8).toUpperCase()}
                    </span>
                  </div>
                </div>

                {/* Card Body & Holder */}
                <div className="py-4 text-start">
                  <span className="text-[9px] uppercase tracking-widest text-stone-300 block mb-0.5">
                    {language === 'ar' ? 'اسم العضوة' : 'Member Name'}
                  </span>
                  <p className="text-lg font-bold tracking-tight text-white leading-none">
                    {customer.name}
                  </p>
                </div>

                {/* Live Subscription Status Details Grid */}
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/10 text-start">
                  {/* Gym Pass Column */}
                  {!isQatarBranch(branch) && (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex flex-col justify-between">
                      <div>
                        <span className="text-[8px] uppercase tracking-wider text-stone-300 font-semibold mb-1 block">
                        {language === 'ar' ? 'اشتراك الجيم' : 'Gym Membership'}
                      </span>
                      {hasActiveGym ? (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="text-[11px] font-bold text-green-300 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse shrink-0" />
                            {language === 'ar' ? 'نشط وصالح' : 'Active Pass'}
                          </span>
                          {activeGymPackage?.endDate && (
                            <span className="text-[9px] font-mono text-stone-200 mt-0.5">
                              {language === 'ar' ? 'ينتهي:' : 'Exp:'} {activeGymPackage.endDate}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-stone-300 font-medium">
                          {language === 'ar' ? 'غير مشترك' : 'Not Subscribed'}
                        </span>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Salon Pass Column */}
                  <div className="bg-white/5 border border-white/10 rounded-xl p-2.5 flex flex-col justify-between">
                    <div>
                      <span className="text-[8px] uppercase tracking-wider text-stone-300 font-semibold mb-1 block">
                        {language === 'ar' ? 'باقات وجلسات الصالون' : 'Salon Sessions'}
                      </span>
                      {salonPackages.length > 0 ? (
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <span className="text-xs font-black text-amber-300">
                            {salonPackages.reduce((acc, p) => acc + p.remainingSessions, 0)} {language === 'ar' ? 'جلسة متبقية' : 'Sessions Left'}
                          </span>
                          <span className="text-[8px] text-stone-200 leading-tight block">
                            {salonPackages.length} {language === 'ar' ? 'باقات نشطة' : 'active packages'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-stone-300 font-medium">
                          {language === 'ar' ? 'لا توجد باقات صالون' : 'No Active Sessions'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Card Sync Status pill */}
                <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[8px] text-stone-300 tracking-wider">
                  <span className="flex items-center gap-1 font-mono uppercase bg-black/20 px-2 py-0.5 rounded-full">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    {language === 'ar' ? 'متصل ومحدث دائمًا' : 'Real-time Linked'}
                  </span>
                  <span className="font-light">Apple Wallet integration</span>
                </div>
              </div>

              {/* QR Code Presentation Frame (Luxury Minimal Aesthetics) */}
              <div className="relative group p-4 bg-white border border-olive-light rounded-2xl shadow-sm mb-6 flex flex-col items-center transition-all duration-300 hover:shadow-md hover:border-brand-olive/40">
                {/* Decorative Corners for luxurious design */}
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-brand-olive rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-brand-olive rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-brand-olive rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-brand-olive rounded-br-lg" />
                
                {walletQrUrl ? (
                  <img 
                    src={walletQrUrl} 
                    alt="Apple Wallet Pass QR Code" 
                    className="w-48 h-48 sm:w-56 sm:h-56 object-contain rounded-lg p-1 aspect-square"
                    referrerPolicy="no-referrer"
                    id="apple-wallet-qr-image"
                  />
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center bg-gray-50 text-gray-300 font-mono text-xs">
                    {language === 'ar' ? 'جاري إنتاج الكود...' : 'Loading QR Code...'}
                  </div>
                )}
              </div>

              {/* Dynamic Environment & Tunnel Mode Warning Banners */}
              {(() => {
                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                const isIframePreview = window.location.hostname.includes('run.app') || window.location.hostname.includes('aistudio');
                const showDevNotice = (isLocal || isIframePreview) && !publicAppUrl;

                if (showDevNotice) {
                  return (
                    <div className="w-full mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      <div className="flex items-center gap-2 mb-1.5 font-bold justify-start">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          {language === 'ar' 
                            ? 'معاينة تجريبية للنظام (تنبيه هام للـ Apple Wallet)' 
                            : 'Sandbox Preview Mode (Important Apple Wallet Note)'}
                        </span>
                      </div>
                      <p className="leading-relaxed text-right text-gray-700 font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                        {language === 'ar' ? (
                          <>
                            أنت تقوم حالياً بمعاينة التطبيق في نظام التطوير التجريبي. عند مسح الـ QR بكاميرا هاتفك المحمول، 
                            قد لا تتعرف المحفظة عليه لأن عنوان التطبيق الحالي محمي ومغلق بمصادقة غوغل للتطوير.
                            <br /><br />
                            <strong className="text-amber-950 font-bold block mb-1">كيف تجرب البطاقات وتثبتها بنجاح الآن؟</strong>
                            1. اضغط على زر <strong className="text-olive-dark font-bold">"تنزيل مباشر للبطاقة"</strong> بالأسفل لتحميل البطاقة مباشرة على كمبيوترك أو هاتفك الجاري تصفحه.
                            <br />
                            2. بالنسبة لدعم الهاتف (المسح بالكاميرا)، سيعمل 100% وبشكل فوري بمجرد ربط التطبيق بنطاقك المباشر <strong className="text-olive-dark font-bold">hayat.beauty</strong> أو وضع عنوان الرابط في الإعدادات.
                          </>
                        ) : (
                          <>
                            You are previewing this app in the developer sandbox. Scanning this QR using an external phone camera 
                            may fail because this preview instance requires Google AI Studio authentication to access API endpoints.
                            <br /><br />
                            <strong className="text-amber-950 font-bold block mb-1">To test or install your Apple Wallet pass:</strong>
                            1. Press <strong className="text-olive-dark font-bold">"Direct Download Pass"</strong> below to download the compiled card file (.pkpass) straight to your current browser window.
                            2. Rest assured, scanning with external phone cameras will work flawlessly instantly once your custom domain <strong className="text-olive-dark font-bold">hayat.beauty</strong> is connected publicly.
                          </>
                        )}
                      </p>
                    </div>
                  );
                }

                if (publicAppUrl && (isLocal || isIframePreview)) {
                  return (
                    <div className="w-full mb-4 bg-green-50 border border-green-200 rounded-2xl p-4 text-xs text-green-800" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                      <div className="flex items-center gap-2 mb-1 font-bold justify-start">
                        <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                        <span>
                          {language === 'ar' ? 'وضع التوصيل العام نشط' : 'Active Connected Tunnel'}
                        </span>
                      </div>
                      <p className="leading-relaxed text-right text-gray-700 font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                        {language === 'ar' 
                          ? 'رائع! يتم استخدام الرابط أدناه لإصدار بطاقات آبل واليت وتفريغ بياناتها بنجاح للعملاء:' 
                          : 'Splendid! The following public endpoint is currently being used to generate Apple Wallet passes:'}
                        <span className="font-mono bg-green-100 p-1.5 rounded break-all select-all block mt-1.5 text-center font-bold text-olive-dark">{publicAppUrl}</span>
                      </p>
                    </div>
                  );
                }

                return null;
              })()}

              {/* Step-by-Step Scan Instructions */}
              <div className="w-full bg-olive-soft border border-olive-light/60 rounded-2xl p-4 mb-6">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-olive-dark mb-3 flex items-center gap-1.5" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  <span className="p-1 bg-brand-olive text-white rounded-md"><Wallet className="w-3.5 h-3.5"/></span>
                  {language === 'ar' ? 'كيفية إضافة البطاقة إلى هاتفك:' : 'How to install the digital pass on your phone:'}
                </h4>
                
                <ul className="space-y-3 text-xs text-gray-600" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  <li className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-olive-light text-brand-olive font-bold text-[10px] shrink-0 mt-0.5">
                      1
                    </span>
                    <span className="text-right">
                      {language === 'ar' 
                        ? 'افتح تطبيق الكاميرا (Camera) على جهاز الـ iPhone الخاص بك.' 
                        : 'Open the Camera application on your iPhone device.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-olive-light text-brand-olive font-bold text-[10px] shrink-0 mt-0.5">
                      2
                    </span>
                    <span className="text-right">
                      {language === 'ar' 
                        ? 'وجّه الكاميرا نحو الـ QR Code ليتعرف عليه الهاتف تلقائياً.' 
                        : 'Point the lens towards the QR Code on display.'}
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-olive-light text-brand-olive font-bold text-[10px] shrink-0 mt-0.5">
                      3
                    </span>
                    <span className="text-right">
                      {language === 'ar' 
                        ? 'اضغط على الرابط الأصفر المنبثق لتفتح البطاقة، ثم اضغط على "إضافة" (Add).' 
                        : 'Click on the yellow link and press "Add to Apple Wallet".'}
                    </span>
                  </li>
                </ul>
              </div>

              {/* Desktop direct download fallback button */}
              <div className="w-full flex flex-col sm:flex-row gap-2.5">
                <a
                  href={walletPassDownloadUrl}
                  download={`Hayat_Membership_${customer.id}.pkpass`}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-olive-dark hover:bg-olive-dark-hover text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer shadow-md font-sans"
                  onClick={() => setIsWalletModalOpen(false)}
                  id="direct-download-apple-pass-btn"
                >
                  <Wallet className="w-4 h-4" />
                  <span>{language === 'ar' ? 'تنزيل مباشر للبطاقة' : 'Direct Download Pass'}</span>
                </a>
                <button
                  onClick={() => setIsWalletModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 hover:bg-gray-50 text-gray-500 hover:text-olive-dark text-xs font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer font-sans"
                  id="close-wallet-modal-btn"
                >
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-start">
            <div className="px-6 py-4 border-b border-olive-light flex items-center justify-between bg-olive-soft/40">
              <h3 className="font-serif font-bold text-lg text-olive-dark text-start">
                {language === 'ar' ? 'تعديل بيانات العميل' : 'Edit Customer Profile'}
              </h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-olive-dark transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 text-start">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-start">
                  {language === 'ar' ? 'اسم العميل' : 'Customer Name'}
                </label>
                <input 
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm text-start bg-white text-olive-dark"
                />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-start">
                  {language === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                </label>
                <input 
                  type="text"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-mono text-start bg-white text-olive-dark"
                />
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSavingEdit || !editName.trim() || !editPhone.trim()}
                  className="px-6 py-2 bg-olive-dark text-white rounded-lg hover:bg-olive-dark-hover disabled:bg-gray-300 text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center"
                >
                  {isSavingEdit ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    language === 'ar' ? 'حفظ التغييرات' : 'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-start">
            <div className="px-6 py-4 border-b border-rose-100 flex items-center gap-3 bg-rose-50/50">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="font-serif font-bold text-lg text-rose-600 text-start">
                {language === 'ar' ? 'تأكيد الحذف' : 'Confirm Deletion'}
              </h3>
            </div>
            
            <div className="p-6 flex flex-col gap-4 text-start">
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                {language === 'ar' 
                  ? `هل أنت متأكد من رغبتك في حذف ملف العميل (${customer.name})؟`
                  : `Are you sure you want to delete the profile for (${customer.name})?`
                }
              </p>
              
              <div className="p-4 bg-rose-50/50 border border-rose-100 rounded-xl">
                <p className="text-xs text-rose-600 font-bold leading-relaxed">
                  {language === 'ar' 
                    ? 'تنبيه هام: سيؤدي هذا الإجراء إلى حذف الملف بالكامل وإخفائه، ولن يظهر العميل أو باقاته في قائمة البحث بعد الآن.'
                    : 'Warning: This will archive the entire profile, and the customer will no longer appear in search.'
                  }
                </p>
              </div>

              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeletingProfile}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={handleDeleteProfile}
                  disabled={isDeletingProfile}
                  className="flex-1 px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:bg-rose-300 text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2"
                >
                  {isDeletingProfile ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      {language === 'ar' ? 'حذف الملف' : 'Delete Profile'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block/Unblock Customer Modal */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-start">
            <div className={`px-6 py-4 border-b flex items-center gap-3 ${customer.isBlocked ? 'border-green-100 bg-green-50/50' : 'border-rose-100 bg-rose-50/50'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${customer.isBlocked ? 'bg-green-100 text-green-600' : 'bg-rose-100 text-rose-600'}`}>
                {customer.isBlocked ? <ShieldCheck className="w-5 h-5" /> : <ShieldBan className="w-5 h-5" />}
              </div>
              <h3 className={`font-serif font-bold text-lg text-start ${customer.isBlocked ? 'text-green-700' : 'text-rose-600'}`}>
                {customer.isBlocked 
                  ? (language === 'ar' ? 'إلغاء حظر العميل' : 'Unblock Customer')
                  : (language === 'ar' ? 'حظر العميل' : 'Block Customer')
                }
              </h3>
            </div>
            
            <div className="p-6 flex flex-col gap-4 text-start">
              <p className="text-sm text-gray-600 leading-relaxed font-medium">
                {customer.isBlocked 
                  ? (language === 'ar' 
                      ? `هل أنت متأكد من رغبتك في إلغاء حظر العميل (${customer.name})؟ سيتمكن الموظفون من إجراء المعاملات على هذا الحساب مرة أخرى في جميع الفروع.`
                      : `Are you sure you want to unblock (${customer.name})? Staff will be able to perform transactions on this account again across all branches.`)
                  : (language === 'ar'
                      ? `هل أنت متأكد من حظر العميل (${customer.name})؟`
                      : `Are you sure you want to block (${customer.name})?`)
                }
              </p>
              
              {!customer.isBlocked && (
                <>
                  <div className={`p-4 bg-rose-50/50 border border-rose-100 rounded-xl`}>
                    <p className="text-xs text-rose-600 font-bold leading-relaxed">
                      {language === 'ar' 
                        ? '⚠️ تنبيه: سيتم حظر هذا العميل من جميع الفروع. لن يتمكن أي موظف من إجراء أي معاملة (شراء، خصم جلسات، شحن رصيد) على هذا الحساب حتى يتم إلغاء الحظر.'
                        : '⚠️ Warning: This will block the customer from ALL branches. No staff member will be able to perform any transaction (purchase, deduct sessions, top-up) on this account until unblocked.'
                      }
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-start">
                      {language === 'ar' ? 'سبب الحظر (اختياري)' : 'Block Reason (Optional)'}
                    </label>
                    <textarea
                      value={blockReason}
                      onChange={e => setBlockReason(e.target.value)}
                      placeholder={language === 'ar' ? 'مثال: سلوك غير لائق...' : 'e.g., Inappropriate behavior...'}
                      className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-rose-400 text-sm text-start bg-white text-olive-dark resize-none h-20"
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3 mt-2">
                <button 
                  onClick={() => { setIsBlockModalOpen(false); setBlockReason(''); }}
                  disabled={isProcessingBlock}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={customer.isBlocked ? handleUnblockCustomer : handleBlockCustomer}
                  disabled={isProcessingBlock}
                  className={`flex-1 px-4 py-2 text-white rounded-lg text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center gap-2 disabled:opacity-50 ${
                    customer.isBlocked 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {isProcessingBlock ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      {customer.isBlocked ? <ShieldCheck className="w-4 h-4" /> : <ShieldBan className="w-4 h-4" />}
                      {customer.isBlocked 
                        ? (language === 'ar' ? 'إلغاء الحظر' : 'Unblock')
                        : (language === 'ar' ? 'تأكيد الحظر' : 'Confirm Block')
                      }
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Ghost Package Modal */}
      {resolvingGhostPackage && (
        <div className="fixed inset-0 bg-olive-dark/40 z-60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fade-in">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-center text-rose-700 mb-2 font-serif">
              {language === 'ar' ? 'باقة مجهولة أو مكررة' : 'Ghost or Duplicate Package Detected'}
            </h3>
            <p className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
              {language === 'ar' 
                ? `هذه الباقة ("${resolvingGhostPackage.packageName}") مضافة بدون سجل شراء صالح، أو أنها نسخة مكررة تماماً في نفس اللحظة. هل ترغب بحذفها أم الإبقاء عليها كباقة صحيحة؟`
                : `This package ("${resolvingGhostPackage.packageName}") lacks a valid purchase history, or is an exact duplicate from the same moment. Do you want to delete it or verify it as correct?`}
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleDeleteGhostPackage}
                disabled={isResolvingGhost}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isResolvingGhost ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {language === 'ar' ? 'حذف الباقة' : 'Delete'}
              </button>
              <button
                onClick={handleKeepGhostPackage}
                disabled={isResolvingGhost}
                className="flex-1 py-3 bg-brand-olive hover:bg-brand-olive-hover text-white font-bold rounded-xl transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isResolvingGhost ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {language === 'ar' ? 'إبقاء (تأكيد)' : 'Keep (Verify)'}
              </button>
            </div>
            
            <button
              onClick={() => setResolvingGhostPackage(null)}
              disabled={isResolvingGhost}
              className="w-full mt-3 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors text-sm disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Edit Package Modal */}
      {/* Freeze Package Modal */}
      {isFreezeModalOpen && freezingPackage && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60] font-sans">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-scale-in">
            <div className="bg-sky-600 p-4 relative">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {language === 'ar' ? 'تجميد الاشتراك' : 'Freeze Subscription'}
                  </h3>
                  <p className="text-sky-100 text-xs mt-1 opacity-90">
                    {freezingPackage.packageName}
                  </p>
                </div>
                <button 
                  onClick={() => setIsFreezeModalOpen(false)}
                  className="text-sky-200 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  {language === 'ar' ? 'عدد أيام التجميد' : 'Number of Days to Freeze'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={freezeDays}
                  onChange={e => setFreezeDays(parseInt(e.target.value) || 1)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white transition-all font-mono"
                  placeholder="1"
                />
                <p className="text-[10px] text-gray-400 mt-2">
                  {language === 'ar' ? 'سيتم تمديد تاريخ الانتهاء تلقائياً بناءً على عدد الأيام.' : 'The expiration date will be extended automatically based on these days.'}
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setIsFreezeModalOpen(false)}
                  className="flex-1 px-4 py-3 text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  onClick={handleFreezePackage}
                  disabled={isFreezingAction || freezeDays < 1}
                  className="flex-1 px-4 py-3 text-sm font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isFreezingAction ? (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Snowflake className="w-4 h-4" />
                      {language === 'ar' ? 'تجميد الآن' : 'Freeze Now'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditPackageModalOpen && editingPackage && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-start">
            <div className="px-6 py-4 border-b border-olive-light flex items-center justify-between bg-olive-soft/40">
              <h3 className="font-serif font-bold text-lg text-olive-dark text-start">
                {language === 'ar' ? 'تعديل بيانات الباقة' : 'Edit Package Details'}
              </h3>
              <button 
                onClick={() => setIsEditPackageModalOpen(false)}
                className="text-gray-400 hover:text-olive-dark transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 text-start">
              <div className="p-3 bg-olive-soft/40 border border-olive-light rounded-lg mb-2 text-sm font-serif font-bold text-olive-dark">
                {editingPackage.packageName}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block text-start">
                    {language === 'ar' ? 'إجمالي الجلسات' : 'Total Sessions'}
                  </label>
                  <input 
                    type="number"
                    min="1"
                    value={editPkgTotalSessions}
                    onChange={e => setEditPkgTotalSessions(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-mono text-start bg-white text-olive-dark"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block text-start">
                    {language === 'ar' ? 'الجلسات المتبقية' : 'Remaining Sessions'}
                  </label>
                  <input 
                    type="number"
                    min="0"
                    max={editPkgTotalSessions}
                    value={editPkgRemainingSessions}
                    onChange={e => setEditPkgRemainingSessions(parseInt(e.target.value) || 0)}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-mono text-start bg-white text-olive-dark"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block text-start">
                    {language === 'ar' ? 'تاريخ البدء' : 'Start Date'}
                  </label>
                  <input 
                    type="date"
                    value={editPkgStartDate}
                    onChange={e => setEditPkgStartDate(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-mono text-start bg-white text-olive-dark"
                  />
                </div>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block text-start">
                    {language === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}
                  </label>
                  <input 
                    type="date"
                    value={editPkgEndDate}
                    onChange={e => setEditPkgEndDate(e.target.value)}
                    className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-mono text-start bg-white text-olive-dark"
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-3 border-t border-gray-100 pt-4">
                <button 
                  onClick={() => setIsEditPackageModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={handleSavePackageEdit}
                  disabled={isSavingPackageEdit}
                  className="px-6 py-2 bg-olive-dark text-white rounded-lg hover:bg-olive-dark-hover disabled:bg-gray-300 text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center min-w-30"
                >
                  {isSavingPackageEdit ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    language === 'ar' ? 'حفظ التعديل' : 'Save Changes'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Family Member Modal */}
      {isFamilyModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-start">
            <div className="px-6 py-4 border-b border-olive-light flex items-center justify-between bg-olive-soft/40">
              <h3 className="font-serif font-bold text-lg text-olive-dark text-start">
                {language === 'ar' ? 'إضافة حساب تابع' : 'Add Family Member'}
              </h3>
              <button 
                onClick={() => setIsFamilyModalOpen(false)}
                className="text-gray-400 hover:text-olive-dark transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4 text-start">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-start">
                  {language === 'ar' ? 'اسم التابع (ابنة/أخت)' : 'Dependent Name'}
                </label>
                <input 
                  type="text"
                  value={newFamilyMemberName}
                  onChange={e => setNewFamilyMemberName(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: سارة' : 'e.g., Sarah'}
                  className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm text-start bg-white text-olive-dark"
                />
              </div>
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-start">
                  {language === 'ar' ? 'رقم الهاتف (مرتبط)' : 'Linked Phone Number'}
                </label>
                <input 
                  type="text"
                  value={customer.phone}
                  disabled
                  className="w-full p-2.5 border border-gray-200 rounded-lg outline-none text-sm font-mono text-start bg-gray-50 text-gray-500 cursor-not-allowed"
                />
                <span className="text-[10px] text-gray-400">
                  {language === 'ar' ? 'يتم ربط الحساب بنفس رقم الهاتف الرئيسي تلقائياً.' : 'Automatically linked to the primary phone number.'}
                </span>
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <button 
                  onClick={() => setIsFamilyModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 text-xs font-bold uppercase transition-colors cursor-pointer"
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button 
                  onClick={handleAddFamilyMember}
                  disabled={isSavingFamilyMember || !newFamilyMemberName.trim()}
                  className="px-6 py-2 bg-brand-olive text-white rounded-lg hover:bg-olive-dark disabled:bg-gray-300 text-xs font-bold uppercase transition-colors cursor-pointer shadow-md flex items-center justify-center"
                >
                  {isSavingFamilyMember ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    language === 'ar' ? 'إضافة الحساب' : 'Add Account'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isInvoicesModalOpen && (
        <CustomerInvoicesModal 
          customer={customer} 
          onClose={() => setIsInvoicesModalOpen(false)} 
        />
      )}

      {isEditPackageModalOpen && editingPackage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-olive-dark/45 backdrop-blur-sm">
          {/* ... existing modal omitted for brevity as it's huge, I'll just insert before the final closing div ... */}
        </div>
      )}

      {isCoffeeModalOpen && (
        <ErrorBoundary>
          <CoffeeSalesModal
            onClose={() => setIsCoffeeModalOpen(false)}
            onProceedToCheckout={(item) => {
              setIsCoffeeModalOpen(false);
              onPurchase('cafe', item);
            }}
          />
        </ErrorBoundary>
      )}

      {/* Wallet Top-Up Modal */}
      {isTopUpModalOpen && (
        <div className="fixed inset-0 z-120 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <button 
              onClick={() => setIsTopUpModalOpen(false)}
              className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-600 mb-4 mx-auto">
              <Wallet className="w-6 h-6" />
            </div>
            
            <h3 className="text-xl font-bold text-olive-dark mb-1 text-center">
              {language === 'ar' ? 'شحن الرصيد' : 'Top-Up Wallet'}
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">
              {language === 'ar' ? 'إضافة مبلغ مالي لرصيد العميل' : 'Add funds to the customer wallet'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {language === 'ar' ? `المبلغ (${currency})` : `Amount (${currency})`}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value ? parseFloat(e.target.value) : '')}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-brand-olive focus:ring-0 outline-none transition-colors font-bold text-gray-700 text-lg"
                  placeholder="0.000"
                  dir="ltr"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  {language === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (Optional)'}
                </label>
                <textarea
                  value={topUpNotes}
                  onChange={(e) => setTopUpNotes(e.target.value)}
                  className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-brand-olive focus:ring-0 outline-none transition-colors text-sm text-gray-700 resize-none h-24"
                  placeholder={language === 'ar' ? 'سبب الشحن...' : 'Reason for top-up...'}
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                />
              </div>
            </div>

            <button
              onClick={submitWalletTopUp}
              disabled={isProcessingTopUp || !topUpAmount || topUpAmount <= 0}
              className="w-full mt-6 py-3 bg-brand-olive hover:bg-olive-dark text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center gap-2"
            >
              {isProcessingTopUp ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  {language === 'ar' ? 'تأكيد الشحن' : 'Confirm Top-Up'}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
