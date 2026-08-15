import React, { useState } from 'react';
import { useAdminContext } from './AdminContext';
import { useLanguage } from '../../LanguageContext';
import { ShieldAlert, Trash2, Edit3, BarChart3, Plus, X, Users, Check, Eye, EyeOff } from 'lucide-react';
import { setDoc, doc, updateDoc, deleteDoc, addDoc, collection } from 'firebase/firestore';
import { Staff } from '../../types';
import { db, isFirebaseConfigured } from '../../firebase';

export default function StaffAdmin() {
  const { language, t } = useLanguage();
  const { staffList, availableBranches, triggerToast, loadAllData, setViewEODStaffName, setViewEODStaffId, actionLoading, setActionLoading, setStaffList, setAdminConfirmModal } = useAdminContext();

  const [staffForm, setStaffForm] = useState({
    id: '',
    name: '',
    pin: '',
    role: 'staff' as 'admin' | 'staff',
    branchPermissions: ['All'] as string[]
  });
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const toggleBranchPermission = (bName: string) => {
    if (bName === 'All') {
      setStaffForm(prev => ({
        ...prev,
        branchPermissions: ['All']
      }));
    } else {
      setStaffForm(prev => {
        let current = prev.branchPermissions.filter(p => p !== 'All');
        if (current.includes(bName)) {
          current = current.filter(x => x !== bName);
          if (current.length === 0) current = ['All'];
        } else {
          current.push(bName);
        }
        return {
          ...prev,
          branchPermissions: current
        };
      });
    }
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffForm.name || !staffForm.pin) {
      triggerToast('Please provide name and secure PIN code.', 'error');
      return;
    }

    // PIN strictly numeric constraint
    if (!/^\d+$/.test(staffForm.pin)) {
      triggerToast('PIN code must be strictly numeric.', 'error');
      return;
    }

    // Verify PIN is unique
    const pinExists = staffList.some(s => s.pin === staffForm.pin && s.id !== staffForm.id);
    if (pinExists || staffForm.pin === '9999') {
      triggerToast('Staff PIN must be strictly unique.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      if (isFirebaseConfigured && db) {
        if (isEditingStaff) {
          // Update
          await updateDoc(doc(db, 'staff', staffForm.id), {
            name: staffForm.name,
            pin: staffForm.pin,
            role: staffForm.role,
            branchPermissions: staffForm.branchPermissions,
          });
          triggerToast('Staff profile updated successfully!');
        } else {
          // Add
          const docRef = await addDoc(collection(db, 'staff'), {
            name: staffForm.name,
            pin: staffForm.pin,
            role: staffForm.role,
            branchPermissions: staffForm.branchPermissions,
            createdAt: new Date().toISOString()
          });
          triggerToast('Staff member added successfully!');
        }
      } else {
        // Local operations
        let updatedList = [...staffList];
        if (isEditingStaff) {
          updatedList = updatedList.map(s => s.id === staffForm.id ? { 
            ...s, 
            name: staffForm.name, 
            pin: staffForm.pin, 
            role: staffForm.role, 
            branchPermissions: staffForm.branchPermissions 
          } : s);
        } else {
          updatedList.push({
            id: 'staff-' + Date.now(),
            name: staffForm.name,
            pin: staffForm.pin,
            role: staffForm.role,
            branchPermissions: staffForm.branchPermissions,
            createdAt: new Date().toISOString()
          });
        }
        localStorage.setItem('local_staff', JSON.stringify(updatedList));
        setStaffList(updatedList);
        triggerToast(isEditingStaff ? 'Staff profile updated!' : 'Staff profile created!');
      }

      // Reset
      setStaffForm({ id: '', name: '', pin: '', role: 'staff', branchPermissions: ['All'] });
      setIsEditingStaff(false);
      loadAllData();
    } catch (err: any) {
      console.error('Staff save error:', err);
      triggerToast(`Error saving staff member: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEditStaff = (staff: Staff) => {
    setStaffForm({
      id: staff.id,
      name: staff.name,
      pin: staff.pin,
      role: staff.role,
      branchPermissions: staff.branchPermissions || ['All']
    });
    setIsEditingStaff(true);
  };

  const handleDeleteStaff = async (id: string) => {
    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: id,
      targetName: 'Staff profile',
      onConfirm: async () => {
        setActionLoading(true);
        try {
          if (isFirebaseConfigured && db) {
            await deleteDoc(doc(db, 'staff', id));
          } else {
            const remaining = staffList.filter(s => s.id !== id);
            localStorage.setItem('local_staff', JSON.stringify(remaining));
          }
          triggerToast('Staff profile removed.');
          loadAllData();
        } catch (err) {
          triggerToast('Failed to remove staff profile.', 'error');
        } finally {
          setActionLoading(false);
        }
      }
    });
  };

  return (
    <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Form panel */}
              <div className="md:col-span-1 bg-white border border-olive-light rounded-xl p-6 shadow-sm">
                <h3 className="font-serif text-lg font-bold text-olive-dark border-b border-gray-100 pb-2 mb-4">
                  {isEditingStaff ? 'Modify Staff Profile' : 'Register New Staff'}
                </h3>
                
                <form onSubmit={handleSaveStaff} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none">
                      Staff Name
                    </label>
                    <input
                      id="staff-form-name"
                      type="text"
                      placeholder="e.g. Fatima Ali"
                      value={staffForm.name}
                      onChange={e => setStaffForm({ ...staffForm, name: e.target.value })}
                      disabled={actionLoading}
                      className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none">
                      Secure Access PIN (Numeric)
                    </label>
                    <div className="relative">
                      <input
                        id="staff-form-pin"
                        type={showPin ? "text" : "password"}
                        maxLength={8}
                        placeholder="e.g. 1234"
                        value={staffForm.pin}
                        onChange={e => setStaffForm({ ...staffForm, pin: e.target.value.replace(/\D/g, '') })}
                        disabled={actionLoading}
                        className="w-full text-xs font-mono border border-gray-200 outline-none rounded p-2 pr-10 focus:border-brand-olive bg-olive-soft/20 text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-olive-dark transition-colors"
                        title={showPin ? "Hide PIN" : "Show PIN"}
                      >
                        {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1 leading-none font-sans">
                      System Privilege Role
                    </label>
                    <select
                      id="staff-form-role"
                      value={staffForm.role}
                      onChange={e => setStaffForm({ ...staffForm, role: e.target.value as 'admin' | 'staff' })}
                      disabled={actionLoading}
                      className="w-full text-xs border border-gray-200 outline-none rounded p-2 focus:border-brand-olive bg-white text-olive-dark disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <option value="staff">Regular Staff (Terminal only)</option>
                      <option value="admin">Admin Privilege (System Configurations)</option>
                    </select>
                  </div>

                  {/* Branch permissions subset checklist as required */}
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-gray-400 mb-2 leading-none font-sans">
                      Terminal Branch Permissions
                    </label>
                    <div className="flex flex-col gap-1.5 max-h-[140px] overflow-y-auto border border-gray-100 rounded p-2.5 bg-olive-soft/20">
                      <button
                        type="button"
                        onClick={() => toggleBranchPermission('All')}
                        disabled={actionLoading}
                        className={`text-left text-xs px-2 py-1 rounded flex items-center justify-between ${
                          staffForm.branchPermissions.includes('All') 
                            ? 'bg-brand-olive text-white font-semibold' 
                            : 'hover:bg-olive-light/50 text-gray-600'
                        } ${actionLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span>{t('admin.perm_all')}</span>
                        {staffForm.branchPermissions.includes('All') && <Check className="w-3.5 h-3.5" />}
                      </button>

                      {availableBranches.map(bName => (
                        <button
                          key={bName}
                          type="button"
                          onClick={() => toggleBranchPermission(bName)}
                          disabled={actionLoading}
                          className={`text-left text-xs px-2 py-1 rounded flex items-center justify-between ${
                            staffForm.branchPermissions.includes(bName) && !staffForm.branchPermissions.includes('All')
                              ? 'bg-olive-light text-olive-dark border border-brand-olive/30 font-semibold' 
                              : 'hover:bg-olive-light/50 text-gray-650'
                          } ${actionLoading ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <span>{bName}</span>
                          {staffForm.branchPermissions.includes(bName) && !staffForm.branchPermissions.includes('All') && (
                            <Check className="w-3.5 h-3.5 text-brand-olive" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button
                      id="staff-form-submit"
                      type="submit"
                      disabled={actionLoading}
                      className="flex-grow h-9 rounded bg-brand-olive hover:bg-brand-olive-hover text-white text-xs font-semibold uppercase tracking-wider transition-all duration-300 shadow cursor-pointer text-center disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading ? 'Processing...' : (isEditingStaff ? 'Save Changes' : 'Register Profile')}
                    </button>
                    {isEditingStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setStaffForm({ id: '', name: '', pin: '', role: 'staff', branchPermissions: ['All'] });
                          setIsEditingStaff(false);
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
                  Registered Authorized Directory
                </h3>

                {staffList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                    <ShieldAlert className="w-8 h-8 text-gray-300 mb-2" />
                    <p className="text-xs font-semibold">{t('admin.no_staff_configured')}</p>
                    <p className="text-[10px] text-center max-w-xs mt-1">
                      Register staff to let them log in using their secure numeric access PIN. Note: PIN 9999 is reserved for the Master Admin.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {staffList.map(staff => (
                      <div 
                        key={staff.id}
                        className="p-4 border border-olive-light/40 rounded-lg hover:border-brand-olive/30 bg-olive-soft/10 flex flex-col justify-between min-h-[140px] group transition-all"
                      >
                        <div>
                          <div className="flex items-start justify-between">
                            <span className={`text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${
                              staff.role === 'admin' ? 'bg-olive-light text-brand-olive' : 'bg-gray-150 text-gray-500'
                            }`}>
                              {staff.role}
                            </span>
                            <span className="text-[10px] font-mono text-gray-400">
                              PIN: ••••
                            </span>
                          </div>
                          <h4 className="font-serif font-bold text-base text-olive-dark mt-2.5 truncate">
                            {staff.name}
                          </h4>
                          <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider font-semibold">
                            Branches: {staff.branchPermissions.join(', ')}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 mb-2 px-1">
                          <button
                            id={`staff-eod-btn-${staff.id}`}
                            onClick={() => {
                              setViewEODStaffName(staff.name);
                              setViewEODStaffId(staff.id);
                            }}
                            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer bg-blue-50 hover:bg-blue-100 py-1.5 px-2.5 rounded-md"
                          >
                            <BarChart3 className="w-3.5 h-3.5" />
                            <span>{language === 'ar' ? 'تقرير' : 'Report'}</span>
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-olive-light/20">
                          <button
                            id={`staff-edit-btn-${staff.id}`}
                            onClick={() => handleEditStaff(staff)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-brand-olive hover:text-brand-olive-hover cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{t('admin.edit_title')}</span>
                          </button>
                          <button
                            id={`staff-del-btn-${staff.id}`}
                            onClick={() => handleDeleteStaff(staff.id)}
                            disabled={actionLoading}
                            className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-red-500 hover:text-red-700 ml-auto cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{t('admin.delete_title')}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
    </>
  );
}
