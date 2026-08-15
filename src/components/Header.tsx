import React from 'react';
import { LogOut, MapPin, Settings, User, RefreshCw, Globe, FileText, ShieldCheck } from 'lucide-react';
import { Branch } from '../types';
import Logo from './Logo';
import { useLanguage } from '../LanguageContext';

interface HeaderProps {
  staffName: string;
  activeBranch: Branch;
  isAdmin: boolean;
  onLogout: () => void;
  onOpenShiftReport: () => void;
  onChangeBranch: () => void;
  onOpenAdmin: () => void;
  onSwitchProfile?: () => void;
  companyName: string;
  onOpenGate?: () => void;
  isOpeningGate?: boolean;
}

export default function Header({ 
  staffName, 
  activeBranch, 
  isAdmin, 
  onLogout, 
  onOpenShiftReport,
  onChangeBranch,
  onOpenAdmin,
  onSwitchProfile,
  companyName,
  onOpenGate,
  isOpeningGate
}: HeaderProps) {
  const { language, setLanguage, t } = useLanguage();

  const toggleLanguage = () => {
    setLanguage(language === 'ar' ? 'en' : 'ar');
  };

  return (
    <header 
      id="global-header"
      className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-olive-light shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Left: Brand Identity */}
        <div id="header-brand-section" className="flex items-center gap-3">
          <Logo size="sm" className="hidden sm:flex shrink-0" />
          <div className="flex flex-col text-start">
            <span className="font-serif text-sm md:text-base font-extrabold tracking-tight text-olive-dark uppercase">
              {companyName || 'Hayat Beauty & Care'}
            </span>
            <span className="text-[9px] text-brand-olive font-bold tracking-widest uppercase">
              {t('header.terminal_title')}
            </span>
          </div>
        </div>

        {/* Right: Staff Info, Active Branch, Language Trigger & Controls */}
        <div id="header-user-section" className="flex items-center gap-2 md:gap-3">
          {/* Language Switch Button */}
          <button
            id="header-lang-switcher"
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-olive-light bg-olive-soft hover:bg-olive-light/60 text-olive-dark text-xs font-semibold cursor-pointer transition-all duration-350 shrink-0"
            title={language === 'ar' ? 'Change language to English' : 'تغيير اللغة إلى العربية'}
          >
            <Globe className="w-3.5 h-3.5 text-brand-olive" />
            <span>{language === 'ar' ? 'English' : 'عربي'}</span>
          </button>

          {/* Active Terminal Info */}
          <button
            id="header-branch-pill"
            onClick={onChangeBranch}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-full bg-olive-light/40 hover:bg-olive-light/75 border border-brand-olive/20 hover:border-brand-olive text-olive-dark transition-all duration-300 pointer cursor-pointer max-w-[120px] xs:max-w-none text-start"
            title="Click to change active terminal branch"
          >
            <MapPin className="w-3.5 h-3.5 text-brand-olive group-hover:scale-110 transition-transform" />
            <div className="flex flex-col text-start leading-none select-none">
              <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">{t('header.branch_label')}</span>
              <span className="text-xs font-semibold">{activeBranch}</span>
            </div>
            <RefreshCw className="w-3 h-3 text-brand-olive/65 group-hover:rotate-180 transition-transform duration-500 ml-1" />
          </button>

          {/* User Profile Info Badge */}
          <div 
            id="header-staff-badge"
            className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-olive-soft border border-gray-100 text-start"
          >
            <div className="w-6 h-6 rounded-full bg-brand-olive text-white flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col text-start leading-none">
              <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">{t('header.staff_label')}</span>
              <span className="text-xs font-medium text-olive-dark">{staffName}</span>
            </div>
          </div>

          {/* Admin Command Center (Only visible to privileged Admin users) */}
          {isAdmin && (
            <button
              id="header-admin-settings-btn"
              onClick={onOpenAdmin}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-olive bg-olive-light/35 hover:bg-olive-light text-brand-olive text-xs font-sans font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-sm"
              title="Enter Global Administration Suite"
            >
              <Settings className="w-3.5 h-3.5 animate-spin-slow" />
              <span className="hidden lg:inline">{t('header.admin_settings')}</span>
            </button>
          )}

          {/* Gate Open Button */}
          {onOpenGate && (
            <button
              id="header-gate-open-btn"
              onClick={onOpenGate}
              disabled={isOpeningGate}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-olive bg-brand-olive hover:bg-olive-dark text-white text-xs font-sans font-bold uppercase tracking-wider transition-all duration-300 cursor-pointer shadow-sm disabled:opacity-50"
              title={language === 'ar' ? 'فتح البوابة' : 'Open Gate'}
            >
              {isOpeningGate ? (
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{language === 'ar' ? 'فتح البوابة' : 'Open Gate'}</span>
            </button>
          )}

          {/* Shift Report Trigger Button */}
          <button
            id="header-shift-report-btn"
            onClick={onOpenShiftReport}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-olive hover:border-brand-olive bg-olive-soft/40 hover:bg-olive-light/60 text-olive-dark text-xs font-sans font-medium uppercase tracking-wider transition-all duration-300 cursor-pointer"
            title={language === 'ar' ? 'تقرير الشفت (بدون خروج)' : 'View Shift Report'}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{language === 'ar' ? 'تقريري' : 'Report'}</span>
          </button>

          {/* Switch Profile Button */}
          {onSwitchProfile && (
            <button
              id="header-switch-profile-btn"
              onClick={onSwitchProfile}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-olive/30 hover:border-brand-olive bg-olive-soft/40 hover:bg-olive-light/60 text-brand-olive text-xs font-sans font-medium uppercase tracking-wider transition-all duration-300 cursor-pointer"
              title={language === 'ar' ? 'تبديل الموظف' : 'Switch Profile'}
            >
              <User className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language === 'ar' ? 'تبديل الموظف' : 'Switch Profile'}</span>
            </button>
          )}

          {/* Logout Trigger Button */}
          <button
            id="header-logout-btn"
            onClick={onLogout}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 hover:border-red-200 bg-red-50/20 hover:bg-red-50 text-red-600 hover:text-red-700 text-xs font-sans font-medium uppercase tracking-wider transition-all duration-300 cursor-pointer"
            title="Log out of active terminal session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('header.logout')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
