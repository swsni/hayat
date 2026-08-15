import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import { SessionState, Shift, Invoice } from '../types';
import { showToast } from '../utils/toast';

export function useShiftManager(session: SessionState, language: string) {
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [showShiftManager, setShowShiftManager] = useState(false);
  const [shiftMode, setShiftMode] = useState<'open' | 'close' | 'x-report'>('open');

  useEffect(() => {
    if (!session.isLoggedIn || !session.user || !session.activeBranch || !isFirebaseConfigured || !db) {
      setCurrentShift(null);
      return;
    }

    const qShift = query(
      collection(db, 'shifts'), 
      where('status', '==', 'Open'), 
      where('staffId', '==', session.user.id),
      where('branch', '==', session.activeBranch)
    );
    
    const unsubShift = onSnapshot(qShift, (snap) => {
      if (!snap.empty) {
        setCurrentShift({ id: snap.docs[0].id, ...snap.docs[0].data() } as Shift);
      } else {
        setCurrentShift(null);
      }
    });

    return () => unsubShift();
  }, [session.isLoggedIn, session.user, session.activeBranch]);

  const calculateSalonShiftTotals = async () => {
    if (!currentShift) return { cash: 0, benefit: 0, card: 0, refunds: 0, storeCredit: 0, count: 0, overallTotal: 0, refundedCount: 0 };
    if (!isFirebaseConfigured || !db) return { cash: 0, benefit: 0, card: 0, refunds: 0, storeCredit: 0, count: 0, overallTotal: 0, refundedCount: 0 };
    
    const q = query(
      collection(db, 'invoices'),
      where('createdAt', '>=', currentShift.openedAt)
    );
    
    const snap = await getDocs(q);
    const invoices = snap.docs
      .map(d => d.data() as Invoice)
      .filter(inv => {
        if (inv.branch !== session.activeBranch) return false;
        const invoiceStaffId = (inv.staffId || '').trim();
        if (invoiceStaffId && session.user?.id) {
          return invoiceStaffId === session.user.id;
        }
        return inv.staffName === session.user?.name;
      });
    
    let cash = 0, benefit = 0, card = 0, storeCredit = 0, refunds = 0, overallTotal = 0;

    invoices.forEach(inv => {
      if (inv.isRefund) {
        refunds += Math.abs(inv.amount);
        return;
      }

      overallTotal += inv.amount;
      if (inv.payments && inv.payments.length > 0) {
        inv.payments.forEach(p => {
          if (p.method === 'Cash') cash += p.amount;
          if (p.method === 'BenefitPay') benefit += p.amount;
          if (p.method === 'Card') card += p.amount;
          if (p.method === 'Store Credit') storeCredit += p.amount;
        });
      } else {
        if (inv.paymentMethod === 'Cash') cash += inv.amount;
        else if (inv.paymentMethod === 'BenefitPay') benefit += inv.amount;
        else if (inv.paymentMethod === 'Card') card += inv.amount;
        else if (inv.paymentMethod === 'Store Credit') storeCredit += inv.amount;
      }
    });

    return { cash, benefit, card, storeCredit, refunds, count: invoices.length, overallTotal, refundedCount: 0 };
  };

  const handleOpenShift = async (amount: number) => {
    if (!isFirebaseConfigured || !db) return;
    try {
      await addDoc(collection(db, 'shifts'), {
        staffId: session.user?.id,
        staffName: session.user?.name,
        branch: session.activeBranch,
        openedAt: new Date().toISOString(),
        status: 'Open',
        startingCash: amount
      } as Shift);
      setShowShiftManager(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCloseShift = async (
    actualCash: number, 
    onSuccess?: () => void
  ) => {
    if (!currentShift?.id) {
      setShowShiftManager(false);
      showToast(language === 'ar' ? 'لا توجد وردية مفتوحة لإغلاقها' : 'No open shift to close', 'error');
      return;
    }
    if (!isFirebaseConfigured || !db) return;
    try {
      const totals = await calculateSalonShiftTotals();
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
      
      if (onSuccess) onSuccess();
    } catch (e) {
      console.error('Failed to close shift', e);
      showToast(language === 'ar' ? 'فشل في إغلاق الوردية' : 'Failed to close shift', 'error');
    }
  };

  const forceCloseShift = async () => {
      if (currentShift?.id && isFirebaseConfigured && db) {
        try {
          const totals = await calculateSalonShiftTotals();
          const expectedCash = currentShift.startingCash + totals.cash - totals.refunds;
          await updateDoc(doc(db, 'shifts', currentShift.id), {
            status: 'Closed',
            closedAt: new Date().toISOString(),
            expectedCash,
            totals: {
              cash: totals.cash,
              card: totals.card,
              benefit: totals.benefit,
              storeCredit: totals.storeCredit,
              refunds: totals.refunds
            }
          });
        } catch (e) {
          console.error('Failed to auto-close shift', e);
        }
      }
  }

  return {
    currentShift,
    showShiftManager,
    setShowShiftManager,
    shiftMode,
    setShiftMode,
    handleOpenShift,
    handleCloseShift,
    forceCloseShift
  };
}
