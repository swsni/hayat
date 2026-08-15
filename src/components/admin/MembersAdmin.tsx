import React, { useState } from 'react';
import { useAdminContext } from './AdminContext';
import { useLanguage } from '../../LanguageContext';
import { Users, Search, Trash2 } from 'lucide-react';

export default function MembersAdmin() {
  const { language, t } = useLanguage();
  const { customersList, customerPackagesList, packagesList, gymList, setAdminConfirmModal } = useAdminContext();

  const [membersFilter, setMembersFilter] = useState<string>('all');

  // Logic from the IIFE
            // Computed filtered members
            const activeCustomers = customersList.filter(c => !c.isDeleted);
            let filteredActiveCustomers = activeCustomers;
            
            if (membersFilter !== 'all') {
              filteredActiveCustomers = activeCustomers.filter(c => {
                const cPkgs = customerPackagesList.filter(p => p.customerId === c.id);
                if (membersFilter === 'gym') {
                  return cPkgs.some(p => {
                    if (p.category !== 'gym' || !p.isActive) return false;
                    if (!p.endDate) return true;
                    const end = new Date(p.endDate);
                    end.setHours(23, 59, 59, 999);
                    return end >= new Date();
                  });
                }
                if (membersFilter === 'salon') {
                  return cPkgs.some(p => p.category === 'salon' && p.isActive && p.remainingSessions > 0);
                }
                if (membersFilter.startsWith('pkg-')) {
                  const pId = membersFilter.replace('pkg-', '');
                  return cPkgs.some(p => p.packageId === pId);
                }
                return true;
              });
            }

  return (
    <>
            <div className="bg-white border border-olive-light rounded-2xl p-6 shadow-sm animate-fade-in text-start">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4 mb-6 gap-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-olive-light rounded-lg text-brand-olive shrink-0 animate-pulse">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold text-olive-dark">
                      {language === 'ar' ? 'دليل الأعضاء والمشتركين النشطين' : 'Active Members Directory'}
                    </h3>
                    <p className="text-xs text-gray-400 mt-0.5 font-sans">
                      {language === 'ar' ? 'عرض وتصفية جميع العملاء المسجلين في النظام والتحكم بصلاحياتهم' : 'View, search and manage all registered customer accounts.'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="text-[11px] bg-olive-soft text-brand-olive px-3 py-1 rounded-full font-bold font-sans self-start sm:self-auto">
                    {filteredActiveCustomers.length} {language === 'ar' ? 'مشترك نشط' : 'Active Members'}
                  </div>
                  <select
                    value={membersFilter}
                    onChange={(e) => setMembersFilter(e.target.value)}
                    className="w-full sm:w-auto px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs outline-none focus:border-brand-olive transition-all font-sans text-olive-dark font-bold"
                  >
                    <option value="all">{language === 'ar' ? 'جميع الأعضاء' : 'All Members'}</option>
                    <option value="gym">{language === 'ar' ? 'مشتركي الجم' : 'Gym Members'}</option>
                    <option value="salon">{language === 'ar' ? 'عملاء الصالون' : 'Salon Customers'}</option>
                    <optgroup label={language === 'ar' ? 'حسب الباقات' : 'By Package'}>
                      {[...packagesList, ...gymList].map(pkg => (
                        <option key={pkg.id} value={`pkg-${pkg.id}`}>
                          {pkg.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-sans">
                  <thead>
                    <tr className="border-b bg-gray-50/50 text-right">
                      <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'اسم العميل' : 'Name'}</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'رقم الهاتف' : 'Contact Phone'}</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-right">{language === 'ar' ? 'تاريخ التسجيل' : 'Registered Date'}</th>
                      <th className="p-3 font-semibold text-gray-500 uppercase tracking-wider text-center">{language === 'ar' ? 'الخيارات' : 'Options'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredActiveCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-olive-soft/10 text-right transition-colors">
                        <td className="p-3 font-bold text-gray-900 text-right">
                          <div className="flex items-center gap-2.5 justify-start">
                            <div className="w-7 h-7 rounded-full bg-olive-light text-brand-olive flex items-center justify-center font-bold">
                              {customer.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-serif">{customer.name}</span>
                          </div>
                        </td>
                        <td className="p-3 font-mono text-gray-600 text-right">{customer.phone}</td>
                        <td className="p-3 text-gray-400 text-right font-mono">
                          {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString(language === 'ar' ? 'ar-BH' : 'en-US') : '-'}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => setAdminConfirmModal({
                              isOpen: true,
                              actionType: 'soft-delete-customer',
                              targetId: customer.id || '',
                              targetName: customer.name
                            })}
                            className="p-1.5 px-3 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 transition-all font-bold text-[10px] uppercase flex items-center justify-center gap-1 cursor-pointer mx-auto border border-transparent hover:border-rose-200"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'حذف من النظام' : 'Delete'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}

                    {filteredActiveCustomers.length === 0 && (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-gray-400 text-xs">
                          {language === 'ar' ? 'لا يوجد عملاء يطابقون الفلتر المحدد.' : 'No members match the selected filter.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
    </>
  );



}
