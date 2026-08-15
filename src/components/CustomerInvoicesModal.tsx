import React, { useState, useEffect } from 'react';
import { useCurrency } from '../LanguageContext';
import { Customer, Invoice } from '../types';
import { db, isFirebaseConfigured } from '../firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, increment } from 'firebase/firestore';
import { X, Printer, Receipt, RotateCcw } from 'lucide-react';
import type { PaymentMethod } from '../types';
import { useLanguage } from '../LanguageContext';
import { isQatarBranch } from '../utils/branchHelpers';
import Logo from './Logo';

interface CustomerInvoicesModalProps {
  customer: Customer;
  onClose: () => void;
  staffName?: string;
  branch?: string;
}

export default function CustomerInvoicesModal({ customer, onClose, staffName = 'Staff', branch = 'Main' }: CustomerInvoicesModalProps) {
  const { language } = useLanguage();
  const currency = useCurrency();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isGeneratingPrint, setIsGeneratingPrint] = useState<string | null>(null);
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [invoiceToRefund, setInvoiceToRefund] = useState<Invoice | null>(null);
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('Cash');
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);

  useEffect(() => {
    const fetchInvoices = async () => {
      if (isFirebaseConfigured && db && navigator.onLine) {
        try {
          const q1 = query(collection(db, 'invoices'), where('primaryCustomerId', '==', customer.id));
          const q2 = query(collection(db, 'invoices'), where('customerId', '==', customer.id));
          
          const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
          const invoiceMap = new Map();
          
          snap1.docs.forEach(d => invoiceMap.set(d.id, { id: d.id, ...d.data() }));
          snap2.docs.forEach(d => invoiceMap.set(d.id, { id: d.id, ...d.data() }));
          
          const data = Array.from(invoiceMap.values()) as Invoice[];
          data.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          
          setInvoices(data);
        } catch (err) {
          console.error('Failed to fetch invoices', err);
        } finally {
          setLoading(false);
        }
      } else {
        // Local fallback if needed
        const localInvoices = JSON.parse(localStorage.getItem('local_invoices') || '[]');
        const filtered = localInvoices
          .filter((inv: Invoice) => inv.primaryCustomerId === customer.id)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setInvoices(filtered);
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [customer.id]);

  const handlePrint = async (invoice: Invoice) => {
    setIsGeneratingPrint(invoice.id || 'unknown');
    try {
      const { generateReceiptPdf } = await import('../utils/receiptGenerator');
      
      const receiptData = {
        items: [
          { description: invoice.description, amount: invoice.amount }
        ],
        receiptNumber: invoice.id,
        date: new Date(invoice.createdAt).getTime(),
        paymentMethod: invoice.payments && invoice.payments.length > 0 
          ? invoice.payments.map(p => p.method).join(' & ') 
          : invoice.paymentMethod,
        branch: invoice.branch
      };

      const pdfBytes = await generateReceiptPdf(customer, receiptData);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Hayat_Receipt_${invoice.id || Date.now()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate PDF', err);
      alert('Failed to generate receipt PDF. Please try again.');
    } finally {
      setIsGeneratingPrint(null);
    }
  };

  const handleRefundClick = (invoice: Invoice) => {
    setInvoiceToRefund(invoice);
    setRefundMethod(invoice.paymentMethod === 'Split' ? 'Cash' : invoice.paymentMethod);
    setRefundModalOpen(true);
  };

  const submitRefund = async () => {
    if (!invoiceToRefund || !customer.id) return;
    setIsProcessingRefund(true);
    try {
      if (refundMethod === 'Customer Wallet') {
        const customerRef = doc(db, 'customers', customer.id);
        await updateDoc(customerRef, {
          walletBalance: increment(invoiceToRefund.amount)
        });
        
        await addDoc(collection(db, 'auditLogs'), {
          customerId: customer.id,
          action: 'Refund',
          description: `Refunded invoice for ${invoiceToRefund.amount} ${isQatarBranch(invoiceToRefund.branch || '') ? 'ر.ق' : 'BHD'} to wallet`,
          timestamp: new Date().toISOString(),
          staffName: staffName,
          branch: branch
        });
      }

      // Mark the invoice as refunded
      const invoiceRef = doc(db, 'invoices', invoiceToRefund.id!);
      await updateDoc(invoiceRef, {
        isRefund: true,
        refundedAt: new Date().toISOString(),
        refundMethod: refundMethod
      });

      // If tied to a cafe order, optionally update the cafe order status
      if (invoiceToRefund.cafeOrderId) {
        const cafeOrderRef = doc(db, 'cafe_orders', invoiceToRefund.cafeOrderId);
        await updateDoc(cafeOrderRef, {
          status: 'Refunded',
          isRefund: true,
          updatedAt: new Date().toISOString()
        });
      }

      // Update local state
      setInvoices(invoices.map(inv => inv.id === invoiceToRefund.id ? { ...inv, isRefund: true } : inv));
      
      setRefundModalOpen(false);
      setInvoiceToRefund(null);
    } catch (err) {
      console.error('Failed to process refund', err);
      alert(language === 'ar' ? 'فشل استرجاع المبلغ' : 'Failed to process refund');
    } finally {
      setIsProcessingRefund(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] shadow-2xl">
        {/* Header */}
        <div className="bg-brand-olive text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            <h2 className="font-bold">{language === 'ar' ? 'فواتير العميل' : 'Customer Invoices'}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1 bg-gray-50">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 border-4 border-brand-olive border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p>{language === 'ar' ? 'لا توجد فواتير سابقة' : 'No previous invoices found'}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {invoices.map((inv) => (
                <div key={inv.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-[10px] text-gray-400 font-mono mb-1">
                      {new Date(inv.createdAt).toLocaleString('en-GB')} • {inv.branch}
                    </div>
                    <div className="font-bold text-sm text-olive-dark mb-1">{inv.description}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span className="font-bold text-brand-olive">{inv.amount.toFixed(3)} {isQatarBranch(inv.branch || '') ? 'ر.ق' : 'BHD'}</span>
                      <span>•</span>
                      <span>{inv.paymentMethod === 'Split' && inv.payments ? inv.payments.map(p => p.method).join(' & ') : inv.paymentMethod}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!inv.isRefund && (
                      <button
                        onClick={() => handleRefundClick(inv)}
                        disabled={isGeneratingPrint === inv.id}
                        className="p-2.5 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
                        title={language === 'ar' ? 'استرجاع' : 'Refund'}
                      >
                        <RotateCcw className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => handlePrint(inv)}
                      disabled={isGeneratingPrint === inv.id}
                      className="p-2.5 bg-olive-soft text-olive-dark hover:bg-brand-olive hover:text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
                      title={language === 'ar' ? 'طباعة الفاتورة' : 'Print Invoice'}
                    >
                      {isGeneratingPrint === inv.id ? (
                        <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <Printer className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Refund Modal */}
      {refundModalOpen && invoiceToRefund && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in font-sans">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl relative">
            <h3 className="text-xl font-bold text-olive-dark mb-4 text-center">
              {language === 'ar' ? 'استرجاع المبلغ' : 'Refund Transaction'}
            </h3>
            
            <p className="text-sm text-gray-600 mb-4 text-center">
              {language === 'ar' 
                ? `هل أنت متأكد من استرجاع مبلغ ${invoiceToRefund.amount.toFixed(3)} ${isQatarBranch(invoiceToRefund.branch || '') ? 'ر.ق' : 'د.ب'}؟` 
                : `Are you sure you want to refund ${invoiceToRefund.amount.toFixed(3)} ${isQatarBranch(invoiceToRefund.branch || '') ? 'ر.ق' : 'BHD'}?`}
            </p>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                {language === 'ar' ? 'طريقة الاسترجاع' : 'Refund Method'}
              </label>
              <select
                value={refundMethod}
                onChange={(e) => setRefundMethod(e.target.value as PaymentMethod | 'Customer Wallet')}
                className="w-full p-3 border-2 border-gray-200 rounded-xl focus:border-brand-olive focus:ring-0 outline-none transition-colors font-bold text-gray-700"
                dir={language === 'ar' ? 'rtl' : 'ltr'}
              >
                <option value="Cash">{language === 'ar' ? 'نقدي' : 'Cash'}</option>
                <option value="BenefitPay">{language === 'ar' ? 'بنفت بي' : 'BenefitPay'}</option>
                <option value="Card">{language === 'ar' ? 'بطاقة بنكية' : 'Card'}</option>
                <option value="Customer Wallet">{language === 'ar' ? 'رصيد العميل' : 'Customer Wallet'}</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRefundModalOpen(false);
                  setInvoiceToRefund(null);
                }}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                onClick={submitRefund}
                disabled={isProcessingRefund}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors disabled:opacity-50 flex justify-center items-center"
              >
                {isProcessingRefund ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  language === 'ar' ? 'تأكيد الاسترجاع' : 'Confirm Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
