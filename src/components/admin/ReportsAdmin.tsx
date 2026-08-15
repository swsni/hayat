import React, { useState } from 'react';
import { useAdminContext } from './AdminContext';
import { useLanguage } from '../../LanguageContext';
import { Search, Filter, Printer, Download, CreditCard, Banknote, HelpCircle, Check, X, ShieldAlert, RotateCcw, TrendingUp, Coins, Wallet, Info, Building2, Users, FolderSync, Edit3, Trash2 } from 'lucide-react';
import { doc, updateDoc, writeBatch, collection, increment } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase';
import { Invoice, PaymentMethod } from '../../types';
import { isCafeInvoice } from '../../utils/invoiceClassifiers';

export default function ReportsAdmin() {
  const { language, t } = useLanguage();
  const { invoicesList, staffList, availableBranches, triggerToast, loadAllData, setAdminConfirmModal, setInvoicesList, getCustomerName, companyName } = useAdminContext();

  const getInvoiceCustomerName = (inv: Invoice) => {
    if (inv.customerName) return inv.customerName;
    if (inv.primaryCustomerId) return getCustomerName(inv.primaryCustomerId);
    return language === 'ar' ? 'عميل غير معروف' : 'Unknown Customer';
  };

  const getTodayDateString = () => {
    const d = new Date();
    const astDate = new Date(d.getTime() + 3 * 3600 * 1000);
    return astDate.toISOString().substring(0, 10);
  };

  const getPastDateString = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const astDate = new Date(d.getTime() + 3 * 3600 * 1000);
    return astDate.toISOString().substring(0, 10);
  };

  const [timeframe, setTimeframe] = useState<'today' | 'weekly' | 'monthly' | 'custom'>('today');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [selectedBranch, setSelectedBranch] = useState<string>('All');
  const [selectedPayment, setSelectedPayment] = useState<string>('All');
  const [selectedStaff, setSelectedStaff] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedReportInvoices, setSelectedReportInvoices] = useState<string[]>([]);
  const [bulkActionPaymentMethod, setBulkActionPaymentMethod] = useState<PaymentMethod | ''>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<{ id: string; currentStaffName: string } | null>(null);
  const [newStaffNameForInvoice, setNewStaffNameForInvoice] = useState<string>('');

  // Reports Operations
  const handleBulkUpdatePaymentMethods = async () => {
    if (selectedReportInvoices.length === 0 || !bulkActionPaymentMethod) return;
    setIsBulkUpdating(true);
    try {
      if (isFirebaseConfigured && db && navigator.onLine) {
        const batch = writeBatch(db);
        selectedReportInvoices.forEach(id => {
          const invRef = doc(db, 'invoices', id);
          batch.update(invRef, { paymentMethod: bulkActionPaymentMethod });
        });
        await batch.commit();
      } else {
        // Local fallback
        const updatedInvoices = invoicesList.map(inv => {
          if (inv.id && selectedReportInvoices.includes(inv.id)) {
            return { ...inv, paymentMethod: bulkActionPaymentMethod as PaymentMethod };
          }
          return inv;
        });
        localStorage.setItem('local_invoices', JSON.stringify(updatedInvoices));
      }
      setSelectedReportInvoices([]);
      setBulkActionPaymentMethod('');
      triggerToast(language === 'ar' ? 'تم تعديل طريقة الدفع بنجاح' : 'Payment methods updated successfully');
    } catch (err) {
      console.error(err);
      triggerToast(language === 'ar' ? 'فشل التحديث' : 'Update failed', 'error');
    }
    setIsBulkUpdating(false);
  };

  const handleRefundInvoice = async (inv: Invoice) => {
    if (inv.isRefund) {
      triggerToast(language === 'ar' ? 'هذه العملية مسترجعة بالفعل' : 'Already a refund transaction', 'error');
      return;
    }

    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: inv.id || '',
      targetName: getInvoiceCustomerName(inv),
      confirmationPromptText: language === 'ar'
        ? 'اختر طريقة رد الأموال ثم اضغط تأكيد'
        : 'Choose refund method then click Confirm',
      confirmationInputValue: '',
      confirmationOptions: [
        { label: language === 'ar' ? 'نقداً' : 'Cash', value: 'Cash' },
        { label: language === 'ar' ? 'رصيد المتجر' : 'Store Credit', value: 'Store Credit' }
      ],
      onConfirm: async (inputValue) => {
        if (inputValue !== 'Cash' && inputValue !== 'Store Credit') {
          triggerToast(language === 'ar' ? 'يرجى اختيار طريقة صحيحة.' : 'Please choose a valid refund method.', 'error');
          return;
        }

        const refundMethod = inputValue;

        const refundInvoice: Invoice = {
          ...inv,
          amount: -Math.abs(inv.amount),
          isRefund: true,
          paymentMethod: refundMethod,
          payments: [{ method: refundMethod as PaymentMethod, amount: -Math.abs(inv.amount) }],
          createdAt: new Date().toISOString(),
        };
        delete refundInvoice.id;

        if (isFirebaseConfigured && db) {
          try {
            const batch = writeBatch(db);
            const newInvRef = doc(collection(db, 'invoices'));
            batch.set(newInvRef, refundInvoice);

            if (refundMethod === 'Store Credit' && inv.primaryCustomerId) {
              batch.update(doc(db, 'customers', inv.primaryCustomerId), {
                walletBalance: increment(Math.abs(inv.amount))
              });
            }

            await batch.commit();
            await loadAllData();
            triggerToast(language === 'ar' ? 'تم الاسترجاع بنجاح' : 'Refund successful!', 'success');
          } catch (err) {
            console.error(err);
            triggerToast(language === 'ar' ? 'فشل الاسترجاع' : 'Refund failed', 'error');
          }
        } else {
          const refundRecords = [...invoicesList];
          const newRefund: Invoice = {
            ...refundInvoice,
            id: 'refund-' + Date.now()
          };
          refundRecords.push(newRefund);
          localStorage.setItem('local_invoices', JSON.stringify(refundRecords));
          setInvoicesList(refundRecords);
          triggerToast(language === 'ar' ? 'تم الاسترجاع محلياً' : 'Refund recorded locally', 'success');
        }
      }
    });
  };

  const saveInvoiceStaff = async (invoiceId: string) => {
    if (!newStaffNameForInvoice) return;
    if (isFirebaseConfigured && db) {
      try {
        await updateDoc(doc(db, 'invoices', invoiceId), { staffName: newStaffNameForInvoice });
        triggerToast('Staff updated successfully');
      } catch (err) {
        console.error(err);
        triggerToast('Failed to update staff', 'error');
      }
    } else {
      const updated = invoicesList.map(i => i.id === invoiceId ? { ...i, staffName: newStaffNameForInvoice } : i);
      setInvoicesList(updated);
      localStorage.setItem('local_invoices', JSON.stringify(updated));
      triggerToast('Staff updated locally');
    }
    setEditingInvoice(null);
  };

            const handleTimeframeChange = (tf: 'today' | 'weekly' | 'monthly' | 'custom') => {
              setTimeframe(tf);
              if (tf === 'today') {
                setStartDate(getTodayDateString());
                setEndDate(getTodayDateString());
              } else if (tf === 'weekly') {
                setStartDate(getPastDateString(7));
                setEndDate(getTodayDateString());
              } else if (tf === 'monthly') {
                setStartDate(getPastDateString(30));
                setEndDate(getTodayDateString());
              }
            };

            const handleExportCSV = () => {
              const headers = [
                language === 'ar' ? 'معرف العملية' : 'Invoice ID',
                language === 'ar' ? 'العميل' : 'Customer',
                language === 'ar' ? 'الفرع' : 'Branch',
                language === 'ar' ? 'المصدر' : 'Source',
                language === 'ar' ? 'البيان / الخدمة' : 'Description',
                language === 'ar' ? 'طريقة الدفع' : 'Payment Method',
                language === 'ar' ? 'المبلغ (د.ب)' : 'Amount (BHD)',
                language === 'ar' ? 'بواسطة' : 'Staff Name',
                language === 'ar' ? 'التاريخ والوقت' : 'Date & Time'
              ];

              const rows = filteredInvoices.map(inv => [
                inv.id || 'N/A',
                getInvoiceCustomerName(inv),
                inv.branch,
                isCafeInvoice(inv) ? (language === 'ar' ? 'كافيه' : 'Cafe') : (language === 'ar' ? 'عام' : 'General'),
                inv.description,
                inv.paymentMethod,
                inv.amount.toFixed(3),
                inv.staffName,
                new Date(inv.createdAt).toLocaleString(language === 'ar' ? 'ar-BH' : 'en-US')
              ]);

              rows.push([]);
              rows.push([language === 'ar' ? 'إجمالي المداخيل المباشرة' : 'Total Direct Revenue', '', '', '', '', totalDirectRevenue.toFixed(3), '', '']);
              rows.push([language === 'ar' ? 'إجمالي الكاش الكلي' : 'Total Cash Drawer', '', '', '', '', cashRevenue.toFixed(3), '', '']);
              rows.push([language === 'ar' ? 'إجمالي مدفوعات البطاقة' : 'Total Card Settlement', '', '', '', '', cardRevenue.toFixed(3), '', '']);
              rows.push([language === 'ar' ? 'إجمالي بنفت باي' : 'Total BenefitPay Transfer', '', '', '', '', benefitRevenue.toFixed(3), '', '']);
              rows.push([language === 'ar' ? 'إجمالي الخدمات المسبقة الدفع (مستبعد)' : 'Total Pre-paid Clearance (Excluded)', '', '', '', '', prepaidVolume.toFixed(3), '', '']);

              const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
              const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.setAttribute("href", url);
              link.setAttribute("download", `HAYAT_Financial_Report_${startDate}_to_${endDate}.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              triggerToast(language === 'ar' ? 'تم تصدير ملف الـ CSV بنجاح' : 'CSV Report exported successfully!');
            };

            const handlePrint = () => {
              window.print();
            };

  // Render variables from the IIFE
            const filteredInvoices = invoicesList.filter(inv => {
              if (inv.isDeleted) return false;
              // Convert UTC to AST (UTC+3) to get the correct date string
              const createdDate = new Date(inv.createdAt);
              const astDate = new Date(createdDate.getTime() + 3 * 3600 * 1000);
              const invDateStr = astDate.toISOString().substring(0, 10);
              if (invDateStr < startDate || invDateStr > endDate) return false;
              if (selectedBranch !== 'All' && inv.branch !== selectedBranch) return false;
              if (selectedPayment !== 'All' && inv.paymentMethod !== selectedPayment) return false;
              if (selectedStaff !== 'All' && inv.staffName !== selectedStaff) return false;
              if (searchQuery.trim() !== '') {
                const queryLower = searchQuery.toLowerCase();
                const custName = getInvoiceCustomerName(inv).toLowerCase();
                const desc = (inv.description || '').toLowerCase();
                const staff = (inv.staffName || '').toLowerCase();
                const invId = (inv.id || '').toLowerCase();
                if (!custName.includes(queryLower) && !desc.includes(queryLower) && !staff.includes(queryLower) && !invId.includes(queryLower)) {
                  return false;
                }
              }
              return true;
            });

            // Calculate KPIs
            let cashRevenue = 0;
            let cardRevenue = 0;
            let benefitRevenue = 0;
            let prepaidVolume = 0;

            filteredInvoices.forEach(inv => {
              const amt = Number(inv.amount) || 0;
              const pmNormalized = (inv.paymentMethod || '').trim().toLowerCase();
              if (pmNormalized === 'cash') {
                cashRevenue += amt;
              } else if (pmNormalized === 'card') {
                cardRevenue += amt;
              } else if (pmNormalized === 'benefitpay') {
                benefitRevenue += amt;
              } else if (pmNormalized === 'paid previously' || pmNormalized === 'paid_previously' || inv.paymentMethod === 'Paid Previously') {
                prepaidVolume += amt;
              }
            });

            cashRevenue = Math.round(cashRevenue * 1000) / 1000;
            cardRevenue = Math.round(cardRevenue * 1000) / 1000;
            benefitRevenue = Math.round(benefitRevenue * 1000) / 1000;
            prepaidVolume = Math.round(prepaidVolume * 1000) / 1000;
            const totalDirectRevenue = Math.round((cashRevenue + cardRevenue + benefitRevenue) * 1000) / 1000;
            const cafeTransactions = filteredInvoices.filter(inv => isCafeInvoice(inv));
            const cafeRevenue = Math.round(cafeTransactions.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0) * 1000) / 1000;
            const cafeCount = cafeTransactions.length;

            const allCafeTransactions = invoicesList.filter(inv => isCafeInvoice(inv));
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const weekStart = new Date(todayStart);
            weekStart.setDate(todayStart.getDate() - 6);
            const todayCafeTransactions = allCafeTransactions.filter(inv => {
              const created = new Date(inv.createdAt || 0);
              return !Number.isNaN(created.getTime()) && created >= todayStart;
            });
            const weekCafeTransactions = allCafeTransactions.filter(inv => {
              const created = new Date(inv.createdAt || 0);
              return !Number.isNaN(created.getTime()) && created >= weekStart;
            });
            const todayCafeRevenue = Math.round(todayCafeTransactions.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0) * 1000) / 1000;
            const weekCafeRevenue = Math.round(weekCafeTransactions.reduce((sum, inv) => sum + (Number(inv.amount) || 0), 0) * 1000) / 1000;
            const todayCafeCount = todayCafeTransactions.length;
            const weekCafeCount = weekCafeTransactions.length;
            const todayCafeAverage = todayCafeCount > 0 ? Math.round((todayCafeRevenue / todayCafeCount) * 1000) / 1000 : 0;

            const cafeBranchPerformanceMap: Record<string, any> = {};
            availableBranches.forEach(b => {
              cafeBranchPerformanceMap[b] = {
                name: b,
                count: 0,
                revenue: 0
              };
            });

            cafeTransactions.forEach(inv => {
              const bName = inv.branch || 'Unknown';
              if (!cafeBranchPerformanceMap[bName]) {
                cafeBranchPerformanceMap[bName] = { name: bName, count: 0, revenue: 0 };
              }
              const bData = cafeBranchPerformanceMap[bName];
              bData.count += 1;
              bData.revenue += Number(inv.amount) || 0;
            });

            const cafeBranchPerformanceList = Object.values(cafeBranchPerformanceMap)
              .map((data: any) => ({ ...data, revenue: Math.round(data.revenue * 1000) / 1000 }))
              .sort((a: any, b: any) => b.revenue - a.revenue);

            const cafeStaffPerformanceMap: Record<string, any> = {};
            staffList.forEach(s => {
              cafeStaffPerformanceMap[s.name] = { name: s.name, count: 0, revenue: 0 };
            });

            cafeTransactions.forEach(inv => {
              const sName = inv.staffName || 'Unknown';
              if (!cafeStaffPerformanceMap[sName]) {
                cafeStaffPerformanceMap[sName] = { name: sName, count: 0, revenue: 0 };
              }
              const sData = cafeStaffPerformanceMap[sName];
              sData.count += 1;
              sData.revenue += Number(inv.amount) || 0;
            });

            const cafeStaffPerformanceList = Object.values(cafeStaffPerformanceMap)
              .map((data: any) => ({ ...data, revenue: Math.round(data.revenue * 1000) / 1000 }))
              .sort((a: any, b: any) => b.revenue - a.revenue);

            // Staff performance map
            const staffPerformanceMap: Record<string, any> = {};
            staffList.forEach(s => {
              staffPerformanceMap[s.name] = {
                name: s.name,
                directCount: 0,
                directTotal: 0,
                prepaidCount: 0,
                prepaidVolume: 0
              };
            });

            filteredInvoices.forEach(inv => {
              const sName = inv.staffName || 'Unknown';
              if (!staffPerformanceMap[sName]) {
                staffPerformanceMap[sName] = {
                  name: sName,
                  directCount: 0,
                  directTotal: 0,
                  prepaidCount: 0,
                  prepaidVolume: 0
                };
              }

              const amt = Number(inv.amount) || 0;
              const pmNormalized = (inv.paymentMethod || '').trim().toLowerCase();
              const perf = staffPerformanceMap[sName];

              if (pmNormalized === 'paid previously' || pmNormalized === 'paid_previously' || inv.paymentMethod === 'Paid Previously') {
                perf.prepaidCount += 1;
                perf.prepaidVolume += amt;
              } else {
                perf.directCount += 1;
                perf.directTotal += amt;
              }
            });

            const staffPerformanceList = Object.values(staffPerformanceMap).map((perf: any) => ({
              ...perf,
              directTotal: Math.round(perf.directTotal * 1000) / 1000,
              prepaidVolume: Math.round(perf.prepaidVolume * 1000) / 1000
            }));

            // Branch Breakdown
            const branchPerformanceMap: Record<string, any> = {};
            availableBranches.forEach(b => {
              branchPerformanceMap[b] = {
                name: b,
                cash: 0,
                card: 0,
                benefit: 0,
                totalDirect: 0,
                prepaidCount: 0,
                prepaidVolume: 0
              };
            });

            filteredInvoices.forEach(inv => {
              const bName = inv.branch || 'Unknown';
              if (!branchPerformanceMap[bName]) {
                branchPerformanceMap[bName] = {
                  name: bName,
                  cash: 0,
                  card: 0,
                  benefit: 0,
                  totalDirect: 0,
                  prepaidCount: 0,
                  prepaidVolume: 0
                };
              }

              const amt = Number(inv.amount) || 0;
              const pmNormalized = (inv.paymentMethod || '').trim().toLowerCase();
              const bData = branchPerformanceMap[bName];

              if (pmNormalized === 'paid previously' || pmNormalized === 'paid_previously' || inv.paymentMethod === 'Paid Previously') {
                bData.prepaidCount += 1;
                bData.prepaidVolume += amt;
              } else {
                if (pmNormalized === 'cash') bData.cash += amt;
                else if (pmNormalized === 'card') bData.card += amt;
                else if (pmNormalized === 'benefitpay') bData.benefit += amt;
                bData.totalDirect += amt;
              }
            });

            const branchPerformanceList = Object.values(branchPerformanceMap).map((bData: any) => ({
              ...bData,
              cash: Math.round(bData.cash * 1000) / 1000,
              card: Math.round(bData.card * 1000) / 1000,
              benefit: Math.round(bData.benefit * 1000) / 1000,
              totalDirect: Math.round(bData.totalDirect * 1000) / 1000,
              prepaidVolume: Math.round(bData.prepaidVolume * 1000) / 1000,
            }));

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-start">
      {/* 1. Header Params & Date Preset Controllers */}
      <div className="bg-white border border-olive-light rounded-xl p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-brand-olive font-bold">
              {language === 'ar' ? 'مؤشرات الأداء المالي والتحصيل المستمر للفروع' : 'Administrative Financial Performance & Clear Ledger'}
            </span>
            <h3 className="font-serif text-xl font-bold text-olive-dark tracking-tight mt-0.5">
              {language === 'ar' ? 'بارامترات وتصفية التقارير للفترة مخصصة' : 'Executive Filter Coordinates'}
            </h3>
          </div>

          {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-olive-dark hover:bg-olive-dark-hover text-white text-[11px] font-semibold uppercase tracking-wider transition-all duration-300 shadow cursor-pointer font-sans"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'طباعة التقرير الشامل' : 'Print PDF Executive'}</span>
                      </button>
                      <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-olive hover:bg-brand-olive-hover text-white text-[11px] font-semibold uppercase tracking-wider transition-all duration-300 shadow cursor-pointer font-sans"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'تصدير ورقة CSV المحاسبية' : 'Export Excel/CSV'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Preset controllers buttons row */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 pb-4 mb-4">
                    <span className="text-[10px] uppercase font-bold text-gray-400 mr-2 leading-none font-sans">
                      {language === 'ar' ? 'الفترات السريعة:' : 'Quick Presets:'}
                    </span>
                    {(['today', 'weekly', 'monthly', 'custom'] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => handleTimeframeChange(tf)}
                        className={`px-3 py-1.5 rounded text-[11px] font-bold transition-all cursor-pointer border ${
                          timeframe === tf
                            ? 'bg-brand-olive text-white border-brand-olive shadow-sm'
                            : 'bg-olive-soft/40 hover:bg-olive-soft text-gray-500 border-olive-light/40'
                        }`}
                      >
                        {tf === 'today' ? (language === 'ar' ? 'اليوم الحالي' : 'Today') :
                         tf === 'weekly' ? (language === 'ar' ? 'آخر 7 أيام' : 'Last 7 Days') :
                         tf === 'monthly' ? (language === 'ar' ? 'آخر 30 يوماً' : 'Last 30 Days') :
                         (language === 'ar' ? 'فترة مخصصة' : 'Custom Dates')}
                      </button>
                    ))}
                  </div>

                  {/* Advanced Filters Coordinates Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <label className="block text-[9px] uppercase font-semibold text-gray-400 mb-1 leading-none font-sans">
                        {language === 'ar' ? 'من تاريخ:' : 'From Date:'}
                      </label>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          setTimeframe('custom');
                        }}
                        className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-semibold text-gray-400 mb-1 leading-none font-sans">
                        {language === 'ar' ? 'إلى تاريخ:' : 'To Date:'}
                      </label>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => {
                          setEndDate(e.target.value);
                          setTimeframe('custom');
                        }}
                        className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark font-mono font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-semibold text-gray-400 mb-1 leading-none font-sans">
                        {language === 'ar' ? 'تحديد الفرع:' : 'Select Branch:'}
                      </label>
                      <select
                        value={selectedBranch}
                        onChange={(e) => setSelectedBranch(e.target.value)}
                        className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark font-serif font-bold animate-none"
                      >
                        <option value="All">{language === 'ar' ? 'كافة الفروع النشطة' : 'All Branches'}</option>
                        {availableBranches.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-semibold text-gray-400 mb-1 leading-none font-sans">
                        {language === 'ar' ? 'فواتير الصندوق / الدفع:' : 'Settlement Method:'}
                      </label>
                      <select
                        value={selectedPayment}
                        onChange={(e) => setSelectedPayment(e.target.value)}
                        className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark font-sans font-bold"
                      >
                        <option value="All">{language === 'ar' ? 'جميع طرق الدفع' : 'All Payment Methods'}</option>
                        <option value="Cash">{language === 'ar' ? 'نقدي (كاش الصندوق)' : 'Cash'}</option>
                        <option value="Card">{language === 'ar' ? 'صراف وبطاقة بنكية' : 'Card'}</option>
                        <option value="BenefitPay">{language === 'ar' ? 'بنفت باي (BenefitPay)' : 'BenefitPay'}</option>
                        <option value="Paid Previously">{language === 'ar' ? 'مدفوع مسبقاً بالتنسيق' : 'Paid Previously'}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] uppercase font-semibold text-gray-400 mb-1 leading-none font-sans">
                        {language === 'ar' ? 'البحث النصي الدقيق:' : 'Text Search:'}
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          placeholder={language === 'ar' ? 'اسم العميل، بيان الفاتورة...' : 'Search details...'}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full text-xs border border-gray-200 outline-none rounded pl-8 p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Premium Grid Financial KPI Widgets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* KPI 1: Real direct revenue */}
                  <div className="bg-olive-dark border border-olive-dark rounded-xl p-5 text-white shadow relative overflow-hidden flex flex-col justify-between">
                    <div className="absolute right-2 top-2 bg-olive-light/10 p-2 rounded-lg">
                      <TrendingUp className="w-8 h-8 text-olive-light/35 animate-pulse" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-olive-light/70 block">
                        {language === 'ar' ? 'المدخول المباشر الفعلي المستلم' : 'Net Direct Revenue'}
                      </span>
                      <span className="text-3xl font-serif font-extrabold mt-2 block tracking-tight">
                        {totalDirectRevenue.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[10px] text-olive-light/60 mt-4 leading-none font-mono">
                      BHD {language === 'ar' ? 'دينار بحريني' : 'Bahraini Dinars'}
                    </p>
                  </div>

                  {/* KPI 2: Cash in drawer */}
                  <div className="bg-white border border-olive-light rounded-xl p-5 shadow flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
                          {language === 'ar' ? 'إجمالي النقدي الكاش' : 'Direct Cash received'}
                        </span>
                        <div className="bg-amber-50 p-1.5 rounded text-amber-600">
                          <Coins className="w-4 h-4" />
                        </div>
                      </div>
                      <span className="text-2xl font-serif font-extrabold text-olive-dark mt-2 block tracking-tight">
                        {cashRevenue.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 font-mono">{t('common.currency')}</p>
                  </div>

                  {/* KPI 3: ATM cards */}
                  <div className="bg-white border border-olive-light rounded-xl p-5 shadow flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
                          {language === 'ar' ? 'إجمالي الدفع بالبطاقات' : 'ATM & Credit Cards'}
                        </span>
                        <div className="bg-blue-50 p-1.5 rounded text-blue-600">
                          <CreditCard className="w-4 h-4" />
                        </div>
                      </div>
                      <span className="text-2xl font-serif font-extrabold text-olive-dark mt-2 block tracking-tight">
                        {cardRevenue.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 font-mono">{t('common.currency')}</p>
                  </div>

                  {/* KPI 4: BenefitPay */}
                  <div className="bg-white border border-olive-light rounded-xl p-5 shadow flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">
                          {language === 'ar' ? 'إجمالي بنفت باي' : 'BenefitPay Transfer'}
                        </span>
                        <div className="bg-emerald-50 p-1.5 rounded text-emerald-600">
                          <Wallet className="w-4 h-4" />
                        </div>
                      </div>
                      <span className="text-2xl font-serif font-extrabold text-olive-dark mt-2 block tracking-tight font-mono">
                        {benefitRevenue.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-4 font-mono">{t('common.currency')}</p>
                  </div>

                  {/* KPI 5: Cafe sales */}
                  <div className="bg-gradient-to-br from-amber-50 to-orange-100 border border-orange-200 rounded-xl p-5 shadow flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase font-bold tracking-wider text-orange-700 block">
                          {language === 'ar' ? 'مبيعات الكافيه' : 'Cafe Sales'}
                        </span>
                        <div className="bg-orange-200/70 p-1.5 rounded text-orange-700">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                      </div>
                      <span className="text-2xl font-serif font-extrabold text-orange-800 mt-2 block tracking-tight font-mono">
                        {cafeRevenue.toFixed(3)}
                      </span>
                    </div>
                    <p className="text-[10px] text-orange-700 mt-4 font-mono">
                      {cafeCount} {language === 'ar' ? 'عملية' : 'orders'}
                    </p>
                  </div>
                </div>

                {/* 3. Pre-Paid Exclusions Warning Container (Chef / Accountant Guidelines) */}
                <div className="bg-amber-50/50 border border-amber-200/50 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-amber-100 p-2 rounded-lg text-amber-800">
                      <Info className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 uppercase">
                        {language === 'ar' ? 'تخليص الجلسات مسبقة الدفع (استهلاك الأرصدة والاشتراكات):' : 'Pre-Paid Service Clearance consumption ledger:'}
                      </h4>
                      <p className="text-[11px] text-gray-600 mt-1 leading-normal">
                        {language === 'ar' 
                          ? 'هذا القسم مخصص للكميات المستهلكة من باقات العملاء المدفوعة مسبقاً وتعتبر استهلاك لالتزام المؤسسة. تم استبعادها كلياً بنسبة 100% من حسابات الدلتا والمدخول في نفس الوقت من الصندوق أو شفت الموظف لمنع ازدواجية الحسابات المالية.'
                          : 'This represents the volume of client prepaid balances consumed in salon/gym. Under exact accounting laws, they are completely excluded from actual physical currency and cashier drawer computations.'}
                      </p>
                    </div>
                  </div>
                  <div className="md:text-right border-r md:border-r-0 md:border-l border-amber-200 pr-4 md:pr-0 md:pl-6 shrink-0">
                    <span className="text-[9px] uppercase font-extrabold text-gray-400">{language === 'ar' ? 'إجمالي القيمة المستبعدة' : 'Cumulative Excluded Volume'}</span>
                    <span className="block font-serif text-xl font-extrabold text-amber-700 tracking-tight mt-1">{prepaidVolume.toFixed(3)} BHD</span>
                  </div>
                </div>

                {/* 4. Branch Distribution Breakdown & Staff performance tables */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Branch Breakdown card */}
                  <div className="bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                      <Building2 className="w-5 h-5 text-brand-olive" />
                      <h3 className="font-serif text-base font-bold text-olive-dark text-start">
                        {language === 'ar' ? 'أداء الإيرادات وتوزيع الفروع الجغرافية' : 'Branch Financial performance Distribution'}
                      </h3>
                    </div>

                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {branchPerformanceList.map((branch) => (
                        <div key={branch.name} className="border border-gray-100 bg-olive-soft/10 p-4 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center justify-between border-b border-olive-light/40 pb-1">
                            <span className="font-serif font-bold text-sm text-olive-dark">{branch.name}</span>
                            <span className="text-xs font-bold font-mono text-brand-olive">{branch.totalDirect.toFixed(3)} BHD</span>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-1 text-[10px] text-gray-500">
                            <div>
                              <span>{language === 'ar' ? 'كاش: ' : 'Cash: '}</span>
                              <span className="font-bold text-gray-700 font-mono">{branch.cash.toFixed(3)}</span>
                            </div>
                            <div>
                              <span>{language === 'ar' ? 'شبكة: ' : 'Card: '}</span>
                              <span className="font-bold text-gray-700 font-mono">{branch.card.toFixed(3)}</span>
                            </div>
                            <div>
                              <span>{language === 'ar' ? 'بنفت: ' : 'Benefit: '}</span>
                              <span className="font-bold text-gray-700 font-mono">{branch.benefit.toFixed(3)}</span>
                            </div>
                          </div>

                          <div className="text-[9px] text-gray-400 bg-amber-50/40 px-2 py-1 rounded mt-1 flex justify-between">
                            <span>{language === 'ar' ? 'الاستهلاك لـ مسبق الدفع (مستبعد):' : 'Prepaid balance consumption:'}</span>
                            <span className="font-bold text-amber-800 font-mono">{branch.prepaidVolume.toFixed(3)} BHD ({branch.prepaidCount} {language === 'ar' ? 'عمليات' : 'Trx'})</span>
                          </div>
                        </div>
                      ))}

                      {branchPerformanceList.length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-400">{language === 'ar' ? 'لا يوجد فروع مسجلة' : 'No branches logged.'}</div>
                      )}
                    </div>
                  </div>

                  {/* Staff Shift performance card */}
                  <div className="bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                      <Users className="w-5 h-5 text-brand-olive" />
                      <h3 className="font-serif text-base font-bold text-olive-dark text-start">
                        {language === 'ar' ? 'تفصيل كشف أداء الموظفين والأخصائيين' : 'Staff Executive Delivery & Shift Ledger'}
                      </h3>
                    </div>

                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                      {staffPerformanceList.map((perf) => (
                        <div key={perf.name} className="border border-gray-100 bg-olive-soft/10 p-4 rounded-xl flex items-center justify-between gap-4">
                          <div>
                            <span className="font-serif text-sm font-bold text-olive-dark block">{perf.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono mt-1 block">
                              {perf.directCount} {language === 'ar' ? 'مبيعات مباشرة' : 'direct sales'} | {perf.prepaidCount} {language === 'ar' ? 'بطاقات استهلاك مسبق' : 'pre-paid cards consumed'}
                            </span>
                          </div>
                          
                          <div className="text-right">
                            <span className="text-xs uppercase font-extrabold text-brand-olive block font-mono">{perf.directTotal.toFixed(3)} BHD</span>
                            <span className="text-[9px] text-gray-400 block mt-1">
                              {language === 'ar' ? 'مسبق الدفع صفي: ' : 'Pre-paid cleared: '} <span className="font-bold text-amber-800 font-mono">{perf.prepaidVolume.toFixed(3)} BHD</span>
                            </span>
                          </div>
                        </div>
                      ))}

                      {staffPerformanceList.length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-400">{language === 'ar' ? 'لم يقم أي موظف بمعاملات اليوم' : 'No staff transactions registered.'}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. Cafe operations snapshot */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 shadow-sm">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-orange-700">{language === 'ar' ? 'إيراد الكافيه اليوم' : 'Today Cafe Revenue'}</div>
                    <div className="text-2xl font-serif font-extrabold text-orange-800 mt-2">{todayCafeRevenue.toFixed(3)} BHD</div>
                    <div className="text-[11px] text-gray-500 mt-2">{todayCafeCount} {language === 'ar' ? 'طلب' : 'orders'}</div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 shadow-sm">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-amber-700">{language === 'ar' ? 'إيراد الكافيه هذا الأسبوع' : 'This Week Cafe Revenue'}</div>
                    <div className="text-2xl font-serif font-extrabold text-amber-800 mt-2">{weekCafeRevenue.toFixed(3)} BHD</div>
                    <div className="text-[11px] text-gray-500 mt-2">{weekCafeCount} {language === 'ar' ? 'طلب' : 'orders'}</div>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 shadow-sm">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-700">{language === 'ar' ? 'متوسط الطلب الكافيه' : 'Average Cafe Order'}</div>
                    <div className="text-2xl font-serif font-extrabold text-emerald-800 mt-2">{todayCafeAverage.toFixed(3)} BHD</div>
                    <div className="text-[11px] text-gray-500 mt-2">{language === 'ar' ? 'استناداً إلى اليوم الحالي' : 'Based on today'}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
                    <div className="text-[10px] uppercase font-bold tracking-wider text-slate-700">{language === 'ar' ? 'إجمالي مبيعات الكافيه المختارة' : 'Selected Period Cafe Sales'}</div>
                    <div className="text-2xl font-serif font-extrabold text-slate-800 mt-2">{cafeRevenue.toFixed(3)} BHD</div>
                    <div className="text-[11px] text-gray-500 mt-2">{cafeCount} {language === 'ar' ? 'طلب' : 'orders'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-orange-100 pb-3 mb-4">
                      <Building2 className="w-5 h-5 text-orange-600" />
                      <h3 className="font-serif text-base font-bold text-orange-800 text-start">
                        {language === 'ar' ? 'توزيع مبيعات الكافيه حسب الفرع' : 'Cafe Sales by Branch'}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {cafeBranchPerformanceList.filter((item: any) => item.count > 0).map((item: any) => (
                        <div key={item.name} className="flex items-center justify-between rounded-lg border border-orange-100 bg-white px-3 py-2">
                          <span className="font-semibold text-sm text-gray-700">{item.name}</span>
                          <div className="text-right">
                            <div className="text-sm font-bold text-orange-700 font-mono">{item.revenue.toFixed(3)} BHD</div>
                            <div className="text-[10px] text-gray-500">{item.count} {language === 'ar' ? 'طلب' : 'orders'}</div>
                          </div>
                        </div>
                      ))}
                      {cafeBranchPerformanceList.filter((item: any) => item.count > 0).length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-400">{language === 'ar' ? 'لا توجد مبيعات كافيه في هذه الفترة' : 'No cafe sales in this period.'}</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 border-b border-orange-100 pb-3 mb-4">
                      <Users className="w-5 h-5 text-orange-600" />
                      <h3 className="font-serif text-base font-bold text-orange-800 text-start">
                        {language === 'ar' ? 'توزيع مبيعات الكافيه حسب الموظف' : 'Cafe Sales by Staff'}
                      </h3>
                    </div>
                    <div className="space-y-3">
                      {cafeStaffPerformanceList.filter((item: any) => item.count > 0).map((item: any) => (
                        <div key={item.name} className="flex items-center justify-between rounded-lg border border-orange-100 bg-white px-3 py-2">
                          <span className="font-semibold text-sm text-gray-700">{item.name}</span>
                          <div className="text-right">
                            <div className="text-sm font-bold text-orange-700 font-mono">{item.revenue.toFixed(3)} BHD</div>
                            <div className="text-[10px] text-gray-500">{item.count} {language === 'ar' ? 'طلب' : 'orders'}</div>
                          </div>
                        </div>
                      ))}
                      {cafeStaffPerformanceList.filter((item: any) => item.count > 0).length === 0 && (
                        <div className="text-center py-6 text-xs text-gray-400">{language === 'ar' ? 'لا توجد مبيعات كافيه مسجلة للموظفين' : 'No cafe sales recorded for staff.'}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 6. Detailed Invoices Audit table listing */}
                <div className="bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <FolderSync className="w-5 h-5 text-brand-olive" />
                      <h3 className="font-serif text-base font-bold text-olive-dark text-start">
                        {language === 'ar' ? 'سجل العمليات التفصيلي والتدقيق الدقيق' : 'Detailed Invoices Ledger & Audit Trail'}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedReportInvoices.length > 0 && (
                        <div className="flex items-center gap-2 bg-olive-soft/50 px-3 py-1.5 rounded-lg border border-olive-light/50 animate-fade-in">
                          <span className="text-[10px] font-bold text-olive-dark mr-2">
                            {selectedReportInvoices.length} {language === 'ar' ? 'محدد' : 'Selected'}
                          </span>
                          <select
                            value={bulkActionPaymentMethod}
                            onChange={(e) => setBulkActionPaymentMethod(e.target.value as PaymentMethod)}
                            className="text-xs border border-gray-200 outline-none rounded p-1 focus:border-brand-olive bg-white text-olive-dark font-sans"
                          >
                            <option value="">{language === 'ar' ? 'تغيير طريقة الدفع...' : 'Change Payment to...'}</option>
                            <option value="Cash">{language === 'ar' ? 'نقدي (كاش الصندوق)' : 'Cash'}</option>
                            <option value="Card">{language === 'ar' ? 'صراف وبطاقة بنكية' : 'Card'}</option>
                            <option value="BenefitPay">{language === 'ar' ? 'بنفت باي (BenefitPay)' : 'BenefitPay'}</option>
                            <option value="Paid Previously">{language === 'ar' ? 'مدفوع مسبقاً' : 'Paid Previously'}</option>
                          </select>
                          <button
                            onClick={handleBulkUpdatePaymentMethods}
                            disabled={!bulkActionPaymentMethod || isBulkUpdating}
                            className="px-3 py-1 bg-brand-olive hover:bg-brand-olive-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded text-xs font-bold transition-colors cursor-pointer"
                          >
                            {isBulkUpdating ? '...' : (language === 'ar' ? 'تطبيق' : 'Apply')}
                          </button>
                        </div>
                      )}
                      <span className="text-[11px] bg-olive-soft text-brand-olive px-2.5 py-1 rounded font-bold font-mono">
                        {filteredInvoices.length} {language === 'ar' ? 'إيصال مطابق للفلاتر' : 'Receipts'}
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50/50">
                          <th className="p-3 w-10 text-center">
                            <input
                              type="checkbox"
                              className="cursor-pointer accent-brand-olive w-4 h-4"
                              checked={filteredInvoices.length > 0 && selectedReportInvoices.length === filteredInvoices.length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedReportInvoices(filteredInvoices.map(i => i.id || ''));
                                } else {
                                  setSelectedReportInvoices([]);
                                }
                              }}
                            />
                          </th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'معرف العملية' : 'Invoice ID'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'اسم العميل' : 'Customer Full Name'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'الفرع جغرافياً' : 'Branch Location'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'المصدر' : 'Source'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'الخدمة / البيان المفوتر' : 'Direct Line Item description'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'طريقة السداد والبادج' : 'Settlement Badge'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right text-brand-olive font-extrabold">{language === 'ar' ? 'قيمة المعاملة' : 'Final Amount (BHD)'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'أنجز بطلب' : 'Logged by Agent'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'التوقيت' : 'Invoice Date & hour'}</th>
                          <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-center">{language === 'ar' ? 'الخيارات' : 'Options'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredInvoices.map((inv, index) => {
                          const isPrepaid = (inv.paymentMethod || '').trim().toLowerCase().includes('previously') || (inv.paymentMethod || '').trim().toLowerCase().includes('expired') || (inv.paymentMethod || '').trim().toLowerCase() === 'paid previously';
                          return (
                            <tr key={inv.id || index} className={`hover:bg-olive-soft/10 text-right ${selectedReportInvoices.includes(inv.id || '') ? 'bg-olive-soft/20' : ''}`}>
                              <td className="p-3 text-center">
                                <input
                                  type="checkbox"
                                  className="cursor-pointer accent-brand-olive w-4 h-4"
                                  checked={selectedReportInvoices.includes(inv.id || '')}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedReportInvoices([...selectedReportInvoices, inv.id || '']);
                                    } else {
                                      setSelectedReportInvoices(selectedReportInvoices.filter(id => id !== inv.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="p-3 font-mono text-gray-400 text-right">{inv.id?.substring(0, 8) || 'local-' + index}</td>
                              <td className="p-3 font-bold text-gray-900 text-right">{getInvoiceCustomerName(inv)}</td>
                              <td className="p-3 font-serif font-semibold text-olive-dark text-right">{inv.branch}</td>
                              <td className="p-3 text-right">
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                                  isCafeInvoice(inv) ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {isCafeInvoice(inv) ? (language === 'ar' ? 'كافيه' : 'Cafe') : (language === 'ar' ? 'عام' : 'General')}
                                </span>
                              </td>
                              <td className="p-3 text-gray-600 line-clamp-1 max-w-sm text-right" title={inv.description}>{inv.description}</td>
                              <td className="p-3 text-right">
                                <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                                  inv.paymentMethod === 'Cash' ? 'bg-amber-100 text-amber-700' :
                                  inv.paymentMethod === 'Card' ? 'bg-blue-100 text-blue-700' :
                                  inv.paymentMethod === 'BenefitPay' ? 'bg-emerald-100 text-emerald-700' :
                                  'bg-purple-100 text-purple-700'
                                }`}>
                                  {language === 'ar' ? (inv.paymentMethod === 'Cash' ? 'نقدي' :
                                                        inv.paymentMethod === 'Card' ? 'شبكة / صراف' :
                                                        inv.paymentMethod === 'BenefitPay' ? 'بنفت باي' : 'مسبق الدفع') :
                                    inv.paymentMethod}
                                </span>
                              </td>
                              <td className={`p-3 font-bold font-mono text-right ${isPrepaid ? 'text-gray-400 line-through decoration-purple-400' : 'text-olive-dark'}`}>
                                {inv.amount.toFixed(3)} BHD
                              </td>
                              <td className="p-3 text-gray-500 font-medium text-right relative group">
                                {editingInvoice?.id === inv.id ? (
                                  <div className="flex items-center gap-1 bg-white p-1 rounded border border-gray-200 shadow-sm absolute z-10 right-2 top-2 min-w-[150px]">
                                    <select 
                                      value={newStaffNameForInvoice} 
                                      onChange={(e) => setNewStaffNameForInvoice(e.target.value)}
                                      className="p-1 border rounded text-xs flex-1 bg-gray-50"
                                    >
                                      <option value="">{language === 'ar' ? 'اختر الموظف' : 'Select Staff'}</option>
                                      {staffList.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                                    </select>
                                    <button onClick={() => saveInvoiceStaff(inv.id!)} className="p-1 hover:bg-brand-olive/10 text-brand-olive rounded cursor-pointer transition-colors"><Check className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => setEditingInvoice(null)} className="p-1 hover:bg-gray-100 text-gray-400 rounded cursor-pointer transition-colors"><X className="w-3.5 h-3.5" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-2">
                                    <button 
                                      onClick={() => { setEditingInvoice({ id: inv.id!, currentStaffName: inv.staffName }); setNewStaffNameForInvoice(inv.staffName); }}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-brand-olive hover:bg-olive-soft/50 rounded transition-all cursor-pointer"
                                      title={language === 'ar' ? 'تعديل اسم الموظف' : 'Edit Staff'}
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                    <span>{inv.staffName}</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-3 text-gray-400 font-mono text-[11px] text-right" dir="ltr">
                                {new Date(inv.createdAt).toLocaleString(language === 'ar' ? 'ar-BH' : 'en-US')}
                              </td>
                              <td className="p-3 text-center">
                                <div className="flex items-center justify-center gap-1.5 flex-wrap w-full max-w-[120px] mx-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleRefundInvoice(inv)}
                                    className="p-1 px-1.5 rounded bg-orange-50 hover:bg-orange-100 text-orange-600 hover:text-orange-800 transition-colors flex items-center justify-center gap-1 text-[10px] font-bold uppercase cursor-pointer flex-1"
                                    title="Refund"
                                  >
                                    <RotateCcw className="w-3 h-3 text-orange-500" />
                                    <span>{language === 'ar' ? 'استرجاع' : 'Refund'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setAdminConfirmModal({
                                      isOpen: true,
                                      actionType: 'soft-delete-invoice',
                                      targetId: inv.id || '',
                                      targetName: `${inv.amount.toFixed(3)} BHD (${getInvoiceCustomerName(inv)})`
                                    })}
                                    className="p-1 px-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 transition-colors flex items-center justify-center gap-1 text-[10px] font-bold uppercase cursor-pointer flex-1"
                                    title="Delete"
                                  >
                                    <Trash2 className="w-3 h-3 text-rose-500" />
                                    <span>{language === 'ar' ? 'حذف' : 'Del'}</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}

                        {filteredInvoices.length === 0 && (
                          <tr>
                            <td colSpan={9} className="text-center py-10 text-gray-400 text-xs">
                              {language === 'ar' ? 'لم يتم العثور على أي كشف مطابق للفلاتر الراهنة.' : 'No invoices matched the current parameters.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Printable container view rendering inside PDF structure */}
                <div className="hidden print:block fixed inset-0 bg-white text-black p-8 font-sans z-[9100] text-start" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                  <div className="text-center border-b pb-6 mb-8 text-right">
                    <h1 className="text-2xl font-bold tracking-tight uppercase text-gray-900 text-center">{companyName}</h1>
                    <p className="text-xs uppercase tracking-widest text-gray-400 font-bold mt-1 text-center">
                      {language === 'ar' ? 'التقرير المالي للإدارة والشركاء' : 'Executive Financial & Operational Report'}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-2 font-mono text-center">
                      {language === 'ar' ? 'الفترة:' : 'Reporting Period:'} {startDate} ➔ {endDate}
                    </p>
                  </div>

                  {/* Printed KPIs Grid */}
                  <div className="grid grid-cols-4 gap-4 mb-8 text-right">
                    <div className="border p-4 rounded-xl">
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">{language === 'ar' ? 'المدخول المباشر الفعلي المستلم' : 'Net Cleared Direct Revenue'}</span>
                      <span className="text-lg font-bold mt-1 block font-mono">{totalDirectRevenue.toFixed(3)} BHD</span>
                    </div>
                    <div className="border p-4 rounded-xl">
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">{language === 'ar' ? 'إجمالي النقدي (كاش)' : 'Direct Cash received'}</span>
                      <span className="text-lg font-bold mt-1 block font-mono">{cashRevenue.toFixed(3)} BHD</span>
                    </div>
                    <div className="border p-4 rounded-xl">
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">{language === 'ar' ? 'إجمالي البطاقات والشبكة' : 'ATM & Credit Cards'}</span>
                      <span className="text-lg font-bold mt-1 block font-mono">{cardRevenue.toFixed(3)} BHD</span>
                    </div>
                    <div className="border p-4 rounded-xl">
                      <span className="text-[10px] text-gray-400 font-bold uppercase block">{language === 'ar' ? 'إجمالي بنفت باي' : 'BenefitPay Transfer'}</span>
                      <span className="text-lg font-bold mt-1 block font-mono">{benefitRevenue.toFixed(3)} BHD</span>
                    </div>
                  </div>

                  {/* Pre-Paid highlight */}
                  <div className="border border-blue-200 bg-blue-50/20 p-4 rounded-xl mb-8 text-right">
                    <h3 className="text-xs font-bold text-blue-800 uppercase text-right">{language === 'ar' ? 'تخليص الجلسات المسبقة الدفع (مستبعد كلياً من المداخل)' : 'Pre-Paid Vouchered Clearance (100% Excluded from Cash Revenues)'}</h3>
                    <p className="text-sm font-semibold text-blue-900 mt-1 font-mono text-right">{prepaidVolume.toFixed(3)} BHD</p>
                    <p className="text-[10px] text-gray-500 mt-1 text-right">{language === 'ar' ? 'تمت تصفية هذه القيمة مسبقاً وتعتبر استهلاكاً لأرصدة العملاء الحالية لليوم الحالي.' : 'This volume was settled previously and represents the non-cash consumption ledger for this reporting window.'}</p>
                  </div>

                  {/* Cafe performance summary in print */}
                  <div className="mb-8 text-right">
                    <h3 className="text-xs font-bold uppercase mb-3 border-b pb-1 text-gray-700">{language === 'ar' ? 'ملخص مبيعات الكافيه' : 'Cafe Sales Summary'}</h3>
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'الفرع' : 'Branch'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'الطلبات' : 'Orders'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'الإيراد' : 'Revenue'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cafeBranchPerformanceList.filter((item: any) => item.count > 0).map((item: any) => (
                          <tr key={item.name} className="border-b text-right">
                            <td className="p-2 font-bold">{item.name}</td>
                            <td className="p-2 font-mono">{item.count}</td>
                            <td className="p-2 font-bold font-mono">{item.revenue.toFixed(3)} BHD</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Branch performance summary in print */}
                  <div className="mb-8 text-right">
                    <h3 className="text-xs font-bold uppercase mb-3 border-b pb-1 text-gray-700">{language === 'ar' ? 'مداخيل الفروع المالية' : 'Branch Financial Performance'}</h3>
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'الفرع' : 'Branch'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'نقدي' : 'Cash'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'بطاقة' : 'Card'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'بنفت باي' : 'BenefitPay'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'إجمالي الدخل المباشر' : 'Net Direct Total'}</th>
                          <th className="p-2 font-semibold text-gray-400 text-right">{language === 'ar' ? 'مدفوع مسبقا' : 'Pre-Paid Excluded'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {branchPerformanceList.map(b => (
                          <tr key={b.name} className="border-b text-right">
                            <td className="p-2 font-bold text-right">{b.name}</td>
                            <td className="p-2 text-right font-mono">{b.cash.toFixed(3)} BHD</td>
                            <td className="p-2 text-right font-mono">{b.card.toFixed(3)} BHD</td>
                            <td className="p-2 text-right font-mono">{b.benefit.toFixed(3)} BHD</td>
                            <td className="p-2 font-bold text-right font-mono">{b.totalDirect.toFixed(3)} BHD</td>
                            <td className="p-2 text-gray-400 text-right font-mono">{b.prepaidVolume.toFixed(3)} BHD</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Staff performance summary in print */}
                  <div className="mb-8 text-right">
                    <h3 className="text-xs font-bold uppercase mb-3 border-b pb-1 text-gray-700">{language === 'ar' ? 'أداء وتحصيل الموظفين والأخصائيين' : 'Staff Sales & Delivery Ledger'}</h3>
                    <table className="w-full text-right border-collapse text-xs">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'اسم الموظف' : 'Staff Member'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'العمليات المباشرة' : 'Direct Trx'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'التحصيل المالي المباشر' : 'Direct Net Revenue'}</th>
                          <th className="p-2 font-semibold text-gray-400 text-right">{language === 'ar' ? 'الخدمات المسبقة الدفع' : 'Pre-Paid Trx'}</th>
                          <th className="p-2 font-semibold text-gray-400 text-right">{language === 'ar' ? 'حجم المسبق الدفع' : 'Pre-Paid Volume'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staffPerformanceList.map(s => (
                          <tr key={s.name} className="border-b text-right">
                            <td className="p-2 font-bold text-right">{s.name}</td>
                            <td className="p-2 text-right font-mono">{s.directCount}</td>
                            <td className="p-2 font-bold text-right font-mono">{s.directTotal.toFixed(3)} BHD</td>
                            <td className="p-2 text-right font-mono">{s.prepaidCount}</td>
                            <td className="p-2 text-right font-mono">{s.prepaidVolume.toFixed(3)} BHD</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Invoice detail in print */}
                  <div className="text-right">
                    <h3 className="text-xs font-bold uppercase mb-3 border-b pb-1 text-gray-700">{language === 'ar' ? 'سجل العمليات الدقيق للفترة' : 'Detailed Invoices ledger'}</h3>
                    <table className="w-full text-right border-collapse text-[10px]">
                      <thead>
                        <tr className="border-b bg-gray-50 text-right">
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'المعرف' : 'ID'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'الفرع' : 'Branch'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'البيان' : 'Description'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'طريقة الدفع' : 'Method'}</th>
                          <th className="p-2 font-bold text-gray-700 text-right">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInvoices.map((inv, index) => (
                          <tr key={inv.id || index} className="border-b text-right">
                            <td className="p-2 font-mono text-gray-400 text-right">{inv.id?.substring(0, 8) || index+1}</td>
                            <td className="p-2 text-right">{getInvoiceCustomerName(inv)}</td>
                            <td className="p-2 text-right">{inv.branch}</td>
                            <td className="p-2 text-right">{inv.description}</td>
                            <td className="p-2 uppercase text-right font-bold">{inv.paymentMethod}</td>
                            <td className="p-2 font-bold text-right font-mono">{inv.amount.toFixed(3)} BHD</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
    </div>
  );
}

