import React, { useState, useEffect } from 'react';
import { useCurrency } from '../LanguageContext';
import { SessionState, Invoice } from '../types';
import { db, isFirebaseConfigured } from '../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { LogOut, Printer, AlertTriangle, FileSearch, Coins, CreditCard, Wallet, X, ClipboardList, Coffee, Dumbbell, Scissors } from 'lucide-react';
import Logo from './Logo';
import { useLanguage } from '../LanguageContext';
import { isCafeInvoice } from '../utils/invoiceClassifiers';
import { get } from 'idb-keyval';
import { isQatarBranch, getActiveBranch } from '../utils/branchHelpers';

interface EODSummaryModalProps {
  session: SessionState;
  /** When true, this is a mid-shift X-report view — the Logout button is hidden */
  isShiftSummaryOnly?: boolean;
  /** When true (logout wizard flow), the Close button is hidden — staff must use Confirm Logout */
  hideClose?: boolean;
  onClose: () => void;
  onConfirmLogout: () => void;
  /** Override the staff name used for invoice matching (used by Admin viewing another staff's report) */
  targetStaffName?: string;
  /** Override the staff ID used for invoice matching (preferred when available) */
  targetStaffId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an ISO string for the very start of today (00:00:00.000) in
 * Bahrain Standard Time (UTC+3). 
 */
function todayStartISO(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bahrain',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  // Construct AST midnight exactly:
  const astMidnight = new Date(`${year}-${month}-${day}T00:00:00+03:00`);
  return astMidnight.toISOString();
}

/**
 * Returns true if an ISO timestamp string falls within today in AST (UTC+3).
 */
function isASTToday(isoString: string, todayStart: string): boolean {
  return isoString >= todayStart;
}

/**
 * Resolve the total cash/card/benefit for a single invoice, handling both
 * the legacy single-method field and the newer split payments array.
 */
function resolvePaymentTotals(inv: Invoice): { cash: number; card: number; benefit: number; storeCredit: number } {
  let cash = 0, card = 0, benefit = 0, storeCredit = 0;
  const amt = Math.abs(Number(inv.amount) || 0);

  if (inv.payments && inv.payments.length > 0) {
    inv.payments.forEach(p => {
      const pa = Number(p.amount) || 0;
      const pm = (p.method || '').trim().toLowerCase();
      if (pm === 'cash')                  cash        += pa;
      else if (pm === 'card')             card        += pa;
      else if (pm === 'benefitpay')       benefit     += pa;
      else if (pm === 'store credit')     storeCredit += pa;
    });
  } else {
    const pm = (inv.paymentMethod || '').trim().toLowerCase();
    if (pm === 'cash')              cash        = amt;
    else if (pm === 'card')         card        = amt;
    else if (pm === 'benefitpay')   benefit     = amt;
    else if (pm === 'store credit') storeCredit = amt;
  }

  return { cash, card, benefit, storeCredit };
}

/**
 * Classify an invoice into a department based on its category field
 * and description content.
 */
function classifyDepartment(inv: Invoice): 'cafe' | 'gym' | 'salon' {
  if (isCafeInvoice(inv)) return 'cafe';
  const cat = (inv.category || '').toLowerCase();
  if (cat === 'gym') return 'gym';
  if (cat === 'salon') return 'salon';
  const desc = (inv.description || '').toLowerCase();
  if (/membership|gym|اشتراك|شهر/i.test(desc)) return 'gym';
  return 'salon';
}

/**
 * Format a time string from an ISO date for display (HH:MM in AST).
 */
function formatTimeAST(isoString: string): string {
  try {
    const d = new Date(isoString);
    const ast = new Date(d.getTime() + 3 * 60 * 60 * 1000);
    const hh = String(ast.getUTCHours()).padStart(2, '0');
    const mm = String(ast.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '--:--';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

type FetchState = 'loading' | 'empty' | 'error' | 'done';

export default function EODSummaryModal({
  session,
  isShiftSummaryOnly,
  hideClose,
  onClose,
  onConfirmLogout,
  targetStaffName,
  targetStaffId,
}: EODSummaryModalProps) {
  const { language, t } = useLanguage();
  const ar = language === 'ar';
  const currency = useCurrency();
  const activeBranch = getActiveBranch();
  const isQatar = isQatarBranch(session.activeBranch || activeBranch || '');

  // Fetch lifecycle
  const [fetchState, setFetchState]   = useState<FetchState>('loading');
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // Payment method totals
  const [cashTotal,       setCashTotal]       = useState(0);
  const [cardTotal,       setCardTotal]       = useState(0);
  const [benefitTotal,    setBenefitTotal]    = useState(0);
  const [storeCreditTotal,setStoreCreditTotal]= useState(0);

  // Department income totals (monetary)
  const [cafeIncome,  setCafeIncome]  = useState(0);
  const [gymIncome,   setGymIncome]   = useState(0);
  const [salonIncome, setSalonIncome] = useState(0);

  // UI state
  const [showHistory,    setShowHistory]    = useState(false);
  const [transactions,   setTransactions]   = useState<Invoice[]>([]);
  const [dateStr,        setDateStr]        = useState('');
  const [timeStr,        setTimeStr]        = useState('');

  // ── Data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchEODData = async () => {
      setFetchState('loading');
      setFetchError(null);

      const now = new Date();
      setDateStr(now.toLocaleDateString('en-GB'));
      setTimeStr(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      const staffToMatch = (targetStaffName || session.user?.name || '').trim().toLowerCase();
      const staffIdToMatch = (targetStaffId || (!targetStaffName ? (session.user?.id || '') : '')).trim();

      const todayStart = todayStartISO();

      try {
        const invoiceMap = new Map<string, Invoice>();

        // 1. Fetch from Firestore if configured
        if (isFirebaseConfigured && db) {
          try {
            const q = query(
              collection(db, 'invoices'),
              where('createdAt', '>=', todayStart),
              orderBy('createdAt', 'desc')
            );
            const snap = await getDocs(q);

            snap.forEach(d => {
              const data = d.data() as Invoice;
              if (!data.createdAt || data.isDeleted || data.isRefund) return;
              if (!isASTToday(data.createdAt, todayStart)) return;

              const branchMatch = session.activeBranch === 'All' || data.branch === session.activeBranch;
              if (!branchMatch) return;

              const invoiceStaffId = (data.staffId || '').trim();
              const invoiceStaffName = (data.staffName || '').trim().toLowerCase();
              if (staffIdToMatch && invoiceStaffId) {
                if (invoiceStaffId !== staffIdToMatch) return;
              } else if (invoiceStaffName !== staffToMatch) {
                return;
              }

              invoiceMap.set(d.id, { id: d.id, ...data });
            });
          } catch (fsErr) {
            console.warn('[EODSummaryModal] Firestore fetch failed:', fsErr);
          }
        }

        // 2. Always fetch from idb-keyval local cache to merge offline/unsynced data
        try {
          const allLocal = (await get<Invoice[]>('local_invoices')) || [];
          allLocal.forEach(inv => {
            if (!inv.createdAt || inv.isDeleted || inv.isRefund) return;
            if (!isASTToday(inv.createdAt, todayStart)) return;

            const branchMatch = session.activeBranch === 'All' || inv.branch === session.activeBranch;
            if (!branchMatch) return;

            const invoiceStaffId = (inv.staffId || '').trim();
            const invoiceStaffName = (inv.staffName || '').trim().toLowerCase();
            if (staffIdToMatch && invoiceStaffId) {
              if (invoiceStaffId !== staffIdToMatch) return;
            } else if (invoiceStaffName !== staffToMatch) {
              return;
            }

            const key = inv.id || Math.random().toString();
            if (!invoiceMap.has(key)) {
              invoiceMap.set(key, inv);
            }
          });
        } catch (idbErr) {
          console.warn('[EODSummaryModal] IndexedDB fetch failed:', idbErr);
        }

        const invoices = Array.from(invoiceMap.values());

        // ── Aggregation ───────────────────────────────────────────────────────
        // Only completed/paid (non-refund, non-deleted) invoices reach here.
        let cash = 0, card = 0, benefit = 0, storeCredit = 0;
        let cafeInc = 0, gymInc = 0, salonInc = 0;

        invoices.forEach(inv => {
          const amt = Math.abs(Number(inv.amount) || 0);

          // Payment method breakdown
          const pt = resolvePaymentTotals(inv);
          cash        += pt.cash;
          card        += pt.card;
          benefit     += pt.benefit;
          storeCredit += pt.storeCredit;

          // Department income (skip split-secondary rows and
          // "Paid Previously" entries to avoid double-counting)
          const pm  = (inv.paymentMethod || '').trim().toLowerCase();
          const skip = pm === 'paid previously' || inv.isSplitSecondary;
          if (!skip) {
            const dept = classifyDepartment(inv);
            if (dept === 'cafe')       cafeInc  += amt;
            else if (dept === 'gym')   gymInc   += amt;
            else                       salonInc += amt;
          }
        });

        // Round to 3 decimal places
        const r3 = (num: number) => Math.round(num * 1000) / 1000;

        setCashTotal(r3(cash));
        setCardTotal(r3(card));
        setBenefitTotal(r3(benefit));
        setStoreCreditTotal(r3(storeCredit));
        setCafeIncome(r3(cafeInc));
        setGymIncome(r3(gymInc));
        setSalonIncome(r3(salonInc));
        setTransactions(
          invoices.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );

        // Distinguish between "query worked but zero records" vs "data exists"
        setFetchState(invoices.length === 0 ? 'empty' : 'done');
      } catch (e: any) {
        console.error('[EODSummaryModal] Fetch error:', e);
        setFetchError(e?.message || 'Unknown error');
        setFetchState('error');
      }
    };

    fetchEODData();
  }, [session, targetStaffName]);

  // ── Print ──────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    document.body.classList.add('printing-eod');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-eod'), 500);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const staffDisplayName = targetStaffName || session.user?.name || '';
  const branchDisplay    = session.activeBranch || '—';

  const fmt = (n: number) => `${n.toFixed(3)} ${currency}`;

  // Grand Total = Benefit + Cash + Card ONLY (excludes Store Credit)
  const grandTotal = Math.round((benefitTotal + cashTotal + cardTotal) * 1000) / 1000;

  // Department label helpers
  const deptLabel = (dept: 'cafe' | 'gym' | 'salon'): string => {
    if (ar) {
      if (dept === 'cafe') return 'الكافيه';
      if (dept === 'gym') return 'الجيم';
      return 'الصالون';
    }
    if (dept === 'cafe') return 'Cafe';
    if (dept === 'gym') return 'Gym';
    return 'Salon';
  };

  const paymentMethodLabel = (pm: string): string => {
    const norm = pm.trim().toLowerCase();
    if (norm === 'cash') return ar ? 'كاش' : 'Cash';
    if (norm === 'card') return ar ? 'كارد' : 'Card';
    if (norm === 'benefitpay') return ar ? (isQatar ? 'فورا' : 'بنفت') : (isQatar ? 'Fawra' : 'Benefit');
    if (norm === 'store credit') return ar ? 'رصيد المحفظة' : 'Store Credit';
    if (norm === 'split') return ar ? 'تقسيم' : 'Split';
    return pm;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-olive-dark/40 backdrop-blur-sm animate-fade-in no-print-bg">
        <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-white eod-modal-content">

          {/* ── Receipt Header ── */}
          <div className="p-6 flex flex-col items-center border-b border-dashed border-gray-100">
            <Logo size="md" />
            <h2 className="font-serif text-xl font-bold uppercase tracking-tight text-olive-dark mt-3">
              Hayat Beauty &amp; Care
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-1">
              {ar ? 'تقرير نهاية اليوم' : 'END OF DAY REPORT'}
            </p>

            <div className="w-full mt-4 space-y-1 border-t border-dashed pt-3">
              <div className="flex justify-between text-[10px] font-bold text-gray-400">
                <span>{ar ? 'التاريخ' : 'Date'}</span>
                <span className="font-mono">{dateStr}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-gray-400">
                <span>{ar ? 'الوقت' : 'Time'}</span>
                <span className="font-mono">{timeStr}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-gray-400">
                <span>{ar ? 'الموظف' : 'Staff'}</span>
                <span className="font-mono truncate max-w-[140px]">{staffDisplayName}</span>
              </div>
              <div className="flex justify-between text-[10px] font-bold text-gray-400">
                <span>{ar ? 'الفرع' : 'Branch'}</span>
                <span className="font-mono">{branchDisplay}</span>
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[55vh]">

            {/* LOADING */}
            {fetchState === 'loading' && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-6 h-6 border-2 border-brand-olive border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-gray-400 font-medium animate-pulse">
                  {ar ? 'جاري معالجة الحسابات…' : 'Calculating shift totals…'}
                </span>
              </div>
            )}

            {/* ERROR */}
            {fetchState === 'error' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <AlertTriangle className="w-8 h-8 text-rose-400" />
                <p className="text-xs font-semibold text-rose-600">
                  {ar ? 'حدث خطأ أثناء جلب البيانات' : 'Failed to load shift data'}
                </p>
                {fetchError && (
                  <p className="text-[10px] text-gray-400 font-mono break-all">{fetchError}</p>
                )}
              </div>
            )}

            {/* EMPTY — zero records returned, not a loading hang */}
            {fetchState === 'empty' && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <FileSearch className="w-8 h-8 text-gray-300" />
                <p className="text-xs font-semibold text-gray-500">
                  {ar
                    ? `لا توجد معاملات اليوم للموظف "${staffDisplayName}" في هذا الفرع`
                    : `No transactions found today for "${staffDisplayName}" in ${branchDisplay}`}
                </p>
                <p className="text-[10px] text-gray-400">
                  {ar
                    ? 'تأكد من اسم الموظف والفرع المحدد'
                    : 'Verify the staff name and selected branch match the invoices exactly'}
                </p>
              </div>
            )}

            {/* DATA */}
            {fetchState === 'done' && (
              <>
                {/* ═══ Section 1: Payment Methods Breakdown ═══ */}
                <div>
                  <h3 className="text-[10px] uppercase font-bold text-gray-400 mb-3 border-b pb-1 tracking-wider">
                    {ar ? 'طرق الدفع' : 'Payment Methods'}
                  </h3>

                  <div className="space-y-2">
                    {/* 1. Benefit */}
                    <div className="flex justify-between items-center text-xs text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                        {ar ? (isQatar ? 'مجموع فورا' : 'مجموع البنفت') : (isQatar ? 'Total Fawra' : 'Total Benefit')}
                      </span>
                      <span className="font-mono font-semibold">{fmt(benefitTotal)}</span>
                    </div>

                    {/* 2. Cash */}
                    <div className="flex justify-between items-center text-xs text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <Coins className="w-3.5 h-3.5 text-amber-500" />
                        {ar ? 'مجموع الكاش' : 'Total Cash'}
                      </span>
                      <span className="font-mono font-semibold">{fmt(cashTotal)}</span>
                    </div>

                    {/* 3. Card */}
                    <div className="flex justify-between items-center text-xs text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <CreditCard className="w-3.5 h-3.5 text-blue-400" />
                        {ar ? 'مجموع الكارد' : 'Total Card'}
                      </span>
                      <span className="font-mono font-semibold">{fmt(cardTotal)}</span>
                    </div>

                    {/* Store Credit — informational, shown only when non-zero */}
                    {storeCreditTotal !== 0 && (
                      <div className="flex justify-between items-center text-[11px] text-gray-400 pt-1 border-t border-dashed border-gray-100">
                        <span className="flex items-center gap-1.5 italic">
                          {ar ? 'رصيد المحفظة (غير محتسب)' : 'Store Credit (not in total)'}
                        </span>
                        <span className="font-mono">{fmt(storeCreditTotal)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* ═══ Section 2: Grand Total ═══ */}
                <div className="flex justify-between items-center pt-3 pb-1 border-t-2 border-b-2 border-olive-dark">
                  <span className="text-sm font-bold text-olive-dark uppercase tracking-wide">
                    {ar ? 'المجموع النهائي' : 'Grand Total'}
                  </span>
                  <span className="text-xl font-extrabold font-mono text-brand-olive">
                    {fmt(grandTotal)}
                  </span>
                </div>

                {/* ═══ Section 3: Department Income Breakdown ═══ */}
                <div>
                  <h3 className="text-[10px] uppercase font-bold text-gray-400 mb-3 border-b pb-1 tracking-wider">
                    {ar ? 'مدخول الأقسام' : 'Department Income'}
                  </h3>

                  <div className="space-y-2">
                    {!isQatarBranch(session.activeBranch) && (
                      <>
                        {/* Cafe */}
                        <div className="flex justify-between items-center text-xs text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <Coffee className="w-3.5 h-3.5 text-amber-600" />
                            {ar ? 'مدخول الكافيه' : 'Cafe Income'}
                          </span>
                          <span className="font-mono font-semibold">{fmt(cafeIncome)}</span>
                        </div>

                        {/* Gym */}
                        <div className="flex justify-between items-center text-xs text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
                            {ar ? 'مدخول الجيم' : 'Gym Income'}
                          </span>
                          <span className="font-mono font-semibold">{fmt(gymIncome)}</span>
                        </div>
                      </>
                    )}

                    {/* Salon */}
                    <div className="flex justify-between items-center text-xs text-gray-600">
                      <span className="flex items-center gap-1.5">
                        <Scissors className="w-3.5 h-3.5 text-pink-400" />
                        {ar ? 'مدخول الصالون' : 'Salon Income'}
                      </span>
                      <span className="font-mono font-semibold">{fmt(salonIncome)}</span>
                    </div>
                  </div>
                </div>

                {/* ═══ Section 4: Shift Summary / History Button ═══ */}
                <button
                  onClick={() => setShowHistory(true)}
                  className="w-full py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg flex items-center justify-center gap-2 text-xs font-bold text-gray-600 uppercase tracking-wide transition-colors"
                >
                  <ClipboardList className="w-4 h-4 text-brand-olive" />
                  {ar ? 'ملخص الوردية' : 'Shift Summary'}
                </button>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="p-4 bg-gray-50 border-t flex flex-col gap-2 shrink-0">

            {/* Print — visible in all non-loading states */}
            {fetchState !== 'loading' && (
              <button
                onClick={handlePrint}
                className="py-2.5 bg-white border border-gray-200 text-xs font-bold text-gray-700 uppercase rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                {ar ? 'طباعة التقرير' : 'Print Report'}
              </button>
            )}

            {/* Logout — hidden when this is a shift-summary (X-report) view */}
            {!isShiftSummaryOnly && (
              <button
                onClick={onConfirmLogout}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                {ar ? 'تأكيد تسجيل الخروج' : 'Confirm Logout'}
              </button>
            )}

            {/* Close — hidden during the logout wizard so staff must use Confirm Logout */}
            {!hideClose && (
              <button
                onClick={onClose}
                className="py-2.5 bg-olive-dark hover:bg-olive-dark-hover text-white text-xs font-bold uppercase rounded-lg transition-colors"
              >
                {ar ? 'إغلاق' : 'Close'}
              </button>
            )}
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
           Shift Summary / History Modal Overlay
           ═══════════════════════════════════════════════════════════════════════ */}
      {showHistory && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-white">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
              <div>
                <h3 className="text-sm font-bold text-olive-dark">
                  {ar ? 'ملخص الوردية' : 'Shift Summary'}
                </h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {ar
                    ? `${transactions.length} عملية — ${staffDisplayName}`
                    : `${transactions.length} transactions — ${staffDisplayName}`}
                </p>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-[56px_1fr_80px_70px] gap-1 px-4 py-2 bg-gray-100 text-[9px] uppercase font-bold text-gray-400 tracking-wider border-b">
              <span>{ar ? 'الوقت' : 'Time'}</span>
              <span>{ar ? 'القسم' : 'Dept'}</span>
              <span className="text-right">{ar ? 'المبلغ' : 'Amount'}</span>
              <span className="text-right">{ar ? 'الدفع' : 'Method'}</span>
            </div>

            {/* Transaction List */}
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {transactions.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-xs text-gray-400">
                  {ar ? 'لا توجد عمليات' : 'No transactions'}
                </div>
              ) : (
                transactions.map((inv, idx) => {
                  const amt = Math.abs(Number(inv.amount) || 0);
                  const dept = classifyDepartment(inv);
                  const pm = inv.payments && inv.payments.length > 1
                    ? (ar ? 'تقسيم' : 'Split')
                    : paymentMethodLabel(
                        inv.payments && inv.payments.length === 1
                          ? inv.payments[0].method
                          : inv.paymentMethod || ''
                      );

                  return (
                    <div
                      key={inv.id || idx}
                      className={`grid grid-cols-[56px_1fr_80px_70px] gap-1 px-4 py-2.5 items-center text-[11px] ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                      }`}
                    >
                      <span className="font-mono text-gray-500">
                        {formatTimeAST(inv.createdAt)}
                      </span>
                      <span className="text-gray-600 truncate">
                        {deptLabel(dept)}
                      </span>
                      <span className="font-mono font-bold text-gray-800 text-right">
                        {amt.toFixed(3)}
                      </span>
                      <span className="text-gray-500 text-right truncate">
                        {pm}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t bg-gray-50">
              <button
                onClick={() => setShowHistory(false)}
                className="w-full py-2 bg-olive-dark hover:bg-olive-dark-hover text-white text-xs font-bold uppercase rounded-lg transition-colors"
              >
                {ar ? 'إغلاق' : 'Close'}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}