import React from 'react';
import { CafeOrder } from '../types';

type Props = {
  order: CafeOrder;
  language: 'ar' | 'en';
  onClose: () => void;
};

export default function ReceiptPreviewModal({ order, language, onClose }: Props) {
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const handlePrint = () => {
    document.body.classList.add('printing-receipt');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-receipt'), 500);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm no-print" dir={dir}>
      {/* Receipt Container */}
      <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden flex flex-col receipt-preview-container">
        
        {/* Actual Receipt Content (This gets printed) */}
        <div className="p-6 bg-white text-black font-sans print-area" dir="ltr" style={{ maxWidth: '300px', margin: '0 auto' }}>
          <div className="text-center mb-4 border-b border-dashed border-gray-300 pb-4">
            <h1 className="text-xl font-black uppercase tracking-widest mb-1">Hayat Beauty</h1>
            <p className="text-xs text-gray-600">Cafe & Fitness</p>
            <p className="text-xs text-gray-500 mt-2">{new Date(order.createdAt).toLocaleString()}</p>
            <h2 className="text-2xl font-bold mt-3">Order #{order.orderNumber}</h2>
          </div>

          <table className="w-full text-sm mb-4">
            <tbody>
              {order.items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-100 last:border-0">
                  <td className="py-2 text-left">
                    <div className="font-bold">{item.name}</div>
                    <div className="text-xs text-gray-500">{item.quantity} x {item.price.toFixed(3)}</div>
                  </td>
                  <td className="py-2 text-right font-bold">{(item.price * item.quantity).toFixed(3)}</td>
                </tr>
              ))}
              {order.discountAmount && order.discountAmount > 0 && (
                <tr className="border-t border-dashed border-gray-300">
                  <td className="py-2 text-left font-bold text-gray-600">
                    {language === 'ar' ? 'خصم (Discount)' : 'Discount'}
                  </td>
                  <td className="py-2 text-right font-bold text-gray-600">-{order.discountAmount.toFixed(3)}</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="border-t border-b border-dashed border-gray-300 py-3 mb-4 flex justify-between items-center">
            <span className="font-black text-lg">TOTAL</span>
            <span className="font-black text-xl">{order.total.toFixed(3)} BD</span>
          </div>

          <div className="text-xs space-y-1">
            <div className="font-bold border-b border-gray-100 pb-1 mb-2">Payment Split:</div>
            {order.paymentSplit?.cash ? <div className="flex justify-between"><span>Cash:</span> <span>{order.paymentSplit.cash.toFixed(3)}</span></div> : null}
            {order.paymentSplit?.benefit ? <div className="flex justify-between"><span>BenefitPay:</span> <span>{order.paymentSplit.benefit.toFixed(3)}</span></div> : null}
            {order.paymentSplit?.card ? <div className="flex justify-between"><span>Card:</span> <span>{order.paymentSplit.card.toFixed(3)}</span></div> : null}
          </div>

          <div className="text-center mt-8 text-xs text-gray-500 font-bold">
            <p>Thank you for your visit!</p>
            <p className="mt-1">hayat.beauty</p>
          </div>
        </div>

        {/* Modal Actions (Not printed) */}
        <div className="bg-gray-50 p-4 border-t flex gap-3 no-print">
          <button 
            onClick={handlePrint}
            className="flex-1 bg-black text-white font-bold py-3 rounded-xl hover:bg-gray-800 transition-colors"
          >
            {language === 'ar' ? 'طباعة الإيصال' : 'Print Receipt'}
          </button>
          <button 
            onClick={onClose}
            className="flex-1 bg-gray-200 text-gray-800 font-bold py-3 rounded-xl hover:bg-gray-300 transition-colors"
          >
            {language === 'ar' ? 'تم (إغلاق)' : 'OK (Close)'}
          </button>
        </div>

      </div>
    </div>
  );
}
