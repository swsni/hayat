import React, { useState } from 'react';
import { 
  Settings, Sparkles, Tag
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { AdminProvider, useAdminContext } from './admin/AdminContext';
import { getActiveBranch, isQatarBranch } from '../utils/branchHelpers';

import EcommerceAdmin from './admin/EcommerceAdmin';

interface StoreAdminConfigProps {
  onBackToDashboard: () => void;
  availableBranches: string[];
  onBranchesUpdate: (branches: string[]) => void;
  companyName: string;
  onCompanyNameUpdate: (newName: string) => void;
  onNavigateToCustomer?: (customer: any) => void;
}

function StoreAdminContent({ onBackToDashboard }: { onBackToDashboard: () => void }) {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'ecommerce'>('ecommerce');
  
  const { 
    actionLoading, toast, dbSynced
  } = useAdminContext();

  const isDarkTheme = false;

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
            {language === 'ar' ? 'إدارة المتجر الإلكتروني' : 'Store Administration'}
          </span>
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-olive-dark flex items-center gap-2 mt-0.5">
            <Tag className="w-7 h-7 text-brand-olive" />
            {language === 'ar' ? 'إعدادات المتجر' : 'Store Settings'}
          </h2>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button 
            onClick={onBackToDashboard}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-olive-dark text-xs font-semibold uppercase tracking-wider transition-colors w-full md:w-auto font-sans bg-white shadow-sm"
          >
            {t('common.back')}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden px-4 lg:px-6 pb-6">
        {/* Navigation Sidebar */}
        <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2 mb-6 lg:mb-0 lg:mr-6 overflow-y-auto pr-2 custom-scrollbar">
          
          <button onClick={() => setActiveTab('ecommerce')} className={`flex items-center gap-2.5 p-3.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === 'ecommerce' ? 'bg-olive-dark text-white shadow-md' : 'bg-white text-gray-600 hover:bg-olive-light hover:text-olive-dark border border-transparent hover:border-brand-olive'}`}>
            <Tag className="w-4 h-4" /> <span className="font-sans">{language === 'ar' ? 'المتجر الإلكتروني' : 'E-Commerce'}</span>
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
          {activeTab === 'ecommerce' && <EcommerceAdmin />}
        </div>
      </div>
    </div>
  );
}

export default function StoreAdminConfig(props: StoreAdminConfigProps) {
  return (
    <AdminProvider 
      availableBranches={props.availableBranches}
      onBranchesUpdate={props.onBranchesUpdate}
      companyName={props.companyName}
      onCompanyNameUpdate={props.onCompanyNameUpdate}
    >
      <StoreAdminContent onBackToDashboard={props.onBackToDashboard} />
    </AdminProvider>
  );
}
