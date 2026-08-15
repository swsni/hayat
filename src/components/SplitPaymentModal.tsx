import React, { useState, useEffect } from 'react';
import { X, Calculator } from 'lucide-react';
import { CafeOrder } from '../types';

type Props = {
  total: number;
  language: 'ar' | 'en';
  onConfirm: (split: { cash: number; benefit: number; card: number }) => void;
  onCancel: () => void;
};

export default function SplitPaymentModal({ total, language, onConfirm, onCancel }: Props) {
  const [cash, setCash] = useState<string>('');
  const [benefit, setBenefit] = useState<string>('');
  const [card, setCard] = useState<string>('');

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const cashVal = parseFloat(cash) || 0;
  const benefitVal = parseFloat(benefit) || 0;
  const cardVal = parseFloat(card) || 0;
  
  const currentSum = cashVal + benefitVal + cardVal;
  const remaining = total - currentSum;
  
  // Use a small epsilon for floating point comparison
  const isExactMatch = Math.abs(currentSum - total) < 0.001;

  // Auto-fill convenience logic: if user clicks a method, auto-fill the remaining amount
  const handleAutoFill = (method: 'cash' | 'benefit' | 'card') => {
    if (remaining <= 0) return;
    if (method === 'cash') setCash((cashVal + remaining).toFixed(3));
    if (method === 'benefit') setBenefit((benefitVal + remaining).toFixed(3));
    if (method === 'card') setCard((cardVal + remaining).toFixed(3));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in no-print" dir={dir}>
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        <div className="bg-[#7d834e] p-4 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calculator className="w-6 h-6" />
            {language === 'ar' ? 'الدفع المجزأ' : 'Split Payment'}
          </h2>
          <button onClick={onCancel} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <p className="text-sm text-gray-500 font-bold mb-1">{language === 'ar' ? 'إجمالي الطلب' : 'Order Total'}</p>
            <p className="text-4xl font-black text-gray-800">{total.toFixed(3)}</p>
          </div>

          <div className="space-y-4">
            {/* Cash */}
            <div className="flex items-center gap-3">
              <label className="w-24 font-bold text-gray-700">{language === 'ar' ? 'كاش' : 'Cash'}</label>
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  step="0.100"
                  min="0"
                  value={cash}
                  onChange={e => setCash(e.target.value)}
                  className="w-full border-gray-300 rounded-xl p-3 bg-gray-50 focus:ring-2 focus:ring-[#7d834e]"
                  placeholder="0.000"
                />
              </div>
              <button onClick={() => handleAutoFill('cash')} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-200">
                {language === 'ar' ? 'المتبقي' : 'Rest'}
              </button>
            </div>

            {/* Benefit */}
            <div className="flex items-center gap-3">
              <label className="w-24 font-bold text-gray-700">{language === 'ar' ? 'بنفت' : 'BenefitPay'}</label>
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  step="0.100"
                  min="0"
                  value={benefit}
                  onChange={e => setBenefit(e.target.value)}
                  className="w-full border-gray-300 rounded-xl p-3 bg-gray-50 focus:ring-2 focus:ring-[#7d834e]"
                  placeholder="0.000"
                />
              </div>
              <button onClick={() => handleAutoFill('benefit')} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-200">
                {language === 'ar' ? 'المتبقي' : 'Rest'}
              </button>
            </div>

            {/* Card */}
            <div className="flex items-center gap-3">
              <label className="w-24 font-bold text-gray-700">{language === 'ar' ? 'بطاقة' : 'Card'}</label>
              <div className="flex-1 relative">
                <input 
                  type="number" 
                  step="0.100"
                  min="0"
                  value={card}
                  onChange={e => setCard(e.target.value)}
                  className="w-full border-gray-300 rounded-xl p-3 bg-gray-50 focus:ring-2 focus:ring-[#7d834e]"
                  placeholder="0.000"
                />
              </div>
              <button onClick={() => handleAutoFill('card')} className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg font-bold text-xs hover:bg-gray-200">
                {language === 'ar' ? 'المتبقي' : 'Rest'}
              </button>
            </div>
          </div>

          <div className={`mt-6 p-4 rounded-xl border ${Math.abs(remaining) < 0.001 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-orange-50 border-orange-200 text-orange-800'} flex justify-between items-center font-bold`}>
            <span>{language === 'ar' ? 'المتبقي:' : 'Remaining:'}</span>
            <span className="text-xl">{Math.max(0, remaining).toFixed(3)}</span>
          </div>

          <button 
            disabled={!isExactMatch}
            onClick={() => {
              if(isExactMatch) {
                onConfirm({ cash: cashVal, benefit: benefitVal, card: cardVal });
              }
            }}
            className="w-full mt-6 bg-[#7d834e] text-white font-bold py-4 rounded-xl hover:bg-[#6a6f42] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all"
          >
            {language === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
