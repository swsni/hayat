import React, { useState, useEffect, useRef } from 'react';
import { Layers, ShieldCheck, Clock, UserCheck, AlertCircle, Sparkles, Sliders } from 'lucide-react';
import { Branch, SessionState, Staff, Customer } from './types';
import LoginPIN from './components/LoginPIN';
import BranchSelect from './components/BranchSelect';
import Header from './components/Header';
import AdminConfig from './components/AdminConfig';
import CustomerList from './components/CustomerList';
import CustomerProfile from './components/CustomerProfile';
import POSModal from './components/POSModal';
import EODSummaryModal from './components/EODSummaryModal';
import ShiftManager from './components/ShiftManager';
import { isFirebaseConfigured, db, ensureFirebaseAuth } from './firebase';
import { collection, getDocs, doc, query, where } from 'firebase/firestore';
import { showToast } from './utils/toast';
import { offlineSyncService } from './utils/offlineSync';
import { useLanguage } from './LanguageContext';
import { useScanner } from './hooks/useScanner';
import { useShiftManager } from './hooks/useShiftManager';
import { isCafeBranchEnabled } from './utils/cafeBranch';

export default function App() {
  const { language, dir, t } = useLanguage();
  const [session, setSession] = useState<SessionState>(() => {
    const saved = sessionStorage.getItem('hala_session');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      isLoggedIn: false,
      user: null,
      activeBranch: null,
    };
  });

  const [currentStep, setCurrentStep] = useState<'LOGIN' | 'BRANCH_SELECT' | 'DASHBOARD' | 'ADMIN_SUITE' | 'CUSTOMER_PROFILE'>(
    () => session.isLoggedIn ? (session.activeBranch ? 'DASHBOARD' : 'BRANCH_SELECT') : 'LOGIN'
  );

  // Persist session changes
  useEffect(() => {
    if (session.isLoggedIn) {
      sessionStorage.setItem('hala_session', JSON.stringify(session));
    } else {
      sessionStorage.removeItem('hala_session');
    }
  }, [session]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // POS State
  const [activePOSMode, setActivePOSMode] = useState<'salon' | 'gym' | 'cafe' | null>(null);
  const [preselectedCafeItem, setPreselectedCafeItem] = useState<any>(null);
  const [isEODModalOpen, setIsEODModalOpen] = useState(false);
  const [isShiftSummaryOnly, setIsShiftSummaryOnly] = useState(false);
  // true when the EOD modal was opened as part of the logout wizard (not an X-report).
  // When true, the EOD modal's Close button is suppressed — staff must use Confirm Logout.
  const [isLogoutFlow, setIsLogoutFlow] = useState(false);
  const [isOpeningGate, setIsOpeningGate] = useState(false);

  const handleOpenGate = async () => {
    setIsOpeningGate(true);
    try {
      const res = await fetch('/api/gate/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'dashboard' })
      });
      const data = await res.json();
      if (data.success) {
        showToast(language === 'ar' ? 'تم أمر البوابة بالفتح بنجاح' : 'Gate open command sent', 'success');
      } else {
        showToast(data.message || (language === 'ar' ? 'حدث خطأ' : 'Error opening gate'), 'error');
      }
    } catch (err) {
      showToast(language === 'ar' ? 'فشل الاتصال بالخادم' : 'Failed to connect to server', 'error');
    } finally {
      setIsOpeningGate(false);
    }
  };

  // Shift State (managed by hook)
  const { 
    currentShift, 
    showShiftManager, 
    setShowShiftManager, 
    shiftMode, 
    setShiftMode, 
    handleOpenShift, 
    handleCloseShift,
    forceCloseShift
  } = useShiftManager(session, language);

  const [dateTimeStr, setDateTimeStr] = useState('');
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'fallback'>('fallback');
  
  // Centralized Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'ref' | 'error' } | null>(null);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: 'success' | 'ref' | 'error' }>;
      if (customEvent.detail) {
        setToast({
          message: customEvent.detail.message,
          type: customEvent.detail.type || 'success'
        });
      }
    };
    window.addEventListener('app_toast', handleToastEvent);
    return () => {
      window.removeEventListener('app_toast', handleToastEvent);
    };
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  
  // Dynamic business name and branches management tracked in global state
  const [companyName, setCompanyName] = useState('Hayat Beauty & Care');
  const [availableBranches, setAvailableBranches] = useState<string[]>(['Riffa', 'Janabiya', 'Busaiteen', 'Askar', 'Qatar']);

  // Global Scanner Logic (managed by hook)
  const { scannerLogs, showScannerLogs, setShowScannerLogs, setScannerLogs } = useScanner(session, setSelectedCustomer, setCurrentStep);

  // Fetch initial company configurations from cloud or local cache
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        if (isFirebaseConfigured && db) {
          try {
            await ensureFirebaseAuth();
          } catch (authErr) {
            console.warn('[App] Firebase auth unavailable:', authErr);
          }
          setFirebaseStatus('connected');
          const settingsSnap = await getDocs(collection(db, 'settings'));
          if (!settingsSnap.empty) {
            const data = settingsSnap.docs[0].data();
            if (data.companyName) setCompanyName(data.companyName);
            if (data.branches) setAvailableBranches(data.branches);
          }
        } else {
          setFirebaseStatus('fallback');
          // Check local storage setting cache
          const localCompany = localStorage.getItem('local_company_name');
          if (localCompany) setCompanyName(localCompany);
          
          const localBranches = localStorage.getItem('local_branches');
          if (localBranches) {
            setAvailableBranches(JSON.parse(localBranches));
          }
        }
      } catch (err) {
        setFirebaseStatus('fallback');
        console.warn("Could not synchronize enterprise configuration settings:", err);
      }
    };
    fetchConfigs();
  }, []);

  // Shift State is now monitored by useShiftManager hook

  // Monitor Network Connectivity & Synchronize offline records
  useEffect(() => {
    const handleSync = async () => {
      if (navigator.onLine) {
        await offlineSyncService.syncPendingActions();
        await offlineSyncService.cacheCloudDataLocally();
      }
    };

    handleSync();

    window.addEventListener('online', handleSync);

    return () => {
      window.removeEventListener('online', handleSync);
    };
  }, []);

  // Update clock in actual Arab Standard Time format or client local time
  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      setDateTimeStr(
        now.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }) + ' | ' + 
        now.toLocaleTimeString(language === 'ar' ? 'ar-EG' : 'en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: language === 'ar' ? false : true // Use 12-hour format for English, 24-hour for Arabic
        })
      );
    };
    
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, [language]); // Re-run when language changes

  const handleCompanyNameUpdate = (newName: string) => {
    setCompanyName(newName);
    localStorage.setItem('local_company_name', newName);
  };

  const handleBranchesUpdate = (newBranches: string[]) => {
    setAvailableBranches(newBranches);
    localStorage.setItem('local_branches', JSON.stringify(newBranches));
  };

  // Handle access credentials validation
  const handleLoginSuccess = (staffName: string, role: string, staffObj?: Staff) => {
    const savedBranch = localStorage.getItem('hala_branch_pref') as Branch | null;
    
    const loggedInUser: Staff = staffObj || {
      id: 'master-admin-01',
      name: staffName,
      pin: '9999',
      role: role as 'admin' | 'staff',
      branchPermissions: ['All'],
      createdAt: new Date().toISOString(),
    };

    // Filter branches list if staff has restricted access
    const hasBranchPermission = (b: string) => {
      if (loggedInUser.branchPermissions.includes('All')) return true;
      return loggedInUser.branchPermissions.includes(b);
    };

    // Auto-select if the user is bound to EXACTLY one branch
    const allowedBranches = availableBranches.filter(b => hasBranchPermission(b));
    let finalBranch = savedBranch;

    if (allowedBranches.length === 1) {
      finalBranch = allowedBranches[0];
    } else if (finalBranch && !hasBranchPermission(finalBranch)) {
      finalBranch = null; // Reset if the saved preference is no longer authorized
    }

    if (finalBranch) {
      setSession({
        isLoggedIn: true,
        user: loggedInUser,
        activeBranch: finalBranch,
        loginTime: new Date().toISOString(),
      });
      setCurrentStep('DASHBOARD');
    } else {
      setSession({
        isLoggedIn: true,
        user: loggedInUser,
        activeBranch: null,
        loginTime: new Date().toISOString(),
      });
      setCurrentStep('BRANCH_SELECT');
    }
  };

  const handleBranchSelect = (branch: Branch) => {
    // Save preference to localStorage as requested
    localStorage.setItem('hala_branch_pref', branch);
    
    setSession(prev => ({
      ...prev,
      activeBranch: branch,
    }));
    
    setCurrentStep('DASHBOARD');
  };

  const handleLogoutClick = () => {
    if (currentShift) {
      // ── Step 1: Shift is open — force staff through the close flow first.
      // The ShiftManager onConfirm callback (mode=close) will automatically
      // advance to Step 2 (EOD modal) once the shift is closed.
      setShiftMode('close');
      setShowShiftManager(true);
    } else {
      // ── No open shift — skip straight to Step 2 (EOD modal with Logout button).
      setIsShiftSummaryOnly(false);
      setIsLogoutFlow(true);   // mark as logout path so Close button is hidden
      setIsEODModalOpen(true);
    }
  };

  const handleOpenShiftReport = () => {
    // X-Report: mid-shift summary view — NOT a logout flow.
    setIsShiftSummaryOnly(true);
    setIsLogoutFlow(false);
    setIsEODModalOpen(true);
  };

  // Shift functions are now in useShiftManager hook

  const confirmLogout = () => {
    // End active session and reset all shift-related UI state
    setIsEODModalOpen(false);
    setIsShiftSummaryOnly(false);
    setIsLogoutFlow(false);
    setShowShiftManager(false);
    setShiftMode('open');
    setSession({
      isLoggedIn: false,
      user: null,
      activeBranch: null,
    });
    setCurrentStep('LOGIN');
  };

  const handleSwitchProfile = async () => {
    // Close the open shift before switching profiles to prevent orphaned shifts
    if (currentShift?.id) {
      await forceCloseShift();
    }
    // End active session but keep branch context for faster relogin
    setShowShiftManager(false);
    setShiftMode('open');
    setSession(prev => ({
      ...prev,
      isLoggedIn: false,
      user: null,
    }));
    setCurrentStep('LOGIN');
  };

  const triggerChangeBranch = () => {
    setCurrentStep('BRANCH_SELECT');
  };

  // Admin access is granted when the Firestore staff record has role === 'admin'.
  // No client-side PIN comparison is used — role is set by the staff document.
  const isAdminSession = session.user?.role === 'admin';

  return (
    <div id="application-entry" className={`min-h-screen bg-olive-soft flex flex-col font-sans selection:bg-brand-olive select-none ${dir}`} dir={dir}>
      <div className="fixed top-3 right-3 z-[350]">
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-semibold shadow-sm border ${firebaseStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${firebaseStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          {firebaseStatus === 'connected' ? 'Firebase connected • live data' : 'Offline / local fallback'}
        </div>
      </div>

      {/* Sticky Header */}
      {session.isLoggedIn && session.activeBranch && (currentStep === 'DASHBOARD' || currentStep === 'ADMIN_SUITE' || currentStep === 'CUSTOMER_PROFILE') && (
        <Header
          staffName={session.user?.name || 'Authorized Staff'}
          activeBranch={session.activeBranch}
          isAdmin={isAdminSession}
          onLogout={handleLogoutClick}
          onOpenShiftReport={handleOpenShiftReport}
          onChangeBranch={triggerChangeBranch}
          onOpenAdmin={() => setCurrentStep('ADMIN_SUITE')}
          onSwitchProfile={handleSwitchProfile}
          onOpenGate={isCafeBranchEnabled(session.activeBranch || '') ? handleOpenGate : undefined}
          isOpeningGate={isOpeningGate}
          companyName={companyName}
        />
      )}

      {/* Main Content Areas */}
      <main className="flex-grow">
        {currentStep === 'LOGIN' && (
          <LoginPIN onLoginSuccess={handleLoginSuccess} companyName={companyName} />
        )}

        {currentStep === 'BRANCH_SELECT' && (
          <BranchSelect 
            staffName={session.user?.name || 'Staff'} 
            onBranchSelect={handleBranchSelect} 
            branches={availableBranches}
          />
        )}

        {currentStep === 'ADMIN_SUITE' && session.isLoggedIn && isAdminSession && (
          <AdminConfig
            onBackToDashboard={() => setCurrentStep('DASHBOARD')}
            availableBranches={availableBranches}
            onBranchesUpdate={handleBranchesUpdate}
            companyName={companyName}
            onCompanyNameUpdate={handleCompanyNameUpdate}
          />
        )}

        {currentStep === 'CUSTOMER_PROFILE' && session.isLoggedIn && selectedCustomer && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <CustomerProfile
              customer={selectedCustomer}
              staffName={session.user?.name || 'Staff'}
              staffId={session.user?.id}
              branch={session.activeBranch || 'Unknown'}
              isAdmin={session.user?.role === 'admin'}
              onCustomerUpdated={(updatedCustomer) => setSelectedCustomer(updatedCustomer)}
              onBack={() => {
                setSelectedCustomer(null);
                setCurrentStep('DASHBOARD');
              }}
              onPurchase={(type, item) => {
                if (type === 'cafe' && !isCafeBranchEnabled(session.activeBranch || '')) {
                  showToast(language === 'ar' ? 'مبيعات القهوة متاحة فقط لفرع الجنبية' : 'Coffee sales are available only for Janabiya branch', 'error');
                  return;
                }
                setActivePOSMode(type);
                if (item) setPreselectedCafeItem(item);
              }}
            />
            {activePOSMode && (
              <POSModal
                type={activePOSMode}
                preselectedItem={preselectedCafeItem}
                customer={selectedCustomer}
                staffName={session.user?.name || 'Staff'}
                staffId={session.user?.id}
                branch={session.activeBranch || 'Unknown'}
                onClose={() => {
                  setActivePOSMode(null);
                  setPreselectedCafeItem(null);
                }}
                onSuccess={() => {
                  setActivePOSMode(null);
                  setPreselectedCafeItem(null);
                  window.dispatchEvent(new CustomEvent('hala_refresh_profile'));
                }}
              />
            )}
          </div>
        )}

        {currentStep === 'DASHBOARD' && session.isLoggedIn && session.activeBranch && (
          <div id="main-dashboard-wrap" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in">
            {/* Elegant Welcome Banner */}
            <div 
              id="dashboard-hero"
              className="relative p-8 md:p-10 bg-white border border-olive-light rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8"
            >
              <div className="flex flex-col max-w-xl text-start">
                <span className="text-[10px] uppercase tracking-widest text-brand-olive font-bold flex items-center gap-1.5 font-sans">
                   <div className="w-1.5 h-1.5 rounded-full bg-brand-olive animate-pulse" />
                   {t('dashboard.terminal_interface')}
                </span>
                <h1 className="font-serif text-3xl font-extrabold text-olive-dark mt-2 tracking-tight leading-tight">
                  {t('dashboard.welcome_staff', { name: session.user?.name || 'Staff' })}
                </h1>
                <p className="text-gray-500 text-xs mt-2 leading-relaxed font-sans">
                  {t('dashboard.description', { branch: session.activeBranch })}
                </p>
              </div>

              {/* Quick Actions & Live Info */}
              <div className="flex flex-col items-end gap-3">
                {isCafeBranchEnabled(session.activeBranch || '') && (
                  <button
                    onClick={handleOpenGate}
                    disabled={isOpeningGate}
                    className="flex items-center gap-2 bg-brand-olive text-white px-5 py-2.5 rounded-lg shadow-sm hover:bg-olive-dark transition-colors font-bold disabled:opacity-50 min-w-[150px] justify-center"
                  >
                    {isOpeningGate ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <ShieldCheck className="w-5 h-5" />
                        {language === 'ar' ? 'فتح البوابة' : 'Open Gate'}
                      </>
                    )}
                  </button>
                )}

                {/* Live Info Panel */}
                <div className="flex flex-col items-start md:items-end text-start md:text-end px-4 py-3 bg-olive-soft rounded-lg border border-olive-light/40 min-w-[200px]">
                <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-bold text-gray-500 mb-1 font-sans">
                  <Clock className="w-3 h-3 text-brand-olive" />
                  <span>{t('dashboard.clock')}</span>
                </div>
                <div className="text-xs font-bold text-olive-dark py-1">
                  {dateTimeStr || t('dashboard.syncing')}
                </div>
                {isAdminSession && (
                  <button
                    onClick={() => setCurrentStep('ADMIN_SUITE')}
                    className="mt-2 text-[9px] uppercase font-bold text-brand-olive border border-brand-olive/30 px-2 py-1 rounded bg-white hover:bg-olive-light transition-colors font-sans"
                  >
                    {t('dashboard.open_admin')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Injected Phase 3 Customer Directory */}
            {!currentShift && !isAdminSession && currentStep === 'DASHBOARD' ? (
               <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-10 flex flex-col items-center justify-center border-2 border-red-400 border-dashed animate-pulse my-8">
                 <button 
                   onClick={() => { setShiftMode('open'); setShowShiftManager(true); }}
                   className="bg-brand-olive text-white px-8 py-4 rounded-xl font-bold flex items-center gap-3 shadow-lg hover:bg-olive-dark transition-colors text-lg"
                 >
                   <ShieldCheck className="w-6 h-6" />
                   {language === 'ar' ? 'الرجاء فتح الوردية للبدء (Open Shift)' : 'Please Open Shift to Start'}
                 </button>
               </div>
            ) : (
              <CustomerList 
                isAdmin={isAdminSession}
                onSelectCustomer={(c) => {
                  setSelectedCustomer(c);
                  setCurrentStep('CUSTOMER_PROFILE');
                }} 
              />
            )}

          </div>
        )}

        {/* Shift Manager UI for App level */}
        <ShiftManager
          isOpen={showShiftManager}
          mode={shiftMode}
          language={language}
          onClose={() => setShowShiftManager(false)}
          onConfirm={(amount) => {
            if (shiftMode === 'open') handleOpenShift(amount);
            if (shiftMode === 'close') handleCloseShift(amount, () => {
              // ── Step 2: Shift closed — automatically advance to EOD modal.
              // isLogoutFlow=true suppresses the standalone Close button so the
              // staff member must use Confirm Logout to end their session.
              setIsShiftSummaryOnly(false);
              setIsLogoutFlow(true);
              setIsEODModalOpen(true);
            });
          }}
        />

        {isEODModalOpen && (
          <EODSummaryModal
            session={session}
            isShiftSummaryOnly={isShiftSummaryOnly}
            hideClose={isLogoutFlow}
            // When in the logout wizard flow, pass a no-op to onClose so the
            // modal cannot be dismissed without confirming logout.
            // When viewing an X-report (isShiftSummaryOnly), allow normal close.
            onClose={isLogoutFlow ? () => {} : () => setIsEODModalOpen(false)}
            onConfirmLogout={confirmLogout}
          />
        )}
      </main>

      {/* Beautiful Central Toast Overlay */}
      {toast && (
        <div 
          id="central-toast" 
          className={`fixed bottom-6 right-6 z-[200] max-w-sm flex items-center gap-3 px-4 py-3.5 rounded-xl shadow-xl border animate-fade-in transition-all duration-300 ${
            toast.type === 'error' 
              ? 'bg-rose-50 text-rose-700 border-rose-200 shadow-rose-100/40' 
              : toast.type === 'ref'
              ? 'bg-sky-50 text-sky-700 border-sky-200 shadow-sky-100/40'
              : 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-emerald-100/40'
          }`}
        >
          <AlertCircle className={`w-5 h-5 shrink-0 ${toast.type === 'error' ? 'text-rose-500' : toast.type === 'ref' ? 'text-sky-500' : 'text-emerald-500'}`} />
          <span className="text-xs font-semibold leading-normal font-sans">{toast.message}</span>
        </div>
      )}

      {/* Scanner Debug Log Panel — admin-only in production, visible to all in dev */}
      {session.isLoggedIn && (session.user?.role === 'admin' || import.meta.env.DEV) && (
        <>
          <button
            onClick={() => setShowScannerLogs(!showScannerLogs)}
            className="fixed bottom-6 left-6 z-[300] bg-gray-900 text-white px-3 py-2 rounded-lg text-xs font-mono shadow-lg hover:bg-gray-700 transition-colors"
          >
            {showScannerLogs ? '🔽 Hide' : '📋 Scanner Logs'} ({scannerLogs.length})
          </button>
          {showScannerLogs && (
            <div className="fixed bottom-16 left-6 z-[300] w-[500px] max-h-[350px] bg-gray-950 text-green-400 rounded-xl shadow-2xl border border-gray-700 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700">
                <span className="text-xs font-bold text-white">🔍 Scanner Debug Logs</span>
                <div className="flex gap-2">
                  <button onClick={() => setScannerLogs([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                  <button onClick={() => setShowScannerLogs(false)} className="text-xs text-gray-400 hover:text-white">✕</button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[300px] p-2 font-mono text-[11px] leading-relaxed">
                {scannerLogs.length === 0 ? (
                  <div className="text-gray-500 text-center py-4">Waiting for scan input... Try scanning a QR code now.</div>
                ) : (
                  scannerLogs.map((log, i) => (
                    <div key={i} className={`py-0.5 ${log.includes('✅') ? 'text-green-400' : log.includes('❌') || log.includes('⛔') || log.includes('💥') ? 'text-red-400' : log.includes('⚠️') ? 'text-yellow-400' : 'text-gray-300'}`}>
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
