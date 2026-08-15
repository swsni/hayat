import React, { useState, useEffect, useRef } from 'react';
import { useCurrency } from '../LanguageContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs, Timestamp, runTransaction, addDoc, increment } from 'firebase/firestore';
import { CafeOrder, PaymentMethod } from '../types';
import { Coffee, CheckCircle, Package, Receipt, LogOut, Globe, Clock, MapPin, Tag, WifiOff, PlusCircle, X, Calculator } from 'lucide-react';
import CafeBaristaPOS from './CafeBaristaPOS';
import SplitPaymentModal from './SplitPaymentModal';
import ReceiptPreviewModal from './ReceiptPreviewModal';
import ShiftManager from './ShiftManager';
import { Shift } from '../types';
import { syncCafeOrderToInvoice } from '../utils/cafeSales';
import { isCafeAccessAllowed, unlockCafeAccessByPin } from '../utils/cafeAuth';
import { getCafeBranchName } from '../utils/cafeBranch';
import { isQatarBranch } from '../utils/branchHelpers';

type Lang = 'ar' | 'en';

const t = (lang: Lang, isQatar: boolean, currency: string) => ({
  title: lang === 'ar' ? 'شاشة الباريستا' : 'Barista Dashboard',
  subtitle: lang === 'ar' ? 'إدارة الطلبات الحية' : 'Live Order Management',
  endShift: lang === 'ar' ? 'تسجيل خروج / تقرير Z' : 'Logout / Z-Report',
  orderNum: lang === 'ar' ? 'رقم' : 'Order',
  pending: lang === 'ar' ? 'في الانتظار' : 'Pending',
  preparing: lang === 'ar' ? 'جاري التحضير' : 'Preparing',
  ready: lang === 'ar' ? 'جاهز للاستلام' : 'Ready',
  startPrep: lang === 'ar' ? 'بدء التحضير' : 'Start Preparing',
  markReady: lang === 'ar' ? 'الطلب جاهز' : 'Mark Ready',
  collected: lang === 'ar' ? 'تم الاستلام والدفع' : 'Collected & Paid',
  notes: lang === 'ar' ? 'ملاحظات الطلب:' : 'Order Notes:',
  total: lang === 'ar' ? 'الإجمالي' : 'Total',
  noOrders: lang === 'ar' ? 'لا توجد طلبات حالياً' : 'No orders right now',
  paymentTitle: lang === 'ar' ? 'طريقة الدفع' : 'Payment Method',
  paymentSubtitle: lang === 'ar' ? 'الرجاء تحديد طريقة دفع العميل' : 'Select customer payment method',
  benefit: lang === 'ar' ? (isQatar ? 'فورا (Fawra)' : 'بنفت بي (BenefitPay)') : (isQatar ? 'Fawra' : 'BenefitPay'),
  card: lang === 'ar' ? 'بطاقة (Card)' : 'Card',
  cash: lang === 'ar' ? 'كاش (Cash)' : 'Cash',
  cancel: lang === 'ar' ? 'إلغاء' : 'Cancel',
  zTitle: lang === 'ar' ? 'ملخص الشفت (Z-Report)' : 'Shift Summary (Z-Report)',
  totalOrders: lang === 'ar' ? 'إجمالي عدد الطلبات:' : 'Total Orders:',
  totalCash: lang === 'ar' ? 'مجموع الكاش:' : 'Cash Total:',
  totalBenefit: lang === 'ar' ? (isQatar ? 'مجموع فورا:' : 'مجموع بنفت بي:') : (isQatar ? 'Fawra Total:' : 'BenefitPay Total:'),
  totalCard: lang === 'ar' ? 'مجموع البطاقات:' : 'Card Total:',
  grandTotal: lang === 'ar' ? 'الإجمالي الكلي المبيعات:' : 'Grand Total Sales:',
  logout: lang === 'ar' ? 'تسجيل خروج' : 'Logout',
  close: lang === 'ar' ? 'إغلاق' : 'Close',
  pinTitle: lang === 'ar' ? 'لوحة الباريستا' : 'Barista Panel',
  pinSubtitle: lang === 'ar' ? 'الرجاء إدخال الرقم السري' : 'Please enter the PIN',
  enter: lang === 'ar' ? 'دخول' : 'Enter',
  wrongPin: lang === 'ar' ? 'الرقم السري غير صحيح' : 'Incorrect PIN',
  currency: lang === 'ar' ? (isQatar ? 'ر.ق' : 'د.ب') : (isQatar ? 'QAR' : 'BD'),
  history: lang === 'ar' ? 'سجل الطلبات' : 'History',
  refund: lang === 'ar' ? 'استرجاع المبلغ' : 'Refund',
  refunded: lang === 'ar' ? 'مسترجع' : 'Refunded',
  cancelled: lang === 'ar' ? 'ملغي' : 'Cancelled',
  print: lang === 'ar' ? 'طباعة الفاتورة' : 'Print Receipt',
  refundConfirm: lang === 'ar' ? 'هل أنت متأكد من استرجاع هذا الطلب؟' : 'Are you sure you want to refund this order?',
  refundTotal: lang === 'ar' ? 'إجمالي المسترجعات:' : 'Refunded Total:',
});

export default function CafeBaristaDashboard() {
  const [lang, setLang] = useState<Lang>('ar');
  const currency = useCurrency();
  const isQatar = isQatarBranch(getCafeBranchName());
  const [activeOrders, setActiveOrders] = useState<CafeOrder[]>([]);
  const [historyOrders, setHistoryOrders] = useState<CafeOrder[]>([]);
  const [splitPaymentData, setSplitPaymentData] = useState<{ id?: string, cart?: any[], total: number } | null>(null);
  const [previewReceiptOrder, setPreviewReceiptOrder] = useState<CafeOrder | null>(null);
  const [showZReport, setShowZReport] = useState(false);
  const [showPOS, setShowPOS] = useState(false);
  
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundTargetOrder, setRefundTargetOrder] = useState<CafeOrder | null>(null);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod | 'Customer Wallet'>('Cash');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [zReportData, setZReportData] = useState<any>(null);
  
  // Shift State
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [showShiftManager, setShowShiftManager] = useState(false);
  const [shiftMode, setShiftMode] = useState<'open' | 'close' | 'x-report'>('open');
  const [shiftTotalsData, setShiftTotalsData] = useState<Partial<Shift> & {
    orderCount?: number;
    overallTotal?: number;
    averageOrder?: number;
    refundedCount?: number;
  }>({});
  
  const [activeFilter, setActiveFilter] = useState<'All' | 'Pending' | 'Preparing' | 'Ready' | 'History'>('All');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  const [isLocked, setIsLocked] = useState(() => !isCafeAccessAllowed());
  const [pinInput, setPinInput] = useState('');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const i = t(lang, isQatar, currency);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - 6);
  const todayCompletedOrders = historyOrders.filter(order => order.status === 'Completed' && new Date(order.createdAt || 0) >= todayStart);
  const weekCompletedOrders = historyOrders.filter(order => order.status === 'Completed' && new Date(order.createdAt || 0) >= weekStart);
  const todayCafeRevenue = todayCompletedOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const weekCafeRevenue = weekCompletedOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  const currentShiftStatus = currentShift ? (lang === 'ar' ? 'وردية مفتوحة' : 'Shift open') : (lang === 'ar' ? 'لا توجد وردية مفتوحة' : 'No open shift');

  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    onConfirm: () => Promise<void> | void;
    isLoading: boolean;
  }>({
    isOpen: false,
    message: '',
    confirmLabel: lang === 'ar' ? 'تأكيد' : 'Confirm',
    cancelLabel: i.cancel,
    onConfirm: async () => {},
    isLoading: false,
  });

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

    const qActive = query(
      collection(db, 'cafe_orders'),
      where('status', 'in', ['Pending', 'Preparing', 'Ready'])
    );

    const unsubscribeActive = onSnapshot(qActive, (snap) => {
      const orders = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CafeOrder))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          if (audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
        }
      });
      setActiveOrders(orders);
    }, (error) => {
      console.error("Firestore error on active orders:", error);
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - 6);
    
    const qHistory = query(
      collection(db, 'cafe_orders'),
      where('createdAt', '>=', weekStart.toISOString())
    );
    
    const unsubscribeHistory = onSnapshot(qHistory, (snap) => {
      const orders = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CafeOrder))
        .filter(o => o.status === 'Completed' || o.status === 'Cancelled' || o.status === 'Refunded')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // newest first
      
      setHistoryOrders(orders);
    });

    const qShift = query(collection(db, 'shifts'), where('status', '==', 'Open'), where('branch', '==', getCafeBranchName()));
    const unsubShift = onSnapshot(qShift, (snap) => {
      if (!snap.empty) {
        setCurrentShift({ id: snap.docs[0].id, ...snap.docs[0].data() } as Shift);
      } else {
        setCurrentShift(null);
      }
    });

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      unsubscribeActive();
      unsubscribeHistory();
      unsubShift();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const displayOrders = activeFilter === 'History' 
    ? historyOrders 
    : activeOrders.filter(o => activeFilter === 'All' ? true : o.status === activeFilter);

  const buildPaymentsFromSplit = (split: { cash: number; benefit: number; card: number }) => {
    const payments: { method: PaymentMethod; amount: number }[] = [];
    if ((split.cash || 0) > 0) payments.push({ method: 'Cash', amount: split.cash || 0 });
    if ((split.benefit || 0) > 0) payments.push({ method: 'BenefitPay', amount: split.benefit || 0 });
    if ((split.card || 0) > 0) payments.push({ method: 'Card', amount: split.card || 0 });
    return payments;
  };

  const derivePaymentMethodFromSplit = (split: { cash: number; benefit: number; card: number }): PaymentMethod => {
    const payments = buildPaymentsFromSplit(split);
    if (payments.length === 0) return 'Cash';
    if (payments.length === 1) return payments[0].method;
    return 'Split';
  };

  const updateStatus = async (order: CafeOrder, newStatus: CafeOrder['status']) => {
    if (!order.id) return;
    try {
      const updatedAt = new Date().toISOString();
      await updateDoc(doc(db, 'cafe_orders', order.id), {
        status: newStatus,
        isRefund: newStatus === 'Refunded',
        updatedAt
      });

      const syncedOrder: CafeOrder = {
        ...order,
        status: newStatus,
        isRefund: newStatus === 'Refunded',
        updatedAt,
      };

      await syncCafeOrderToInvoice(db, syncedOrder, {
        fallbackBranch: getCafeBranchName(),
        fallbackStaffName: 'Barista'
      });
    } catch (e) {
      console.error('Failed to update status', e);
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmationModal.onConfirm) return;
    setConfirmationModal(prev => ({ ...prev, isLoading: true }));
    try {
      await confirmationModal.onConfirm();
    } finally {
      setConfirmationModal(prev => ({ ...prev, isOpen: false, isLoading: false }));
    }
  };

  const completeOrderWithSplit = async (split: { cash: number; benefit: number; card: number }) => {
    if (!splitPaymentData) return;
    
    try {
      let orderToComplete: CafeOrder;
      const payments = buildPaymentsFromSplit(split);
      const paymentMethod = derivePaymentMethodFromSplit(split);

      if (splitPaymentData.id) {
        const id = splitPaymentData.id;
        const order = activeOrders.find(o => o.id === id);
        if (!order) return;
        
        await runTransaction(db, async (transaction) => {
          const orderRef = doc(db, 'cafe_orders', id);
          transaction.update(orderRef, {
            status: 'Completed',
            paymentSplit: split,
            payments,
            paymentMethod,
            isRefund: false,
            updatedAt: new Date().toISOString()
          });

          if (order && order.customerId) {
            const customerRef = doc(db, 'customers', order.customerId);
            const customerDoc = await transaction.get(customerRef);
            
            if (customerDoc.exists()) {
              const customerData = customerDoc.data();
              let currentStamps = customerData.coffeeStamps || 0;
              
              if (order.freeItemId) {
                transaction.update(customerRef, { coffeeStamps: 0 });
              } else if (order.earnsStamp) {
                transaction.update(customerRef, { coffeeStamps: currentStamps + 1 });
              }
            }
          }
        });
        
        orderToComplete = {
          ...order,
          status: 'Completed',
          paymentSplit: split,
          payments,
          paymentMethod,
          isRefund: false,
          updatedAt: new Date().toISOString()
        };
      } else {
        const orderNumber = Math.floor(1000 + Math.random() * 9000).toString();
        orderToComplete = {
          orderNumber,
          items: splitPaymentData.cart!,
          total: splitPaymentData.total,
          status: 'Completed',
          paymentSplit: split,
          payments,
          paymentMethod,
          source: 'barista_manual_pos',
          customerType: 'walk_in',
          branch: getCafeBranchName(),
          staffName: 'Barista',
          isRefund: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, 'cafe_orders'), orderToComplete);
        orderToComplete.id = docRef.id;
      }

      await syncCafeOrderToInvoice(db, orderToComplete, {
        fallbackBranch: getCafeBranchName(),
        fallbackStaffName: 'Barista'
      });
      
      setSplitPaymentData(null);
      setPreviewReceiptOrder(orderToComplete);
    } catch (e) {
      console.error('Failed to complete order', e);
    }
  };

  const rejectOrder = async (order: CafeOrder) => {
    setConfirmationModal({
      isOpen: true,
      message: lang === 'ar' ? 'هل أنت متأكد من إلغاء هذا الطلب؟' : 'Are you sure you want to cancel this order?',
      confirmLabel: lang === 'ar' ? 'نعم، إلغاء' : 'Yes, Cancel',
      cancelLabel: i.cancel,
      isLoading: false,
      onConfirm: async () => {
        await updateStatus(order, 'Cancelled');
      }
    });
  };

  const handleRefund = async (order: CafeOrder) => {
    setRefundTargetOrder(order);
    setRefundMethod(order.paymentMethod === 'Split' ? 'Cash' : (order.paymentMethod || 'Cash'));
    setRefundModalOpen(true);
  };

  const submitRefund = async () => {
    if (!refundTargetOrder) return;
    setIsProcessingRefund(true);
    try {
      if (refundMethod === 'Customer Wallet') {
        if (!refundTargetOrder.customerId) {
          alert(lang === 'ar' ? 'لا يوجد عميل مرتبط بهذا الطلب.' : 'No customer attached to this order.');
          setIsProcessingRefund(false);
          return;
        }
        
        const customerRef = doc(db, 'customers', refundTargetOrder.customerId);
        await updateDoc(customerRef, {
          walletBalance: increment(refundTargetOrder.total)
        });
        
        await addDoc(collection(db, 'auditLogs'), {
          customerId: refundTargetOrder.customerId,
          action: 'Refund',
          description: `Refunded cafe order #${refundTargetOrder.orderNumber} for ${refundTargetOrder.total} ${currency} to wallet`,
          timestamp: new Date().toISOString(),
          staffName: 'Barista',
          branch: getCafeBranchName()
        });
      }

      await updateStatus(refundTargetOrder, 'Refunded');
      setRefundModalOpen(false);
      setRefundTargetOrder(null);
    } catch (err) {
      console.error('Refund error', err);
      alert(lang === 'ar' ? 'حدث خطأ.' : 'An error occurred.');
    } finally {
      setIsProcessingRefund(false);
    }
  };

  const calculateShiftTotals = async () => {
    if (!currentShift) return { cash: 0, benefit: 0, card: 0, refunds: 0, storeCredit: 0, count: 0, overallTotal: 0, refundedCount: 0 };
    
    const q = query(
      collection(db, 'cafe_orders'),
      where('createdAt', '>=', currentShift.openedAt)
    );
    
    const snap = await getDocs(q);
    const shiftOrders = snap.docs.map(d => d.data() as CafeOrder);
    
    const completedOrders = shiftOrders.filter(o => o.status === 'Completed' && !o.isRefund);
    const refundOrders = shiftOrders.filter(o => o.status === 'Refunded' || o.isRefund);
    
    let cash = 0, benefit = 0, card = 0, storeCredit = 0, refunds = 0, overallTotal = 0;

    completedOrders.forEach(o => {
      overallTotal += o.total;
      if (o.payments && o.payments.length > 0) {
        o.payments.forEach(p => {
          if (p.method === 'Cash') cash += p.amount;
          if (p.method === 'BenefitPay') benefit += p.amount;
          if (p.method === 'Card') card += p.amount;
        });
      } else if (o.paymentSplit) {
        cash += o.paymentSplit.cash || 0;
        benefit += o.paymentSplit.benefit || 0;
        card += o.paymentSplit.card || 0;
      } else {
        if (o.paymentMethod === 'Cash') cash += o.total;
        else if (o.paymentMethod === 'BenefitPay') benefit += o.total;
        else if (o.paymentMethod === 'Card') card += o.total;
      }
    });

    refundOrders.forEach(o => {
      refunds += Math.abs(o.total);
    });

    return { cash, benefit, card, storeCredit, refunds, count: completedOrders.length, overallTotal, refundedCount: refundOrders.length };
  };

  const handleOpenShift = async (amount: number) => {
    try {
      await addDoc(collection(db, 'shifts'), {
        staffId: 'barista',
        staffName: 'Barista',
        branch: getCafeBranchName(),
        openedAt: new Date().toISOString(),
        status: 'Open',
        startingCash: amount
      } as Shift);
      setShowShiftManager(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseShift = async (actualCash: number) => {
    if (!currentShift?.id) return;
    try {
      const totals = await calculateShiftTotals();
      const expectedCash = currentShift.startingCash + totals.cash - totals.refunds;
      const overageShortage = actualCash - expectedCash;
      
      await updateDoc(doc(db, 'shifts', currentShift.id), {
        status: 'Closed',
        closedAt: new Date().toISOString(),
        actualCash,
        expectedCash,
        overageShortage,
        totals: {
          cash: totals.cash,
          card: totals.card,
          benefit: totals.benefit,
          storeCredit: totals.storeCredit,
          refunds: totals.refunds
        }
      });
      setShowShiftManager(false);
      setZReportData({
        ...totals,
        actualCash,
        expectedCash,
        overageShortage,
        startingCash: currentShift.startingCash,
        totalCash: totals.cash,
        totalBenefit: totals.benefit,
        totalCard: totals.card,
        refundTotal: totals.refunds,
        date: new Date().toLocaleDateString('ar-BH')
      });
      setShowZReport(true);
      // Auto-print after rendering the modal
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (e) {
      console.error('Failed to close shift', e);
    }
  };

  const handleXReport = async () => {
    const totals = await calculateShiftTotals();
    const averageOrder = totals.count > 0 ? Math.round((totals.overallTotal / totals.count) * 1000) / 1000 : 0;
    setShiftTotalsData({
      startingCash: currentShift?.startingCash || 0,
      orderCount: totals.count,
      overallTotal: totals.overallTotal,
      averageOrder,
      refundedCount: totals.refundedCount,
      totals: {
        cash: totals.cash,
        card: totals.card,
        benefit: totals.benefit,
        storeCredit: totals.storeCredit,
        refunds: totals.refunds
      }
    });
    setShiftMode('x-report');
    setShowShiftManager(true);
  };

  const generateZReport = () => {
    setShiftMode('close');
    setShowShiftManager(true);
  };

  const handlePinSubmit = async () => {
    const result = await unlockCafeAccessByPin(pinInput);
    if (result.ok) {
      setIsLocked(false);
      setPinInput('');
    } else {
      alert(i.wrongPin);
      setPinInput('');
    }
  };

  const LangToggle = () => (
    <button
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-gray-200 text-xs font-bold text-[#7d834e] hover:bg-gray-50 transition-all shadow-sm"
    >
      <Globe className="w-3.5 h-3.5" />
      {lang === 'ar' ? 'English' : 'عربي'}
    </button>
  );

  if (isLocked) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center font-sans p-6" dir={dir}>
        <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm text-center border border-olive-light/30">
          <div className="absolute top-4 left-4">
            <LangToggle />
          </div>
          <div className="w-16 h-16 bg-brand-olive/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Coffee className="w-8 h-8 text-brand-olive" />
          </div>
          <h1 className="text-2xl font-serif font-extrabold text-olive-dark mb-2">{i.pinTitle}</h1>
          <p className="text-sm text-gray-500 mb-6">{i.pinSubtitle}</p>
          
          <input 
            type="password"
            className="w-full text-center text-2xl tracking-widest bg-stone-50 border border-gray-200 py-3 rounded-xl mb-4 focus:outline-none focus:border-brand-olive"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
            maxLength={4}
            autoFocus
          />
          <button 
            onClick={handlePinSubmit}
            className="w-full bg-brand-olive text-white font-bold py-3 rounded-xl hover:bg-olive-dark transition-colors"
          >
            {i.enter}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 font-sans p-6" dir={dir}>
      {/* Offline Banner */}
      {isOffline && (
        <div className="mb-4 bg-red-500 text-white px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md animate-pulse">
          <WifiOff className="w-5 h-5" />
          {lang === 'ar' ? 'أنت غير متصل بالإنترنت. جاري إعادة الاتصال...' : 'You are offline. Reconnecting...'}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between bg-white px-6 py-4 rounded-2xl shadow-sm border border-gray-200 mb-6 relative">
        {!currentShift && !isLocked && !showZReport && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm rounded-2xl z-10 flex items-center justify-center border-2 border-red-400 border-dashed">
            <button 
              onClick={() => { setShiftMode('open'); setShowShiftManager(true); }}
              className="bg-brand-olive text-white px-6 py-3 rounded-xl font-bold flex items-center gap-3 shadow-lg hover:bg-olive-dark transition-colors animate-pulse"
            >
              <Calculator className="w-6 h-6" />
              {lang === 'ar' ? 'الرجاء فتح الوردية للبدء (Open Shift)' : 'Please Open Shift to Start'}
            </button>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-olive-dark flex items-center gap-2">
            <Coffee className="w-6 h-6 text-brand-olive" /> {i.title}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{i.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowPOS(true)}
            disabled={!currentShift}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">{lang === 'ar' ? 'طلب جديد' : 'New Order'}</span>
          </button>
          <LangToggle />
          <button 
            onClick={handleXReport}
            disabled={!currentShift}
            className="bg-blue-100 text-blue-700 px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-200 transition-colors disabled:opacity-50"
          >
            <Receipt className="w-4 h-4" /> <span className="hidden sm:inline">X-Report</span>
          </button>
          <button 
            onClick={generateZReport}
            disabled={!currentShift}
            className="bg-brand-olive text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-olive-dark transition-colors disabled:opacity-50"
          >
            <Receipt className="w-4 h-4" /> <span className="hidden sm:inline">{i.endShift}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-orange-200 p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-orange-700">{lang === 'ar' ? 'إيراد اليوم' : 'Today Revenue'}</div>
          <div className="text-2xl font-black text-orange-800 mt-2">{todayCafeRevenue.toFixed(3)} {i.currency}</div>
          <div className="text-[11px] text-gray-500 mt-1">{todayCompletedOrders.length} {lang === 'ar' ? 'طلب مكتمل' : 'completed orders'}</div>
        </div>
        <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">{lang === 'ar' ? 'هذا الأسبوع' : 'This Week'}</div>
          <div className="text-2xl font-black text-emerald-800 mt-2">{weekCafeRevenue.toFixed(3)} {i.currency}</div>
          <div className="text-[11px] text-gray-500 mt-1">{weekCompletedOrders.length} {lang === 'ar' ? 'طلب مكتمل' : 'completed orders'}</div>
        </div>
        <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm">
          <div className="text-[10px] uppercase font-bold tracking-wider text-blue-700">{lang === 'ar' ? 'حالة الوردية' : 'Shift Status'}</div>
          <div className="text-lg font-black text-blue-800 mt-2">{currentShiftStatus}</div>
          <div className="text-[11px] text-gray-500 mt-1">{currentShift ? `${(currentShift.startingCash || 0).toFixed(3)} ${i.currency}` : (lang === 'ar' ? 'ابدأ وردية جديدة' : 'Open a new shift')}</div>
        </div>
      </div>

      {/* Live Filter Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 no-scrollbar">
        {['All', 'Pending', 'Preparing', 'Ready', 'History'].map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter as any)}
            className={`px-6 py-2.5 rounded-xl font-bold whitespace-nowrap transition-all ${
              activeFilter === filter 
                ? 'bg-brand-olive text-white shadow-md' 
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {filter === 'All' ? (lang === 'ar' ? 'الكل' : 'All') : filter === 'Pending' ? i.pending : filter === 'Preparing' ? i.preparing : filter === 'Ready' ? i.ready : i.history}
          </button>
        ))}
      </div>

      {/* Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {displayOrders.map(order => (
          <div key={order.id} className={`bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col transition-all ${order.status === 'Pending' ? 'border-orange-400 shadow-orange-100 ring-2 ring-orange-400/50' : 'border-gray-200'}`}>
            <div className={`px-4 py-3 border-b flex justify-between items-center ${
              order.status === 'Pending' ? 'bg-orange-50 border-orange-100 text-orange-800' :
              order.status === 'Preparing' ? 'bg-blue-50 border-blue-100 text-blue-800' :
              order.status === 'Ready' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' :
              order.status === 'Refunded' ? 'bg-gray-100 border-gray-200 text-gray-600' :
              order.status === 'Cancelled' ? 'bg-red-50 border-red-100 text-red-800' :
              'bg-emerald-50 border-emerald-100 text-emerald-800' // Completed
            }`}>
              <span className="font-bold">{i.orderNum} #{order.orderNumber}</span>
              <span className="text-xs font-bold px-2 py-1 bg-white/50 rounded-lg">
                {order.status === 'Pending' && i.pending}
                {order.status === 'Preparing' && i.preparing}
                {order.status === 'Ready' && i.ready}
                {order.status === 'Completed' && i.collected}
                {order.status === 'Cancelled' && i.cancelled}
                {order.status === 'Refunded' && i.refunded}
              </span>
            </div>
            
            <div className="p-4 flex-grow flex flex-col">
              <div className="flex flex-col gap-1.5 mb-4 border-b border-gray-100 pb-3">
                {order.deliveryLocation && (
                  <div className="flex items-center gap-2 text-xs font-bold text-gray-600 bg-gray-50 p-1.5 rounded-lg w-fit">
                    <MapPin className="w-3.5 h-3.5 text-[#5a5e32]" />
                    {order.deliveryLocation}
                  </div>
                )}
                {order.scheduledTime && order.scheduledTime !== 'Now' && (
                  <div className="flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 p-1.5 rounded-lg w-fit animate-pulse">
                    <Clock className="w-3.5 h-3.5" />
                    {order.scheduledTime}
                  </div>
                )}
              </div>

              <ul className="text-sm font-bold text-gray-800 space-y-2 mb-4">
                {order.items.map((item, idx) => (
                  <li key={idx} className="flex justify-between items-center border-b border-gray-50 pb-1">
                    <span>{item.quantity}x {item.name}</span>
                    {order.freeItemId === item.id && (
                      <span className="flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-extrabold uppercase">
                        <Tag className="w-3 h-3" /> FREE
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              
              {order.notes && (
                <div className="bg-yellow-50 border border-yellow-100 p-3 rounded-lg mb-4 mt-auto">
                  <p className="text-xs text-yellow-800 font-bold mb-1">{i.notes}</p>
                  <p className="text-sm text-yellow-900">{order.translated_notes?.[lang] || order.notes}</p>
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-100">
                <span className="text-gray-500 text-xs">{i.total}</span>
                <span className="font-bold text-lg text-brand-olive">{order.total.toFixed(3)} {i.currency}</span>
              </div>
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-100 grid grid-cols-2 gap-2">
              {order.status === 'Pending' && (
                <>
                  <button onClick={() => updateStatus(order, 'Preparing')} className="bg-blue-500 text-white font-bold py-2 rounded-lg hover:bg-blue-600 transition-colors">
                    {i.startPrep}
                  </button>
                  <button onClick={() => rejectOrder(order)} className="bg-red-50 text-red-600 font-bold py-2 rounded-lg hover:bg-red-100 transition-colors flex justify-center items-center border border-red-100">
                    <X className="w-5 h-5" />
                  </button>
                </>
              )}
              {order.status === 'Preparing' && (
                <button onClick={() => updateStatus(order, 'Ready')} className="col-span-2 bg-emerald-500 text-white font-bold py-2 rounded-lg hover:bg-emerald-600 transition-colors">
                  {i.markReady}
                </button>
              )}
              {order.status === 'Ready' && (
                <button onClick={() => setSplitPaymentData({ id: order.id!, total: order.total })} className="col-span-2 bg-gray-800 text-white font-bold py-2 rounded-lg hover:bg-gray-900 transition-colors flex justify-center items-center gap-2">
                  <CheckCircle className="w-4 h-4" /> {i.collected}
                </button>
              )}
              {order.status === 'Completed' && (
                <>
                  <button onClick={() => setPreviewReceiptOrder(order)} className="bg-gray-800 text-white font-bold py-2 rounded-lg hover:bg-gray-900 transition-colors flex justify-center items-center gap-2">
                    <Receipt className="w-4 h-4" /> <span className="text-xs">{i.print}</span>
                  </button>
                  <button onClick={() => handleRefund(order)} className="bg-red-50 text-red-600 font-bold py-2 rounded-lg hover:bg-red-100 transition-colors flex justify-center items-center gap-1 border border-red-100">
                    <X className="w-4 h-4" /> <span className="text-xs">{i.refund}</span>
                  </button>
                </>
              )}
              {(order.status === 'Refunded' || order.status === 'Cancelled') && (
                <button onClick={() => setPreviewReceiptOrder(order)} className="col-span-2 bg-gray-200 text-gray-700 font-bold py-2 rounded-lg hover:bg-gray-300 transition-colors flex justify-center items-center gap-2">
                  <Receipt className="w-4 h-4" /> {i.print}
                </button>
              )}
            </div>
          </div>
        ))}
        {displayOrders.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-gray-400">
            <Package className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-bold">{i.noOrders}</p>
          </div>
        )}
      </div>

      {/* Split Payment Modal */}
      {splitPaymentData && (
        <SplitPaymentModal 
          total={splitPaymentData.total}
          language={lang}
          onConfirm={completeOrderWithSplit}
          onCancel={() => setSplitPaymentData(null)}
        />
      )}

      {/* Receipt Preview Modal */}
      {previewReceiptOrder && (
        <ReceiptPreviewModal 
          order={previewReceiptOrder}
          language={lang}
          onClose={() => setPreviewReceiptOrder(null)}
        />
      )}

      {/* Refund Modal */}
      {refundModalOpen && refundTargetOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setRefundModalOpen(false)}></div>
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl animate-fade-in">
            <h3 className="text-xl font-bold text-olive-dark mb-4 text-center">
              {i.refund}
            </h3>
            
            <p className="text-sm text-gray-600 mb-4 text-center">
              {i.refundConfirm} ({refundTargetOrder.total.toFixed(3)} {i.currency})
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {lang === 'ar' ? 'طريقة الاسترجاع' : 'Refund Method'}
              </label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as PaymentMethod | 'Customer Wallet')}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-brand-olive focus:ring-0 outline-none transition-colors font-bold text-gray-700"
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
              >
                <option value="Cash">{lang === 'ar' ? 'نقدي' : 'Cash'}</option>
                <option value="BenefitPay">{lang === 'ar' ? (isQatar ? 'فورا' : 'بنفت بي') : (isQatar ? 'Fawra' : 'BenefitPay')}</option>
                <option value="Card">{lang === 'ar' ? 'بطاقة بنكية' : 'Card'}</option>
                <option value="Customer Wallet">{lang === 'ar' ? 'رصيد العميل' : 'Customer Wallet'}</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRefundModalOpen(false)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
              >
                {i.cancel}
              </button>
              <button
                onClick={submitRefund}
                disabled={isProcessingRefund}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {isProcessingRefund ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  lang === 'ar' ? 'تأكيد الاسترجاع' : 'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmationModal.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}></div>
          <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">{lang === 'ar' ? 'تأكيد العملية' : 'Confirm Action'}</h3>
            <p className="text-sm text-gray-600">{confirmationModal.message}</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
                className="flex-1 px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 transition-colors"
              >
                {confirmationModal.cancelLabel}
              </button>
              <button
                type="button"
                onClick={executeConfirmAction}
                disabled={confirmationModal.isLoading}
                className="flex-1 px-4 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {confirmationModal.isLoading ? (lang === 'ar' ? 'جاري التنفيذ...' : 'Processing...') : confirmationModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Z-Report Modal */}
      {showZReport && zReportData && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 no-print-bg">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 animate-fade-in shadow-2xl eod-modal-content print-header">
            <div className="text-center mb-6">
              <Receipt className="w-12 h-12 text-brand-olive mx-auto mb-2 hide-on-print" />
              <h2 className="text-xl font-bold text-olive-dark">{i.zTitle}</h2>
              <p className="text-sm text-gray-500">{zReportData.date}</p>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-xl flex justify-between border border-gray-100">
                <span className="font-bold text-gray-600">{i.totalOrders}</span>
                <span className="font-bold text-lg">{zReportData.count}</span>
              </div>
              <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl flex justify-between border border-emerald-100">
                <span className="font-bold">{i.totalCash}</span>
                <span className="font-bold text-lg">{zReportData.totalCash.toFixed(3)} {i.currency}</span>
              </div>
              <div className="bg-rose-50 text-rose-800 p-4 rounded-xl flex justify-between border border-rose-100">
                <span className="font-bold">{i.totalBenefit}</span>
                <span className="font-bold text-lg">{zReportData.totalBenefit.toFixed(3)} {i.currency}</span>
              </div>
              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl flex justify-between border border-blue-100">
                <span className="font-bold">{i.totalCard}</span>
                <span className="font-bold text-lg">{zReportData.totalCard.toFixed(3)} {i.currency}</span>
              </div>
              {zReportData.refundedCount > 0 && (
                <div className="bg-red-50 text-red-800 p-4 rounded-xl flex justify-between border border-red-100">
                  <span className="font-bold">{i.refundTotal} ({zReportData.refundedCount})</span>
                  <span className="font-bold text-lg">-{zReportData.refundTotal.toFixed(3)} {i.currency}</span>
                </div>
              )}
              <div className="bg-brand-olive text-white p-4 rounded-xl flex justify-between shadow-lg">
                <span className="font-bold">{i.grandTotal}</span>
                <span className="font-bold text-2xl">{zReportData.overallTotal.toFixed(3)} {i.currency}</span>
              </div>

              {/* Blind Close Analysis */}
              {zReportData.actualCash !== undefined && (
                <div className="mt-4 pt-4 border-t-2 border-dashed border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-gray-600">Starting Cash:</span>
                    <span className="font-bold">{zReportData.startingCash.toFixed(3)} {i.currency}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-gray-600">Expected Cash in Drawer:</span>
                    <span className="font-bold text-blue-600">{zReportData.expectedCash.toFixed(3)} {i.currency}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-gray-600">Actual Counted Cash:</span>
                    <span className="font-bold">{zReportData.actualCash.toFixed(3)} {i.currency}</span>
                  </div>
                  <div className={`p-3 rounded-lg text-center mt-3 border ${zReportData.overageShortage === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : zReportData.overageShortage > 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    <span className="font-bold block text-sm">
                      {zReportData.overageShortage === 0 ? 'Perfect Match' : zReportData.overageShortage > 0 ? 'Overage (زيادة)' : 'Shortage (عجز)'}
                    </span>
                    <span className="font-black text-lg">
                      {zReportData.overageShortage > 0 ? '+' : ''}{zReportData.overageShortage.toFixed(3)} {i.currency}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-8 flex gap-3 hide-on-print">
              <button 
                onClick={() => {
                  document.body.classList.add('printing-eod');
                  window.print();
                  setTimeout(() => document.body.classList.remove('printing-eod'), 500);
                }} 
                className="flex-1 bg-olive-soft text-brand-olive font-bold py-3 rounded-xl hover:bg-olive-light transition-colors border border-olive-light"
              >
                {lang === 'ar' ? 'طباعة التقرير' : 'Print'}
              </button>
              <button 
                onClick={() => {
                  setShowZReport(false);
                  sessionStorage.removeItem('cafe_admin_auth');
                  setIsLocked(true);
                  window.location.href = '/';
                }} 
                className="flex-1 bg-red-50 text-red-600 font-bold py-3 rounded-xl hover:bg-red-100 transition-colors"
              >
                {i.logout}
              </button>
              <button 
                onClick={() => setShowZReport(false)} 
                className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
              >
                {i.close}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Manager UI */}
      <ShiftManager 
        isOpen={showShiftManager}
        mode={shiftMode}
        language={lang}
        onClose={() => setShowShiftManager(false)}
        onConfirm={(amount) => {
          if (shiftMode === 'open') handleOpenShift(amount);
          if (shiftMode === 'close') handleCloseShift(amount);
        }}
        shiftData={shiftTotalsData}
      />

      {showPOS && (
        <CafeBaristaPOS
          onClose={() => setShowPOS(false)}
          language={lang}
          onCheckout={async (cart, total, discountAmount) => {
            setShowPOS(false);
            try {
              const orderNumber = Math.floor(1000 + Math.random() * 9000).toString();
              const orderToComplete: CafeOrder = {
                orderNumber,
                items: cart,
                total,
                discountAmount: discountAmount || 0,
                status: 'Completed',
                paymentMethod: 'Cash',
                source: 'barista_pos',
                customerType: 'walk_in',
                branch: getCafeBranchName(),
                staffName: 'Barista',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              const docRef = await addDoc(collection(db, 'cafe_orders'), orderToComplete);
              orderToComplete.id = docRef.id;
              await syncCafeOrderToInvoice(db, orderToComplete, {
                fallbackPaymentMethod: 'Cash',
                fallbackBranch: getCafeBranchName(),
                fallbackStaffName: 'Barista'
              });
              setPreviewReceiptOrder(orderToComplete);
            } catch (e) {
              console.error('Failed to save barista order:', e);
            }
          }}
        />
      )}
    </div>
  );
}
