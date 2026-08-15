import React, { useState, useEffect } from 'react';
import { Search, Plus, User, Phone, ChevronRight, UserX, X, Sparkles, ChevronLeft, Trash2, UserPlus, AlertTriangle, ShieldBan } from 'lucide-react';
import { Customer } from '../types';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, addDoc, query, orderBy, doc, updateDoc, limit, startAfter, getDocs, getDoc, where, QueryDocumentSnapshot } from 'firebase/firestore';
import { offlineSyncService } from '../utils/offlineSync';
import { showToast } from '../utils/toast';
import { useLanguage } from '../LanguageContext';
import { getActiveBranch, isQatarBranch } from '../utils/branchHelpers';

interface CustomerListProps {
  onSelectCustomer: (customer: Customer) => void;
  isAdmin?: boolean;
}

export default function CustomerList({ onSelectCustomer, isAdmin = false }: CustomerListProps) {
  const { t, language } = useLanguage();
  const activeBranch = getActiveBranch();
  const isQatar = isQatarBranch(activeBranch);
  const defaultCode = isQatar ? '+974' : '+973';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Pagination & Search State
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Form State
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', countryCode: defaultCode });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [existingFamilyParent, setExistingFamilyParent] = useState<Customer | null>(null);

  // Fetch initial customers
  useEffect(() => {
    if (!isFirebaseConfigured || !db) {
      // Local fallback
      const localCustomers = localStorage.getItem('local_customers');
      if (localCustomers) {
        setCustomers(JSON.parse(localCustomers));
      }
      setLoading(false);
      return;
    }

    if (searchQuery.trim().length > 0) return; // Handled by search effect

    const q = query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched: Customer[] = [];
      snapshot.forEach(doc => {
        const data = doc.data() as Customer;
        if (!data.isDeleted) fetched.push({ id: doc.id, ...data });
      });
      setCustomers(fetched);
      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === 50);
      localStorage.setItem('local_customers', JSON.stringify(fetched));
      setLoading(false);
    }, (err) => {
      console.warn('[Offline Fallback] Real-time customer stream failed, loading from cache.', err);
      const localCustomers = localStorage.getItem('local_customers');
      if (localCustomers) {
        const cached = JSON.parse(localCustomers) as Customer[];
        setCustomers(cached.filter(c => !c.isDeleted));
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [searchQuery]);

  // Server-Side Prefix Search
  useEffect(() => {
    const term = searchQuery.trim();
    if (!term || !isFirebaseConfigured || !db) return;

    const delayDebounceFn = setTimeout(async () => {
      setLoading(true);
      try {
        // 1. QR Scanner Direct ID Match
        if (term.toUpperCase().startsWith('HAYAT-')) {
          const docId = term.substring(6).trim();
          if (docId) {
            const docRef = doc(db, 'customers', docId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists() && !docSnap.data().isDeleted) {
              setCustomers([{ id: docSnap.id, ...docSnap.data() } as Customer]);
            } else {
              setCustomers([]);
            }
            setLastVisible(null);
            setHasMore(false);
            setLoading(false);
            return;
          }
        }

        // 2. Phone or Name Search
        if (/^\d+$/.test(term)) {
          // Phone prefix search natively
          const q = query(
            collection(db, 'customers'),
            where('phone', '>=', term),
            where('phone', '<=', term + '\uf8ff'),
            limit(50)
          );
          const snap = await getDocs(q);
          const fetched: Customer[] = [];
          snap.forEach(doc => {
            const data = doc.data() as Customer;
            if (!data.isDeleted) fetched.push({ id: doc.id, ...data });
          });
          setCustomers(fetched);
        } else {
          // Name search: pull recent and filter client-side (Case Insensitive + Substring match)
          const q = query(
            collection(db, 'customers'),
            orderBy('createdAt', 'desc'),
            limit(200)
          );
          const snap = await getDocs(q);
          const termLower = term.toLowerCase();
          const fetched: Customer[] = [];
          snap.forEach(doc => {
            const data = doc.data() as Customer;
            if (!data.isDeleted && data.name.toLowerCase().includes(termLower)) {
              fetched.push({ id: doc.id, ...data });
            }
          });
          setCustomers(fetched);
        }

        setLastVisible(null); // Disable load more on search
        setHasMore(false);
      } catch (err) {
        console.error("Search failed:", err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const loadMoreCustomers = async () => {
    if (!lastVisible || !hasMore || loadingMore || !db || searchQuery.trim().length > 0) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, 'customers'),
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(50)
      );
      const snap = await getDocs(q);
      const fetched: Customer[] = [];
      snap.forEach(doc => {
        const data = doc.data() as Customer;
        if (!data.isDeleted) fetched.push({ id: doc.id, ...data });
      });
      if (fetched.length > 0) {
        setCustomers(prev => [...prev, ...fetched]);
        setLastVisible(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === 50);
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("Failed to load more customers:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = newCustomer.name.trim();
    const trimmedPhone = newCustomer.phone.trim();

    if (!trimmedName || !trimmedPhone) {
      setError('Full Name and Phone Number are required.');
      return;
    }

    // Accept letters and spaces in English only
    const nameRegex = /^[a-zA-Z\s]+$/;
    if (!nameRegex.test(trimmedName)) {
      setError(language === 'ar' ? 'الرجاء كتابة اسم العميل باللغة الإنجليزية فقط.' : 'Please enter the customer name in English only.');
      return;
    }

    // Phone validation based on country code
    if (newCustomer.countryCode === '+973') {
      const phoneRegex = /^[0-9]{8}$/;
      if (!phoneRegex.test(trimmedPhone)) {
        setError(language === 'ar' ? 'الرجاء إدخال رقم هاتف بحريني صحيح (8 أرقام)' : 'Please supply a valid 8-digit Bahrain mobile number.');
        return;
      }
    } else if (newCustomer.countryCode === '+966') {
      const phoneRegex = /^[0-9]{9,10}$/;
      if (!phoneRegex.test(trimmedPhone)) {
        setError(language === 'ar' ? 'الرجاء إدخال رقم هاتف سعودي صحيح (9 أو 10 أرقام)' : 'Please supply a valid Saudi mobile number (9 or 10 digits).');
        return;
      }
    } else if (newCustomer.countryCode === '+974') {
      const phoneRegex = /^[0-9]{8}$/;
      if (!phoneRegex.test(trimmedPhone)) {
        setError(language === 'ar' ? 'الرجاء إدخال رقم هاتف قطري صحيح (8 أرقام)' : 'Please supply a valid 8-digit Qatar mobile number.');
        return;
      }
    }

    const existing = customers.find(c => c.phone === trimmedPhone && !c.isDeleted);
    if (existing) {
      if (existing.name.toLowerCase() === trimmedName.toLowerCase()) {
        setError(language === 'ar' ? 'لا يمكن إنشاء حسابين بنفس الرقم والاسم.' : 'Cannot create two profiles with the exact same phone and name.');
        return;
      }
      setExistingFamilyParent(existing);
      return;
    }

    await performCustomerSave(trimmedName, trimmedPhone);
  };

  const performCustomerSave = async (name: string, phone: string, parent?: Customer) => {
    setIsSaving(true);
    try {
      const parentIdToUse = parent ? (parent.parentId || parent.id) : undefined;
      const parentNameToUse = parent ? (parent.parentName || parent.name) : undefined;

      const customerData: any = {
        name,
        phone,
        createdAt: new Date().toISOString()
      };
      
      if (parentIdToUse) customerData.parentId = parentIdToUse;
      if (parentNameToUse) customerData.parentName = parentNameToUse;

      if (isFirebaseConfigured && db && navigator.onLine) {
        await addDoc(collection(db, 'customers'), customerData);
        showToast(language === 'ar' ? `تم تسجيل الزبون ${name} بنجاح!` : `Customer ${name} saved successfully!`);
      } else {
        offlineSyncService.queueAction('create_customer', {
          id: `cust-${Date.now()}`,
          ...customerData
        });
        
        const updatedLocal = JSON.parse(localStorage.getItem('local_customers') || '[]');
        setCustomers(updatedLocal);
      }
      
      setNewCustomer({ name: '', phone: '', countryCode: defaultCode });
      setExistingFamilyParent(null);
      setIsModalOpen(false);
    } catch (err) {
      console.warn('Firebase save customer failed, queuing offline instead.', err);
      const customerData: any = {
        name,
        phone,
        createdAt: new Date().toISOString()
      };
      if (parent) {
        customerData.parentId = parent.parentId || parent.id;
        customerData.parentName = parent.parentName || parent.name;
      }

      offlineSyncService.queueAction('create_customer', {
        id: `cust-${Date.now()}`,
        ...customerData
      });
      
      const updatedLocal = JSON.parse(localStorage.getItem('local_customers') || '[]');
      setCustomers(updatedLocal);
      
      setNewCustomer({ name: '', phone: '', countryCode: defaultCode });
      setExistingFamilyParent(null);
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    customerId: string;
    customerName: string;
  }>({ isOpen: false, customerId: '', customerName: '' });

  const triggerSoftDeleteCustomer = (e: React.MouseEvent, customerId: string, customerName: string) => {
    e.stopPropagation(); // Avoid triggering profile navigation click
    setDeleteConfirmation({
      isOpen: true,
      customerId,
      customerName
    });
  };

  const handleConfirmSoftDelete = async () => {
    const { customerId, customerName } = deleteConfirmation;
    try {
      if (isFirebaseConfigured && db) {
        const docRef = doc(db, 'customers', customerId);
        await updateDoc(docRef, {
          isDeleted: true,
          deletedAt: new Date().toISOString()
        });
        showToast(language === 'ar' ? `تم نقل العميل "${customerName}" إلى سلة المهملات` : `"${customerName}" moved to Recycle Bin.`);
      } else {
        const localCustomers = JSON.parse(localStorage.getItem('local_customers') || '[]');
        const updated = localCustomers.map((c: any) => c.id === customerId ? { ...c, isDeleted: true, deletedAt: new Date().toISOString() } : c);
        localStorage.setItem('local_customers', JSON.stringify(updated));
        setCustomers(updated.filter((c: any) => !c.isDeleted));
        showToast('Local profile soft-deleted.');
      }
    } catch (err) {
      console.error('Failed to soft delete customer:', err);
      showToast('Deletion failed', 'error');
    } finally {
      setDeleteConfirmation({ isOpen: false, customerId: '', customerName: '' });
    }
  };

  const filteredCustomers = customers; // Filtering is now handled server-side via prefix search

  return (
    <div className="w-full flex flex-col pt-6 animate-fade-in">
      
      {/* Directory Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="text-start">
          <h2 className="font-serif text-2xl font-bold text-olive-dark tracking-tight">
            {t('customerList.title')}
          </h2>
          <p className="text-[10px] uppercase font-bold tracking-widest text-brand-olive mt-1 leading-none">
            {language === 'ar' ? 'الملفات الموحدة والسجلات التاريخية' : 'Global Profiles & History'}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Search Bar */}
          <div className="relative w-full md:w-64">
            <input
              type="text"
              placeholder={t('customerList.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-9 py-2 bg-white border border-olive-light rounded-lg text-xs outline-none focus:border-brand-olive transition-all text-olive-dark text-start"
            />
            <Search className={`w-4 h-4 text-gray-400 absolute ${language === 'ar' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2`} />
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="shrink-0 flex items-center justify-center bg-brand-olive hover:bg-brand-olive-hover text-white h-9 w-9 rounded-lg shadow-sm transition-all text-sm cursor-pointer"
            title={t('customerList.add_new')}
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main List Area */}
      {loading ? (
        <div className="w-full h-64 flex flex-col items-center justify-center text-gray-400">
          <div className="w-6 h-6 border-2 border-brand-olive border-t-transparent rounded-full animate-spin mb-4" />
          <span className="text-xs uppercase tracking-wider font-semibold">{t('customerList.loading')}</span>
        </div>
      ) : customers.length === 0 ? (
        // Luxury Empty State
        <div className="w-full bg-white border border-olive-light rounded-2xl p-12 flex flex-col items-center text-center shadow-sm">
          <div className="w-16 h-16 bg-olive-soft rounded-full flex items-center justify-center text-brand-olive mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="font-serif text-xl font-bold text-olive-dark">{t('customerList.empty_title')}</h3>
          <p className="text-xs text-gray-400 mt-2 max-w-sm">
            {t('customerList.empty_desc')}
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-olive-dark hover:bg-olive-dark-hover text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{t('customerList.add_new')}</span>
          </button>
        </div>
      ) : (
        <div className="bg-white border border-olive-light rounded-xl shadow-sm overflow-hidden min-h-100">
          {filteredCustomers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <UserX className="w-6 h-6 mb-2 text-gray-300" />
              <p className="text-xs font-medium font-sans">
                {language === 'ar' ? `لا توجد نتائج مطابقة لـ "${searchQuery}"` : `No matches found for "${searchQuery}"`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col select-none">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-olive-light bg-olive-soft/50 text-[10px] uppercase font-bold text-brand-olive tracking-widest font-sans">
                <div className="col-span-6 md:col-span-5 text-start">{t('customerList.th_name')}</div>
                <div className="col-span-5 md:col-span-4 hidden md:block text-start">{t('customerList.th_contact')}</div>
                <div className="col-span-6 md:col-span-3 text-end">{t('customerList.th_actions')}</div>
              </div>
              
              {/* Table Body */}
              <div className="flex flex-col divide-y divide-gray-50">
                {filteredCustomers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => onSelectCustomer(customer)}
                    className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-olive-soft/40 transition-colors text-start group outline-none cursor-pointer"
                  >
                    <div className="col-span-10 md:col-span-5 flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${customer.isBlocked ? 'bg-rose-100 text-rose-500' : 'bg-olive-light text-brand-olive'}`}>
                        {customer.isBlocked ? <ShieldBan className="w-4 h-4" /> : <User className="w-4 h-4" />}
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-serif font-bold text-sm leading-tight transition-colors truncate ${customer.isBlocked ? 'text-rose-700' : 'text-olive-dark group-hover:text-brand-olive'}`}>
                          {customer.name}
                        </span>
                        {customer.isBlocked && (
                          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[9px] font-bold uppercase tracking-wider rounded border border-rose-200">
                            <ShieldBan className="w-3 h-3" />
                            {language === 'ar' ? 'محظور' : 'Blocked'}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="col-span-4 hidden md:flex items-center gap-2 text-xs text-gray-500 text-start">
                      <Phone className="w-3.5 h-3.5 text-gray-300" />
                      <span className="font-mono">{customer.phone}</span>
                    </div>

                    <div className="col-span-2 md:col-span-3 flex items-center justify-end gap-3 font-sans">
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(e) => triggerSoftDeleteCustomer(e, customer.id, customer.name)}
                          className="p-1 px-1.5 rounded-md hover:bg-rose-50 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer border border-transparent hover:border-rose-100 flex items-center gap-1 text-[10px] font-bold uppercase"
                          title={language === 'ar' ? 'نقل لسلة المهملات' : 'Move to Recycle Bin'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden lg:inline">{language === 'ar' ? 'حذف' : 'Delete'}</span>
                        </button>
                      )}

                      <div className="flex items-center gap-1 text-[10px] text-brand-olive font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform group-hover:rtl:-translate-x-1 font-sans">
                        <span className="hidden sm:inline">{t('customerList.view_profile')}</span>
                        {language === 'ar' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              
              {hasMore && !searchQuery.trim() && (
                <div className="flex justify-center p-4 bg-olive-soft/20 border-t border-olive-light font-sans">
                  <button 
                    onClick={loadMoreCustomers}
                    disabled={loadingMore}
                    className="px-6 py-2 bg-white border border-brand-olive text-brand-olive hover:bg-brand-olive hover:text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-sm cursor-pointer"
                  >
                    {loadingMore ? (language === 'ar' ? 'جاري التحميل...' : 'Loading...') : (language === 'ar' ? 'تحميل المزيد' : 'Load More')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col text-start">
            <div className="px-6 py-4 border-b border-olive-light flex items-center justify-between bg-olive-soft/40">
              <h3 className="font-serif font-bold text-lg text-olive-dark flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-brand-olive" />
                {t('customerList.new_customer')}
              </h3>
              <button 
                onClick={() => {
                  setIsModalOpen(false);
                  setError('');
                  setExistingFamilyParent(null);
                }}
                className="text-gray-400 hover:text-olive-dark transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              {existingFamilyParent ? (
                <div className="flex flex-col gap-4">
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 leading-relaxed font-sans shadow-sm">
                    {language === 'ar' 
                      ? `رقم الهاتف هذا مسجل مسبقاً باسم "${existingFamilyParent.name}". هل تود إضافة "${newCustomer.name}" كحساب تابع لعائلتها؟`
                      : `This phone number is already registered to "${existingFamilyParent.name}". Do you want to add "${newCustomer.name}" as a family member?`}
                  </div>
                  <div className="flex justify-end gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setExistingFamilyParent(null)}
                      className="px-4 py-2.5 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 text-xs font-bold uppercase hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      {language === 'ar' ? 'تراجع وتعديل' : 'Go Back'}
                    </button>
                    <button
                      type="button"
                      onClick={() => performCustomerSave(newCustomer.name.trim(), newCustomer.phone.trim(), existingFamilyParent)}
                      disabled={isSaving}
                      className="px-4 py-2.5 bg-brand-olive text-white rounded-lg text-xs font-bold uppercase hover:bg-olive-dark shadow-md disabled:bg-gray-300 transition-all cursor-pointer flex items-center gap-2"
                    >
                      {isSaving ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        language === 'ar' ? 'نعم، أضف كعائلة' : 'Yes, Add Family'
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleCreateCustomer} className="flex flex-col gap-4">
                  {error && (
                    <div className="p-3 bg-rose-50 text-rose-600 text-xs rounded-lg border border-rose-100 font-sans font-medium flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 font-sans">
                      {t('customerList.name_label')}
                    </label>
                    <input 
                      type="text"
                      autoFocus
                      value={newCustomer.name}
                      onChange={e => {
                        setNewCustomer({...newCustomer, name: e.target.value});
                        setError('');
                      }}
                      placeholder={t('customerList.name_placeholder')}
                      className="w-full p-2.5 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-sans bg-white text-olive-dark transition-colors"
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 font-sans">
                      {t('customerList.phone_label')}
                    </label>
                    <div className="relative flex">
                      <select
                        value={newCustomer.countryCode}
                        onChange={e => {
                          setNewCustomer({...newCustomer, countryCode: e.target.value, phone: ''});
                          setError('');
                        }}
                        className="absolute inset-y-0 left-0 flex items-center bg-gray-50/50 text-gray-600 text-[11px] sm:text-xs font-mono font-bold px-1 sm:px-2 rounded-l-lg border-r border-gray-200 outline-none cursor-pointer hover:bg-gray-100 transition-colors z-10"
                        style={{ width: '85px' }}
                      >
                        <option value="+973">🇧🇭 +973</option>
                        <option value="+966">🇸🇦 +966</option>
                        <option value="+974">🇶🇦 +974</option>
                      </select>
                      <input 
                        type="tel"
                        value={newCustomer.phone}
                        onChange={e => {
                          const maxLen = newCustomer.countryCode === '+966' ? 10 : 8;
                          const val = e.target.value.replace(/\D/g, '').slice(0, maxLen);
                          setNewCustomer({...newCustomer, phone: val});
                          setError('');
                        }}
                        placeholder={newCustomer.countryCode === '+966' ? "5XXXXXXXX" : "3XXXXXXX"}
                        className="w-full p-2.5 pl-23.75 pr-3 border border-gray-200 rounded-lg outline-none focus:border-brand-olive text-sm font-mono tracking-wider bg-white text-olive-dark transition-colors ltr"
                        dir="ltr"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5 font-sans">
                      {t('customerList.phone_hint')}
                    </p>
                  </div>

                  <button 
                    type="submit"
                    disabled={isSaving || !newCustomer.name.trim() || !newCustomer.phone.trim()}
                    className="w-full h-10 mt-2 rounded-lg bg-olive-dark hover:bg-olive-dark-hover disabled:bg-gray-300 text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer font-sans text-center"
                  >
                    {isSaving ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <User className="w-4 h-4" />
                        <span>{t('customerList.btn_save')}</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Elegant Administrative confirmation pop-up */}
      {deleteConfirmation.isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-olive-dark/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-olive-light overflow-hidden animate-slide-up text-start">
            <div className="px-6 py-4 border-b border-rose-100 flex items-center justify-between bg-rose-50/50">
              <span className="flex items-center gap-2 font-semibold text-rose-800 text-xs uppercase tracking-wider font-sans">
                <Trash2 className="w-4 h-4 text-rose-600 animate-bounce" />
                {language === 'ar' ? 'تأكيد الحذف المؤقت' : 'Confirm Soft Delete'}
              </span>
              <button 
                onClick={() => setDeleteConfirmation({ isOpen: false, customerId: '', customerName: '' })}
                className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs text-gray-600 leading-relaxed font-sans">
                {language === 'ar' 
                  ? `هل أنت متأكد وحاسم بنقل الملف التعريفي الخاص بـ "${deleteConfirmation.customerName}" لسلة المهملات برمجياً؟`
                  : `Are you sure you want to transfer the profile of "${deleteConfirmation.customerName}" to the Recycle Bin?`}
              </p>
              
              <p className="text-[10px] text-gray-400 bg-olive-soft/40 p-2.5 rounded leading-normal border border-olive-light/20">
                {language === 'ar'
                  ? 'سيبقى العميل محفوظاً في سلة المهملات لمدة 3 أيام (72 ساعة) متاحاً للاسترجاع، قبل أن يُحذف كلياً وبشكل حاسم تلقائياً.'
                  : 'The record will remain in the Recycle Bin for 3 days (72 hours) during which you can restore it, after which it will be permanently deleted.'}
              </p>

              <div className="flex items-center gap-2 mt-2 font-sans">
                <button
                  onClick={() => setDeleteConfirmation({ isOpen: false, customerId: '', customerName: '' })}
                  className="w-1/2 h-9 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 font-semibold text-xs transition-colors cursor-pointer text-center"
                >
                  {language === 'ar' ? 'إلغاء الأمر' : 'Cancel'}
                </button>
                <button
                  onClick={handleConfirmSoftDelete}
                  className="w-1/2 h-9 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-all shadow-md cursor-pointer text-center"
                >
                  {language === 'ar' ? 'نعم، انقل للسلة' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
