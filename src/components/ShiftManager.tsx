import React, { useState, useEffect } from 'react';
import { useCurrency } from '../LanguageContext';
import { X, Calculator, Receipt, AlertCircle, CheckCircle } from 'lucide-react';
import { Shift } from '../types';
import { getActiveBranch, isQatarBranch } from '../utils/branchHelpers';

type Props = {
  isOpen: boolean;
  mode: 'open' | 'close' | 'x-report';
  onClose: () => void;
  onConfirm: (amount: number) => void;
  shiftData?: (Partial<Shift> & {
    orderCount?: number;
    overallTotal?: number;
    averageOrder?: number;
    refundedCount?: number;
  });
  language: 'ar' | 'en';
};

export default function ShiftManager({ isOpen, mode, onClose, onConfirm, shiftData, language }: Props) {
  const currency = useCurrency();
  const isQatar = isQatarBranch(getActiveBranch());
  const [amountInput, setAmountInput] = useState<string>('');

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) setAmountInput('');
  }, [isOpen]);

  if (!isOpen) return null;

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const handleConfirm = () => {
    const val = parseFloat(amountInput);
    if (isNaN(val) || val < 0) {
      alert(language === 'ar' ? 'الرجاء إدخال مبلغ صحيح' : 'Please enter a valid amount');
      return;
    }
    onConfirm(val);
    setAmountInput('');
  };

  return (
    <div className="fixed inset-0 z-150 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" dir={dir}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className={`p-4 border-b flex justify-between items-center text-white ${
          mode === 'open' ? 'bg-brand-olive' : mode === 'close' ? 'bg-red-600' : 'bg-blue-600'
        }`}>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {mode === 'open' && <Calculator className="w-6 h-6" />}
            {mode === 'close' && <AlertCircle className="w-6 h-6" />}
            {mode === 'x-report' && <Receipt className="w-6 h-6" />}
            
            {mode === 'open' 
              ? (language === 'ar' ? 'فتح الوردية (الصندوق)' : 'Open Shift (Register)')
              : mode === 'close'
              ? (language === 'ar' ? 'إغلاق الوردية (Z-Report)' : 'Close Shift (Z-Report)')
              : (language === 'ar' ? 'تقرير الوردية الحالي (X-Report)' : 'Current Shift (X-Report)')
            }
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-black/20 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex flex-col gap-6">
          
          {mode === 'open' && (
            <div className="space-y-4">
              <p className="text-gray-600 font-medium">
                {language === 'ar' 
                  ? 'الرجاء إدخال مبلغ الكاش الافتتاحي الموجود حالياً في الدرج للبدء باستقبال الطلبات.' 
                  : 'Please enter the starting cash amount in the drawer to begin taking orders.'}
              </p>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {language === 'ar' ? `المبلغ الافتتاحي (${currency})` : `Starting Cash (${currency})`}
                </label>
                <input 
                  type="number"
                  step="0.100"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full text-center text-3xl font-black p-4 border-2 border-brand-olive rounded-xl focus:outline-none focus:ring-4 focus:ring-brand-olive/20 text-brand-olive"
                  placeholder="0.000"
                  autoFocus
                />
              </div>
              <button 
                onClick={handleConfirm}
                className="w-full bg-brand-olive text-white font-bold py-4 rounded-xl hover:bg-olive-dark transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {language === 'ar' ? 'فتح الوردية' : 'Open Shift'}
              </button>
            </div>
          )}

          {mode === 'close' && (
            <div className="space-y-4">
              <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-100 flex items-start gap-3">
                <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-red-600" />
                <p className="text-sm font-bold">
                  {language === 'ar' 
                    ? 'هذا الإجراء سيقوم بإغلاق الوردية الحالية وطباعة Z-Report ولن تتمكن من إضافة طلبات جديدة حتى فتح وردية جديدة. (العد الأعمى)' 
                    : 'This action will close the current shift, print Z-Report, and prevent new orders until a new shift is opened. (Blind Close)'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  {language === 'ar' ? `المبلغ الفعلي في الدرج (${currency})` : `Actual Cash in Drawer (${currency})`}
                </label>
                <input 
                  type="number"
                  step="0.100"
                  min="0"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full text-center text-3xl font-black p-4 border-2 border-red-500 rounded-xl focus:outline-none focus:ring-4 focus:ring-red-500/20 text-red-600"
                  placeholder="0.000"
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-2 text-center">
                  {language === 'ar' 
                    ? 'قم بعد الكاش الموجود في الدرج وإدخاله هنا. سيقوم النظام بحساب العجز أو الزيادة تلقائياً.' 
                    : 'Count the physical cash in the drawer and enter it here. The system will calculate overage/shortage automatically.'}
                </p>
              </div>
              <button 
                onClick={handleConfirm}
                className="w-full bg-red-600 text-white font-bold py-4 rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {language === 'ar' ? 'تأكيد الإغلاق (Z-Report)' : 'Confirm Close (Z-Report)'}
              </button>
            </div>
          )}

          {mode === 'x-report' && shiftData && shiftData.totals && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                <p className="text-sm text-blue-800 font-bold mb-1">
                  {language === 'ar' ? 'حالة الوردية: جارية الآن' : 'Shift Status: Currently Open'}
                </p>
                <p className="text-xs text-blue-600">
                  {language === 'ar' ? 'هذا التقرير للقراءة فقط ولا يغلق الوردية.' : 'This report is read-only and does not close the shift.'}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-bold text-gray-600">{language === 'ar' ? 'عدد الطلبات:' : 'Order Count:'}</span>
                  <span className="font-black text-gray-800">{(shiftData.orderCount || 0)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-bold text-gray-600">{language === 'ar' ? 'المبلغ الافتتاحي:' : 'Starting Cash:'}</span>
                  <span className="font-black text-gray-800">{(shiftData.startingCash || 0).toFixed(3)} {currency}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                  <span className="font-bold text-green-700">{language === 'ar' ? 'مبيعات الكاش:' : 'Cash Sales:'}</span>
                  <span className="font-black text-green-800">{(shiftData.totals.cash || 0).toFixed(3)} {currency}</span>
                </div>
                <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-200">
                <span className="font-bold text-gray-700">{language === 'ar' ? (isQatar ? 'مجموع فورا:' : 'مجموع بنفت بي:') : (isQatar ? 'Fawra Total:' : 'BenefitPay Total:')}</span>
                <span className="font-black text-gray-800">{(shiftData.totals.benefit || 0).toFixed(3)} {currency}</span>
              </div>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <span className="font-bold text-gray-600">{language === 'ar' ? 'مبيعات البطاقة:' : 'Card Sales:'}</span>
                  <span className="font-black text-gray-800">{(shiftData.totals.card || 0).toFixed(3)} {currency}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <span className="font-bold text-red-700">{language === 'ar' ? 'إجمالي المرتجعات:' : 'Total Refunds:'}</span>
                  <span className="font-black text-red-800">{(shiftData.totals.refunds || 0).toFixed(3)} {currency}</span>
                </div>
                <div className="border-t-2 border-dashed border-gray-200 my-2 pt-2">
                  <div className="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                    <span className="font-bold text-gray-800">{language === 'ar' ? 'الكاش المتوقع في الدرج:' : 'Expected Cash in Drawer:'}</span>
                    <span className="font-black text-xl text-gray-900">
                      {((shiftData.startingCash || 0) + (shiftData.totals.cash || 0) - (shiftData.totals.refunds || 0)).toFixed(3)} {currency}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                  <span className="font-bold text-blue-700">{language === 'ar' ? 'متوسط الطلب:' : 'Average Order:'}</span>
                  <span className="font-black text-blue-800">{(shiftData.averageOrder || 0).toFixed(3)} {currency}</span>
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button 
                  onClick={() => window.print()}
                  className="flex-1 bg-brand-olive text-white font-bold py-3 rounded-xl hover:bg-olive-dark transition-colors flex items-center justify-center gap-2"
                >
                  {language === 'ar' ? 'طباعة التقرير' : 'Print'}
                </button>
                <button 
                  onClick={onClose}
                  className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded-xl hover:bg-gray-300 transition-colors"
                >
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
