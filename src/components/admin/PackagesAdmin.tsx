import React, { useState } from 'react';
import { useAdminContext } from './AdminContext';
import { useLanguage } from '../../LanguageContext';
import { Tag, Plus, Edit3, Trash2, X } from 'lucide-react';
import { Package } from '../../types';
import { savePackageData, deletePackageData, PackageFormState } from './packageHelpers';

export default function PackagesAdmin() {
  const { language, t } = useLanguage();
  const { packagesList, gymList, triggerToast, loadAllData, actionLoading, setActionLoading, setAdminConfirmModal } = useAdminContext();

  const [packageForm, setPackageForm] = useState({
    id: '',
    name: '',
    price: '',
    sessions: '1',
    category: 'salon' as 'salon' | 'gym',
    targetBranch: ''
  });
  const [isEditingPackage, setIsEditingPackage] = useState(false);

  const handleSavePackage = async (e: React.FormEvent, category: 'salon' | 'gym') => {
    e.preventDefault();
    if (!packageForm.name || !packageForm.price || !packageForm.sessions) {
      triggerToast('Please fill out all service parameters.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      await savePackageData(packageForm as PackageFormState, isEditingPackage, category, packagesList, gymList);
      triggerToast(isEditingPackage ? 'Service package updated!' : 'New package published!');
      setPackageForm({ id: '', name: '', price: '', sessions: '1', category: 'salon', targetBranch: '' });
      setIsEditingPackage(false);
      loadAllData();
    } catch (err) {
      console.error('[PackagesAdmin] savePackageData failed', err);
      triggerToast('Could not persist package metrics.', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditPackage = (pkg: Package) => {
    setPackageForm({
      id: pkg.id,
      name: pkg.name,
      price: pkg.price.toString(),
      sessions: pkg.sessions.toString(),
      category: pkg.category,
      targetBranch: pkg.targetBranch || ''
    });
    setIsEditingPackage(true);
  };

  const handleDeletePackage = async (id: string) => {
    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: id,
      targetName: 'Salon package',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await deletePackageData(id, packagesList, gymList);
          triggerToast('Package successfully deleted.');
          loadAllData();
        } catch (err) {
          console.error('[PackagesAdmin] deletePackageData failed', err);
          triggerToast('Failed to delete package.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  return (
    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Form Input panel */}
              <div className="md:col-span-1 bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                <h3 className="font-serif text-lg font-bold text-olive-dark border-b border-gray-100 pb-2 mb-4">
                  {isEditingPackage && packageForm.category === 'salon' ? 'Modify Package' : 'Register Salon Package'}
                </h3>

                <form onSubmit={e => handleSavePackage(e, 'salon')} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none">
                      Package Name
                    </label>
                    <input
                      id="package-form-name"
                      type="text"
                      placeholder="e.g. Henna with Blowdry"
                      value={packageForm.name}
                      onChange={e => setPackageForm({ ...packageForm, name: e.target.value })}
                      disabled={actionLoading}
                      className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none">
                      Price (BHD)
                    </label>
                    <input
                      id="package-form-price"
                      type="number"
                      step="0.001"
                      placeholder="e.g. 25.000"
                      value={packageForm.price}
                      onChange={e => setPackageForm({ ...packageForm, price: e.target.value })}
                      disabled={actionLoading}
                      className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none">
                      Number of Sessions
                    </label>
                    <input
                      id="package-form-sessions"
                      type="number"
                      placeholder="1"
                      value={packageForm.sessions}
                      onChange={e => setPackageForm({ ...packageForm, sessions: e.target.value })}
                      disabled={actionLoading}
                      className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none">
                      {language === 'ar' ? 'الفرع المستهدف' : 'Target Branch'}
                    </label>
                    <select
                      value={packageForm.targetBranch}
                      onChange={e => setPackageForm({ ...packageForm, targetBranch: e.target.value })}
                      disabled={actionLoading}
                      className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="">{language === 'ar' ? 'جميع الفروع (الافتراضي)' : 'All Branches (Default)'}</option>
                      <option value="Qatar">{language === 'ar' ? 'قطر فقط' : 'Qatar Only'}</option>
                    </select>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      id="package-form-submit"
                      type="submit"
                      disabled={actionLoading}
                      className="flex-grow h-9 rounded bg-brand-olive hover:bg-brand-olive-hover text-white text-xs font-semibold uppercase tracking-wider transition-all duration-300 shadow cursor-pointer text-center disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? 'Processing...' : (isEditingPackage && packageForm.category === 'salon' ? 'Save Changes' : 'Register Package')}
                    </button>
                    {isEditingPackage && (
                      <button
                        type="button"
                        onClick={() => {
                          setPackageForm({ id: '', name: '', price: '', sessions: '1', category: 'salon', targetBranch: '' });
                          setIsEditingPackage(false);
                        }}
                        disabled={actionLoading}
                        className="h-9 px-3 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>

              {/* List Panel */}
              <div className="md:col-span-2 bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                <h3 className="font-serif text-lg font-bold text-olive-dark border-b border-gray-100 pb-2 mb-4">
                  Active Salon Services Catalogue
                </h3>

                <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                  {packagesList.map(pkg => (
                    <div 
                      key={pkg.id}
                      className="p-3 border border-gray-150 rounded-lg hover:border-brand-olive/30 flex items-center justify-between gap-4 transition-all"
                    >
                      <div>
                        <h4 className="font-serif font-bold text-sm text-olive-dark">
                          {pkg.name}
                        </h4>
                        <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">
                          Sessions: {pkg.sessions} count
                        </span>
                        {pkg.targetBranch && pkg.targetBranch.toLowerCase().includes('qatar') && (
                          <span className="ml-2 text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">
                            Qatar Only
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs font-extrabold text-brand-olive bg-olive-light/50 px-2.5 py-1 rounded">
                          {parseFloat(pkg.price.toString()).toFixed(3)} {t('common.currency')}
                        </span>
                        
                        <div className="flex items-center gap-1">
                          <button
                            id={`package-edit-btn-${pkg.id}`}
                            onClick={() => handleEditPackage(pkg)}
                            disabled={actionLoading}
                            className="p-1 rounded bg-olive-soft hover:bg-olive-light text-brand-olive hover:text-brand-olive-hover transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                            title="Edit Package"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`package-del-btn-${pkg.id}`}
                            onClick={() => handleDeletePackage(pkg.id)}
                            disabled={actionLoading}
                            className="p-1 rounded bg-red-50 hover:bg-red-100 text-red-500 hover:text-red-700 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                            title="Delete Package"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
    </>
  );
}
