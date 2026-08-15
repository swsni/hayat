import React, { useState } from 'react';
import { useAdminContext } from './AdminContext';
import { useLanguage } from '../../LanguageContext';
import { Trash2, ShieldAlert, Info, GripVertical, RotateCcw, Users, BarChart3, FolderSync } from 'lucide-react';

export default function RecycleBinAdmin() {
  const { language, t } = useLanguage();
  const { customersList, invoicesList, setAdminConfirmModal, selectedRecycleCustomers, setSelectedRecycleCustomers, selectedRecycleInvoices, setSelectedRecycleInvoices, actionLoading, getInvoiceCustomerName } = useAdminContext();

  return (
    <div className="flex flex-col gap-6">
                      <div className="space-y-8 animate-fade-in text-start">
              
              {/* Informational Header */}
              <div className="bg-gradient-to-r from-rose-50 to-rose-100/30 border border-rose-100 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 bg-rose-500 rounded-xl text-white shrink-0 shadow-sm animate-bounce">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-serif text-lg font-bold text-rose-950">
                      {language === 'ar' ? 'سلة المهملات والحماية من الحذف العشوائي' : 'Administrative Recycle Bin'}
                    </h3>
                    <p className="text-xs text-rose-800 leading-relaxed font-sans">
                      {language === 'ar'
                        ? 'تُحفظ سجلات الأعضاء والفواتير الممسوحة مؤقتاً هنا لمدة 3 أيام تلقائياً لحمايتها من الحذف العشوائي أو الخاطئ، ويمكن للأدمن اختيار استرجاعها بكبسة زر، أو حذفها نهائياً.'
                        : 'Temporary storage area for deleted members and bills. Items are held securely for 3 days for protection against accidental losses before being permanently cleared.'}
                    </p>
                  </div>
                </div>
                {/* Empty All Button */}
                {(customersList.filter(c => c.isDeleted).length > 0 || invoicesList.filter(i => i.isDeleted).length > 0) && (
                  <button
                    onClick={() => setAdminConfirmModal({
                      isOpen: true,
                      actionType: 'empty-all-recycle-bin',
                      targetId: 'all',
                      targetName: language === 'ar' ? 'سلة المهملات بالكامل' : 'entire recycle bin'
                    })}
                    disabled={actionLoading}
                    className="shrink-0 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 className="w-4 h-4" />
                    {language === 'ar' ? 'إفراغ السلة بالكامل' : 'Empty All Recycle Bin'}
                  </button>
                )}
              </div>

              {/* Subdivision 1: Deleted Customers */}
              <div className="bg-white border border-olive-light rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3.5 mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
                    <h4 className="font-serif text-sm font-bold text-gray-800">
                      {language === 'ar' ? 'الأعضاء والعملاء المحذوفين مؤقتاً' : 'Soft-Deleted Members / Customers'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedRecycleCustomers.length > 0 && (
                      <div className="flex items-center gap-2 animate-fade-in">
                        <button
                          onClick={() => setAdminConfirmModal({
                            isOpen: true,
                            actionType: 'restore-multiple-customers',
                            targetId: 'multiple',
                            targetName: language === 'ar' ? `${selectedRecycleCustomers.length} أعضاء` : `${selectedRecycleCustomers.length} members`
                          })}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FolderSync className="w-4 h-4" />
                          {language === 'ar' ? 'استعادة المحدد' : 'Restore Selected'}
                        </button>
                        <button
                          onClick={() => setAdminConfirmModal({
                            isOpen: true,
                            actionType: 'permanent-delete-multiple-customers',
                            targetId: 'multiple',
                            targetName: language === 'ar' ? `${selectedRecycleCustomers.length} أعضاء` : `${selectedRecycleCustomers.length} members`
                          })}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="w-4 h-4" />
                          {language === 'ar' ? 'حذف المحدد نهائياً' : 'Purge Selected'}
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] bg-rose-50 text-rose-600 px-2.5 py-0.5 rounded-full font-bold">
                      {customersList.filter(c => c.isDeleted).length} {language === 'ar' ? 'معلقين بالسلة' : 'Pending Cleanup'}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto font-sans">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50/50 text-right">
                        <th className="p-3 w-10 text-center">
                          <input 
                            type="checkbox" 
                            className="cursor-pointer accent-rose-500 w-4 h-4"
                            checked={customersList.filter(c => c.isDeleted).length > 0 && selectedRecycleCustomers.length === customersList.filter(c => c.isDeleted).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecycleCustomers(customersList.filter(c => c.isDeleted).map(c => c.id || ''));
                              } else {
                                setSelectedRecycleCustomers([]);
                              }
                            }}
                          />
                        </th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'اسم العميل' : 'Customer Name'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'رقم الهاتف' : 'Phone'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'تاريخ النقل للسلة' : 'Moved To Bin At'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'رصيد الوقت المتبقي' : 'Time Left'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-center">{language === 'ar' ? 'الخيارات المتاحة' : 'Available Restorations'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {customersList.filter(c => c.isDeleted).map((customer) => {
                        const deletedAtStr = customer.deletedAt || new Date().toISOString();
                        const hoursElapsed = Math.floor((new Date().getTime() - new Date(deletedAtStr).getTime()) / (1000 * 60 * 60));
                        const hoursLeft = Math.max(0, 72 - hoursElapsed);
                        const daysLeft = Math.ceil(hoursLeft / 24);
                        return (
                          <tr key={customer.id} className="hover:bg-rose-50/15 text-right transition-colors">
                            <td className="p-3 text-center">
                              <input 
                                type="checkbox" 
                                className="cursor-pointer accent-rose-500 w-4 h-4"
                                checked={selectedRecycleCustomers.includes(customer.id || '')}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRecycleCustomers([...selectedRecycleCustomers, customer.id || '']);
                                  } else {
                                    setSelectedRecycleCustomers(selectedRecycleCustomers.filter(id => id !== customer.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="p-3 font-bold text-gray-900 text-right font-serif">{customer.name}</td>
                            <td className="p-3 font-mono text-gray-600 text-right">{customer.phone}</td>
                            <td className="p-3 text-gray-400 text-right font-mono">
                              {new Date(deletedAtStr).toLocaleString(language === 'ar' ? 'ar-BH' : 'en-US')}
                            </td>
                            <td className="p-3 text-right">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono ${
                                hoursLeft <= 12 ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {language === 'ar' ? `${daysLeft} يوم (${hoursLeft % 24} س)` : `${daysLeft}d (${hoursLeft % 24}h)`}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAdminConfirmModal({
                                    isOpen: true,
                                    actionType: 'restore-customer',
                                    targetId: customer.id || '',
                                    targetName: customer.name
                                  })}
                                  disabled={actionLoading}
                                  className="p-1 px-2.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800 font-bold text-[10px] uppercase transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <FolderSync className="w-3.5 h-3.5 animate-spin" />
                                  <span>{language === 'ar' ? 'استعادة السجل' : 'Restore'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminConfirmModal({
                                    isOpen: true,
                                    actionType: 'permanent-delete-customer',
                                    targetId: customer.id || '',
                                    targetName: customer.name
                                  })}
                                  disabled={actionLoading}
                                  className="p-1 px-2.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 font-bold text-[10px] uppercase transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{language === 'ar' ? 'حذف قطعي' : 'Purge'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {customersList.filter(c => c.isDeleted).length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-gray-400 text-xs">
                            {language === 'ar' ? 'لا يوجد عملاء ممسوحين حالياً.' : 'No members in Recycle Bin.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Subdivision 2: Deleted Invoices */}
              <div className="bg-white border border-olive-light rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3.5 mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-rose-500 shrink-0 animate-pulse" />
                    <h4 className="font-serif text-sm font-bold text-gray-800">
                      {language === 'ar' ? 'الفواتير والمبيعات المحذوفة مؤقتاً' : 'Soft-Deleted Invoices / Sales'}
                    </h4>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedRecycleInvoices.length > 0 && (
                      <div className="flex items-center gap-2 animate-fade-in">
                        <button
                          onClick={() => setAdminConfirmModal({
                            isOpen: true,
                            actionType: 'restore-multiple-invoices',
                            targetId: 'multiple',
                            targetName: language === 'ar' ? `${selectedRecycleInvoices.length} فواتير` : `${selectedRecycleInvoices.length} invoices`
                          })}
                          className="px-3 py-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <FolderSync className="w-4 h-4" />
                          {language === 'ar' ? 'استعادة المحدد' : 'Restore Selected'}
                        </button>
                        <button
                          onClick={() => setAdminConfirmModal({
                            isOpen: true,
                            actionType: 'permanent-delete-multiple-invoices',
                            targetId: 'multiple',
                            targetName: language === 'ar' ? `${selectedRecycleInvoices.length} فواتير` : `${selectedRecycleInvoices.length} invoices`
                          })}
                          className="px-3 py-1.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          {language === 'ar' ? 'حذف المحدد نهائياً' : 'Purge Selected'}
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] bg-rose-50 text-rose-600 px-2.5 py-0.5 rounded-full font-bold">
                      {invoicesList.filter(i => i.isDeleted).length} {language === 'ar' ? 'معلقين بالسلة' : 'Pending Cleanup'}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto font-sans">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50/50 text-right">
                        <th className="p-3 w-10 text-center">
                          <input 
                            type="checkbox" 
                            className="cursor-pointer accent-rose-500 w-4 h-4"
                            checked={invoicesList.filter(i => i.isDeleted).length > 0 && selectedRecycleInvoices.length === invoicesList.filter(i => i.isDeleted).length}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRecycleInvoices(invoicesList.filter(i => i.isDeleted).map(i => i.id || ''));
                              } else {
                                setSelectedRecycleInvoices([]);
                              }
                            }}
                          />
                        </th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'رقم الفاتورة' : 'ID'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'العميل' : 'Customer'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'محتوى الفاتورة' : 'Items'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'القيمة' : 'Amount'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'رصيد الوقت المتبقي' : 'Time Left'}</th>
                        <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-center">{language === 'ar' ? 'الخيارات المتاحة' : 'Restores'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {invoicesList.filter(i => i.isDeleted).map((inv, idx) => {
                        const deletedAtStr = inv.deletedAt || new Date().toISOString();
                        const hoursElapsed = Math.floor((new Date().getTime() - new Date(deletedAtStr).getTime()) / (1000 * 60 * 60));
                        const hoursLeft = Math.max(0, 72 - hoursElapsed);
                        const daysLeft = Math.ceil(hoursLeft / 24);
                        return (
                          <tr key={inv.id || idx} className="hover:bg-rose-50/15 text-right transition-colors font-sans">
                            <td className="p-3 text-center">
                              <input 
                                type="checkbox" 
                                className="cursor-pointer accent-rose-500 w-4 h-4"
                                checked={selectedRecycleInvoices.includes(inv.id || '')}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRecycleInvoices([...selectedRecycleInvoices, inv.id || '']);
                                  } else {
                                    setSelectedRecycleInvoices(selectedRecycleInvoices.filter(id => id !== inv.id));
                                  }
                                }}
                              />
                            </td>
                            <td className="p-3 font-mono text-gray-400 text-right">{inv.id?.substring(0, 8) || 'idx-' + idx}</td>
                            <td className="p-3 font-bold text-gray-900 text-right font-serif">{getInvoiceCustomerName(inv)}</td>
                            <td className="p-3 text-gray-600 line-clamp-1 max-w-xs text-right" title={inv.description}>{inv.description}</td>
                            <td className="p-3 font-bold text-gray-900 text-right font-mono">{inv.amount?.toFixed(3)} BHD</td>
                            <td className="p-3 text-right">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono ${
                                hoursLeft <= 12 ? 'bg-rose-100 text-rose-700 animate-pulse' : 'bg-gray-100 text-gray-600'
                              }`}>
                                {language === 'ar' ? `${daysLeft} يوم (${hoursLeft % 24} س)` : `${daysLeft}d (${hoursLeft % 24}h)`}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setAdminConfirmModal({
                                    isOpen: true,
                                    actionType: 'restore-invoice',
                                    targetId: inv.id || '',
                                    targetName: `${inv.amount?.toFixed(3)} BHD (${getInvoiceCustomerName(inv)})`
                                  })}
                                  disabled={actionLoading}
                                  className="p-1 px-2.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800 font-bold text-[10px] uppercase transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <FolderSync className="w-3.5 h-3.5 animate-spin" />
                                  <span>{language === 'ar' ? 'استعادة السجل' : 'Restore'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAdminConfirmModal({
                                    isOpen: true,
                                    actionType: 'permanent-delete-invoice',
                                    targetId: inv.id || '',
                                    targetName: `${inv.amount?.toFixed(3)} BHD`
                                  })}
                                  disabled={actionLoading}
                                  className="p-1 px-2.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-500 hover:text-rose-700 font-bold text-[10px] uppercase transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{language === 'ar' ? 'حذف قطعي' : 'Purge'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {invoicesList.filter(i => i.isDeleted).length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-10 text-gray-400 text-xs">
                            {language === 'ar' ? 'لا يوجد فواتير ممسوحة حالياً.' : 'No invoices in Recycle Bin.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
    </div>
  );
}

