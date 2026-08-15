import React, { useState } from 'react';
import { 
  Users, Settings, Tag, Dumbbell, Trash2, Building2, 
  BarChart3, Coffee, Check, X, Sparkles, KeyRound, History
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { AdminProvider, useAdminContext } from './admin/AdminContext';
import CafeMenuAdmin from './CafeMenuAdmin';
import EODSummaryModal from './EODSummaryModal';
import { getActiveBranch, isQatarBranch } from '../utils/branchHelpers';

import StaffAdmin from './admin/StaffAdmin';
import PackagesAdmin from './admin/PackagesAdmin';
import GymAdmin from './admin/GymAdmin';
import ReportsAdmin from './admin/ReportsAdmin';
import MembersAdmin from './admin/MembersAdmin';
import RecycleBinAdmin from './admin/RecycleBinAdmin';
import CompanyAdmin from './admin/CompanyAdmin';
import GateLogsAdmin from './admin/GateLogsAdmin';
import AuditLogsAdmin from './admin/AuditLogsAdmin';

interface AdminConfigProps {
  onBackToDashboard: () => void;
  availableBranches: string[];
  onBranchesUpdate: (branches: string[]) => void;
  companyName: string;
  onCompanyNameUpdate: (newName: string) => void;
}

function AdminContent({ onBackToDashboard }: { onBackToDashboard: () => void }) {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'staff' | 'packages' | 'gym' | 'company' | 'reports' | 'members' | 'recycleBin' | 'cafe' | 'gateLogs' | 'auditLogs'>('staff');
  
  const { 
    actionLoading, toast, dbSynced, staffList,
    adminConfirmModal, setAdminConfirmModal, handleExecuteAdminAction,
    viewEODStaffName, setViewEODStaffName, viewEODStaffId, setViewEODStaffId, cafeCategories, cafeMenuItems, triggerToast
  } = useAdminContext();

  const isDarkTheme = false;
  const activeBranch = getActiveBranch() || 'All';
  const qatarBranch = isQatarBranch(activeBranch);

  const targetStaff = staffList.find(s => s.id === viewEODStaffId);
  const targetStaffBranch = targetStaff?.branchPermissions.length === 1 && targetStaff.branchPermissions[0] !== 'All' 
    ? targetStaff.branchPermissions[0] 
    : 'All';

  const adminSession = React.useMemo(() => ({
    isLoggedIn: true, 
    user: { name: 'admin', role: 'admin' as const, id: '1', pin: '9999', branchPermissions: ['All'], createdAt: '' }, 
    activeBranch: targetStaffBranch as any
  }), [targetStaffBranch]);

  return (
    <div className={`flex-1 flex flex-col ${isDarkTheme ? 'bg-olive-dark text-white' : 'bg-gray-50'}`}>
      {toast && (
        <div 
          id="admin-toast"
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg border text-xs font-medium flex items-center gap-2 transition-all duration-300 animate-slide-in-right ${
            toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
            toast.type === 'ref' ? 'bg-blue-50 text-blue-700 border-blue-200' :
            'bg-olive-light text-olive-dark border-brand-olive'
          }`}
        >
          <Sparkles className="w-4 h-4 text-brand-olive animate-pulse" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Admin Suite Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-olive-light pb-6 mb-8 px-4 lg:px-6 pt-6">
        <div>
          <span className="text-[10px] uppercase tracking-widest text-brand-olive font-bold">
            {t('admin.terminal_admin')}
          </span>
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-olive-dark flex items-center gap-2 mt-0.5">
            <Settings className="w-7 h-7 text-brand-olive" />
            {t('admin.control_center')}
          </h2>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={onBackToDashboard}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-olive-dark text-xs font-semibold uppercase tracking-wider transition-colors w-full md:w-auto font-sans bg-white shadow-sm"
          >
            {t('admin.back')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden px-4 lg:px-6 pb-6">
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2 mb-6 lg:mb-0 lg:mr-6 overflow-y-auto pr-2 custom-scrollbar">
          
          <button onClick={() => setActiveTab('staff')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'staff' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
            <Users className="w-4 h-4" /> <span className="font-sans">{t('admin.staff')}</span>
          </button>
          
          <button onClick={() => setActiveTab('packages')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'packages' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
            <Tag className="w-4 h-4" /> <span className="font-sans">{t('admin.packages')}</span>
          </button>

          {!qatarBranch && (
            <>
              <button onClick={() => setActiveTab('gym')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'gym' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
                <Dumbbell className="w-4 h-4" /> <span className="font-sans">{t('admin.gym')}</span>
              </button>
              
              <button onClick={() => setActiveTab('gateLogs')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'gateLogs' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
                <KeyRound className="w-4 h-4" /> <span className="font-sans">{language === 'ar' ? 'سجل البوابة' : 'Gate Logs'}</span>
              </button>
              
              <button onClick={() => setActiveTab('auditLogs')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'auditLogs' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
                <History className="w-4 h-4" /> <span className="font-sans">{language === 'ar' ? 'سجل المعاملات' : 'Audit Logs'}</span>
              </button>
              
              <button onClick={() => setActiveTab('cafe')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'cafe' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
                <Coffee className="w-4 h-4" /> <span className="font-sans">{t('admin.cafe')}</span>
              </button>
            </>
          )}

          <button onClick={() => setActiveTab('company')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'company' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
            <Building2 className="w-4 h-4" /> <span className="font-sans">{t('admin.company')}</span>
          </button>

          <div className="h-px bg-gray-200 my-2 rounded-full w-full"></div>

          <button onClick={() => setActiveTab('reports')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'reports' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
            <BarChart3 className="w-4 h-4" /> <span className="font-sans">{t('admin.reports')}</span>
          </button>
          
          <button onClick={() => setActiveTab('members')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'members' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
            <Users className="w-4 h-4" /> <span className="font-sans">Members List</span>
          </button>

          <button onClick={() => setActiveTab('recycleBin')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'recycleBin' ? 'bg-rose-600 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-rose-50 hover:text-rose-600 border border-transparent hover:border-rose-200'}`}>
            <Trash2 className="w-4 h-4" /> <span className="font-sans">Recycle Bin</span>
          </button>

          {/* Infrastructure Card */}
          <div className="mt-auto pt-6 pb-2 px-2">
            <div className={`p-4 rounded-xl border ${dbSynced ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`w-2 h-2 rounded-full animate-pulse ${dbSynced ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                <span className={`text-[10px] font-bold uppercase tracking-wider font-sans ${dbSynced ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {dbSynced ? 'Firestore Synced' : 'Sync Pending'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Loading Overlay */}
        {actionLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center rounded-2xl">
            <div className="w-12 h-12 border-4 border-brand-olive border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Tabs Content */}
        <div className="flex-1 overflow-y-auto relative">
          
          {activeTab === 'staff' && <StaffAdmin />}
          {activeTab === 'packages' && <PackagesAdmin />}
          {activeTab === 'gym' && <GymAdmin />}
          {activeTab === 'cafe' && (
            <CafeMenuAdmin 
              categories={cafeCategories}
              items={cafeMenuItems}
              triggerToast={triggerToast}
            />
          )}
          {activeTab === 'company' && <CompanyAdmin />}
          {activeTab === 'reports' && <ReportsAdmin />}
          {activeTab === 'members' && <MembersAdmin />}
          {activeTab === 'gateLogs' && <GateLogsAdmin />}
          {activeTab === 'auditLogs' && <AuditLogsAdmin />}
          {activeTab === 'recycleBin' && <RecycleBinAdmin />}

        </div>
      </div>

      {/* Admin Confirm Modal */}
      {adminConfirmModal.isOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAdminConfirmModal({
            isOpen: false,
            actionType: 'soft-delete-invoice',
            targetId: '',
            targetName: '',
            confirmationPromptText: undefined,
            confirmationInputPlaceholder: undefined,
            confirmationInputValue: undefined,
            confirmationOptions: undefined,
            onConfirm: undefined
          })}></div>
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-[90%] max-w-md m-4">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-serif font-bold text-gray-900 mb-2">Confirm Action</h3>
              <p className="text-sm text-gray-500">Are you sure you want to perform this action? This might be irreversible.</p>
            </div>
            {adminConfirmModal.confirmationPromptText && (
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-2">
                  {adminConfirmModal.confirmationPromptText}
                </label>
                {adminConfirmModal.confirmationOptions && adminConfirmModal.confirmationOptions.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {adminConfirmModal.confirmationOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAdminConfirmModal({
                          ...adminConfirmModal,
                          confirmationInputValue: option.value
                        })}
                        className={`px-4 py-3 rounded-xl border text-xs font-semibold transition-colors ${adminConfirmModal.confirmationInputValue === option.value ? 'bg-olive-dark text-white border-olive-dark' : 'bg-white text-gray-700 border-gray-200 hover:bg-olive-light hover:text-olive-dark'}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : adminConfirmModal.confirmationInputPlaceholder ? (
                  <input
                    type="text"
                    value={adminConfirmModal.confirmationInputValue || ''}
                    placeholder={adminConfirmModal.confirmationInputPlaceholder}
                    onChange={(e) => setAdminConfirmModal({
                      ...adminConfirmModal,
                      confirmationInputValue: e.target.value
                    })}
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-brand-olive bg-gray-50 text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                ) : null}
                {adminConfirmModal.confirmationOptions && adminConfirmModal.confirmationInputValue && (
                  <div className="mt-3 text-[11px] font-semibold text-olive-dark">
                    {language === 'ar' ? 'المحدد:' : 'Selected:'} {adminConfirmModal.confirmationInputValue}
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-3 mt-8">
              <button onClick={() => setAdminConfirmModal({
                isOpen: false,
                actionType: 'soft-delete-invoice',
                targetId: '',
                targetName: '',
                confirmationPromptText: undefined,
                confirmationInputPlaceholder: undefined,
                confirmationInputValue: undefined,
                confirmationOptions: undefined,
                onConfirm: undefined
              })} className="flex-1 px-4 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold uppercase tracking-wider text-xs transition-colors">Cancel</button>
              <button
                onClick={handleExecuteAdminAction}
                disabled={actionLoading || (adminConfirmModal.confirmationPromptText && !adminConfirmModal.confirmationInputValue?.trim())}
                className="flex-1 px-4 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase tracking-wider text-xs shadow-md transition-colors disabled:cursor-not-allowed disabled:opacity-60"
              >
                {actionLoading ? (language === 'ar' ? 'جاري التنفيذ...' : 'Processing...') : (language === 'ar' ? 'تأكيد' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EOD Summary Modal */}
      {viewEODStaffName && (
        <div className="fixed inset-0 z-100 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => {
            setViewEODStaffName(null);
            setViewEODStaffId(null);
          }}></div>
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto m-4 bg-white rounded-2xl shadow-2xl">
            <EODSummaryModal 
              session={adminSession}
              targetStaffName={viewEODStaffName}
              targetStaffId={viewEODStaffId || undefined}
              onClose={() => {
                setViewEODStaffName(null);
                setViewEODStaffId(null);
              }}
              onConfirmLogout={() => {}}
              isShiftSummaryOnly={true}
            />
          </div>
        </div>
      )}

    </div>
  );
}

export default function AdminConfig(props: AdminConfigProps) {
  return (
    <AdminProvider 
      availableBranches={props.availableBranches}
      onBranchesUpdate={props.onBranchesUpdate}
      companyName={props.companyName}
      onCompanyNameUpdate={props.onCompanyNameUpdate}
    >
      <AdminContent onBackToDashboard={props.onBackToDashboard} />
    </AdminProvider>
  );
}
