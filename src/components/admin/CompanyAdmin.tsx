import React, { useState } from 'react';
import { useAdminContext } from './AdminContext';
import { useLanguage } from '../../LanguageContext';
import { Building2, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { setDoc, doc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase';

export default function CompanyAdmin() {
  const { language, t } = useLanguage();
  const { editCompanyNameInput, setEditCompanyNameInput, editPublicAppUrlInput, setEditPublicAppUrlInput, availableBranches, onBranchesUpdate, onCompanyNameUpdate, triggerToast, actionLoading, handleWipeCustomerData, setActionLoading, companyName, setAdminConfirmModal } = useAdminContext();

  const [newBranchInput, setNewBranchInput] = useState('');

  const handleAddBranch = async () => {
    const trimmed = newBranchInput.trim();
    if (!trimmed) return;
    if (availableBranches.includes(trimmed)) {
      triggerToast('Branch already registered.', 'error');
      return;
    }

    const updatedBranches = [...availableBranches, trimmed];
    setActionLoading(true);
    try {
      if (isFirebaseConfigured && db) {
        await setDoc(doc(db, 'settings', 'config'), {
          companyName: companyName,
          branches: updatedBranches,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      onBranchesUpdate(updatedBranches);
      setNewBranchInput('');
      triggerToast('New branch added successfully!');
    } catch (err) {
      triggerToast('Failed to add branch to configuration.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBranch = async (branch: string) => {
    if (availableBranches.length <= 1) {
      triggerToast('At least one operational branch is required.', 'error');
      return;
    }

    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: branch,
      targetName: branch,
      onConfirm: async () => {
        const updatedBranches = availableBranches.filter(b => b !== branch);
        setActionLoading(true);
        try {
          if (isFirebaseConfigured && db) {
            await setDoc(doc(db, 'settings', 'config'), {
              companyName: companyName,
              branches: updatedBranches,
              updatedAt: new Date().toISOString()
            }, { merge: true });
          }
          onBranchesUpdate(updatedBranches);
          triggerToast(`Branch ${branch} removed.`);
        } catch (err) {
          triggerToast('Failed to remove branch.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  const handleSaveCompanySettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCompanyNameInput.trim()) return;

    setActionLoading(true);
    try {
      if (isFirebaseConfigured && db) {
        await setDoc(doc(db, 'settings', 'config'), {
          companyName: editCompanyNameInput.trim(),
          publicAppUrl: editPublicAppUrlInput.trim(),
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
      onCompanyNameUpdate(editCompanyNameInput.trim());
      triggerToast('Company settings locked successfully.');
    } catch (err) {
      triggerToast('Error updating company parameters.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
                      <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Company Branding Name Panel */}
                <div className="bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                  <h3 className="font-serif text-lg font-bold text-olive-dark border-b border-gray-100 pb-2 mb-4">
                    Global Enterprise Parameters
                  </h3>

                  <form onSubmit={handleSaveCompanySettings} className="flex flex-col gap-4">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none font-sans">
                        Company Brand Name
                      </label>
                      <input
                        id="company-setting-name"
                        type="text"
                        value={editCompanyNameInput}
                        onChange={e => setEditCompanyNameInput(e.target.value)}
                        disabled={actionLoading}
                        className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark font-sans disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none font-sans">
                        عنوان الرابط العام للتطبيق (Public App URL)
                      </label>
                      <input
                        id="company-setting-public-url"
                        type="url"
                        placeholder="https://yourcustomdomain.com or Cloud Run URL"
                        value={editPublicAppUrlInput}
                        onChange={e => setEditPublicAppUrlInput(e.target.value)}
                        disabled={actionLoading}
                        className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark font-sans disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <p className="text-[10px] text-gray-400 mt-1 leading-normal" dir="rtl">
                        العنوان الخارجي الذي يربط الهواتف بسيرفر البطاقات. إذا كنت تستخدمlocalhost محلياً في الصالون، صِل سيرفرك بنفق خارجي (مثل ngrok) ثم ضع الرابط هنا حتى تعمل البطاقة عند مسحها بالهاتف الخلوي (4G/5G).
                      </p>
                    </div>

                    <button
                      id="company-setting-submit"
                      type="submit"
                      disabled={actionLoading}
                      className="w-full h-9 rounded bg-brand-olive hover:bg-brand-olive-hover text-white text-xs font-semibold uppercase tracking-wider transition-all duration-300 shadow cursor-pointer text-center mt-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? 'Processing...' : 'Lock Brand Configurations'}
                    </button>
                  </form>
                </div>

                {/* Operations Branches Panel */}
                <div className="bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                  <h3 className="font-serif text-lg font-bold text-olive-dark border-b border-gray-100 pb-2 mb-4">
                    Hub Operations Branches
                  </h3>

                  {/* Form to append a branch */}
                  <div className="flex gap-2 mb-4">
                    <input
                      id="branch-setting-input"
                      type="text"
                      placeholder="New branch location..."
                      value={newBranchInput}
                      onChange={e => setNewBranchInput(e.target.value)}
                      disabled={actionLoading}
                      className="flex-grow text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    />
                    <button
                      id="branch-setting-submit"
                      onClick={handleAddBranch}
                      disabled={actionLoading}
                      className="px-3 rounded bg-olive-dark hover:bg-olive-dark-hover text-white text-xs font-semibold uppercase transition-all duration-300 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Branches directory display */}
                  <div className="space-y-2">
                    {availableBranches.map((bName) => (
                      <div 
                        key={bName}
                        className="p-3 border border-gray-100 rounded-lg bg-olive-soft/30 flex items-center justify-between"
                      >
                        <span className="font-serif font-semibold text-sm text-olive-dark">
                          {bName}
                        </span>
                        
                        <button
                          id={`branch-del-btn-${bName}`}
                          onClick={() => handleDeleteBranch(bName)}
                          disabled={actionLoading}
                          className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-505 hover:text-red-700 transition-all cursor-pointer text-xs disabled:cursor-not-allowed disabled:opacity-60"
                          title="Deregister Branch"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

              </div>


              {/* Master System Data Clearance / Purge Panel */}
              <div id="master-system-clearance-block" className="bg-rose-50 border border-rose-200 rounded-xl p-6 shadow-sm mt-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
                      <ShieldAlert className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-serif text-lg font-bold text-rose-900" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                        {language === 'ar' ? 'منطقة التهيئة والتنظيف الشامل لقاعدة البيانات' : 'Emergency Action: Complete Purge Area'}
                      </h3>
                      <p className="text-xs text-rose-700/80 mt-1 leading-relaxed max-w-2xl font-sans text-right" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                        {language === 'ar' ? (
                          <>
                            أنت على وشك تهيئة النظام تمهيداً للإطلاق الحقيقي للعلامة التجارية لـ <strong className="text-rose-950 font-bold">hayat.beauty</strong>.
                            سيقوم هذا الإجراء الآمن بمسح وتنظيف جميع بيانات <strong>العملاء، المشتريات، سجل الحركة، والعمليات الحسابية السابقة (كاش، بنفت، وبطاقة)</strong> بالكامل لتصفير السجلات والتقرير المالي للتطبيق.
                            <br />
                            <strong className="text-rose-1000 font-bold block mt-1.5 text-rose-950">البيانات التي ستبقى محفوظة ولن تُمسح أبداً:</strong>
                            ✓ جميع حسابات الموظفين والـ PIN والأدوار. <br />
                            ✓ قائمة الباقات والاشتراكات المعتمدة في المرفق (الصالون والجيم).
                          </>
                        ) : (
                          <>
                            You are about to launch <strong className="text-rose-950 font-bold">hayat.beauty</strong> production environment! 
                            This button wipes all testing, temporary and past data including <strong>customer profiles, package entitlements, activity/system logs, and transactions (Cash, BenefitPay, and Credit Card invoices)</strong>.
                            <br />
                            <strong className="text-rose-950 font-bold block mt-1.5">What is 100% PRESERVED & safe from deletion:</strong>
                            ✓ Registered employees, PIN keys, and access permissions. <br />
                            ✓ Global catalog packages and salon services.
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    id="master-db-clearance-btn"
                    onClick={handleWipeCustomerData}
                    className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-rose-650 hover:bg-rose-700 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-md cursor-pointer shrink-0 font-sans md:self-center"
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {language === 'ar' ? 'تنظيف تصفير النظام والعمليات السابقة' : 'Wipe Testing & Operation Data'}
                    </span>
                  </button>
                </div>
              </div>

            </div>
    </>
  );
}

