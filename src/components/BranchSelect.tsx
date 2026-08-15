import React from 'react';
import { MapPin, ArrowRight, Building2, ArrowLeft } from 'lucide-react';
import { Branch } from '../types';
import Logo from './Logo';
import { useLanguage } from '../LanguageContext';

interface BranchSelectProps {
  onBranchSelect: (branch: Branch) => void;
  staffName: string;
  branches: string[];
}

export default function BranchSelect({ onBranchSelect, staffName, branches = [] }: BranchSelectProps) {
  const { t, language } = useLanguage();
  
  // Luxury brief descriptions for each branch to elevate the layout design
  const branchDetails: Record<string, { desc: string; type: string }> = {
    Riffa: { desc: t('branchSelect.riffa_desc'), type: t('branchSelect.riffa_type') },
    Janabiya: { desc: t('branchSelect.janabiya_desc'), type: t('branchSelect.janabiya_type') },
    Busaiteen: { desc: t('branchSelect.busaiteen_desc'), type: t('branchSelect.busaiteen_type') },
    Askar: { desc: t('branchSelect.askar_desc'), type: t('branchSelect.askar_type') },
  };

  const activeBranchesList = branches.length > 0 ? branches : ['Riffa', 'Janabiya', 'Busaiteen', 'Askar'];

  return (
    <div 
      id="branch-select-screen" 
      className="flex flex-col items-center justify-center min-h-[85vh] px-4 animate-fade-in"
    >
      <div 
        id="branch-select-card"
        className="w-full max-w-2xl bg-white border border-olive-light rounded-2xl shadow-xl p-8 md:p-12 transition-all duration-300"
      >
        {/* Header greeting */}
        <div className="flex flex-col items-center text-center mb-8">
          <Logo size="md" className="mb-4" />
          <p className="text-[10px] uppercase tracking-widest text-brand-olive font-semibold font-sans">
            {t('branchSelect.welcome', { name: staffName })}
          </p>
          <h2 className="font-serif text-3xl font-medium tracking-tight text-olive-dark mt-2">
            {t('branchSelect.select_branch')}
          </h2>
          <p className="text-gray-500 text-xs mt-2 max-w-sm font-sans">
            {t('branchSelect.description')}
          </p>
        </div>

        {/* Branch Cards Bento-Grid */}
        <div id="branches-list-grid" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeBranchesList.map(branchName => {
            const details = branchDetails[branchName] || { 
              desc: t('common.loading'), 
              type: t('common.branch') 
            };
            return (
              <button
                id={`branch-btn-${branchName}`}
                key={branchName}
                onClick={() => onBranchSelect(branchName)}
                className="group relative text-start p-5 border border-gray-150 hover:border-brand-olive rounded-xl bg-olive-soft/40 hover:bg-olive-light/20 transition-all duration-300 pointer cursor-pointer outline-none overflow-hidden flex flex-col justify-between min-h-[120px] shadow-sm hover:shadow-md"
              >
                {/* Visual Accent Corner */}
                <div className="absolute top-0 right-0 h-10 w-10 bg-brand-olive/10 group-hover:bg-brand-olive rounded-bl-3xl flex items-center justify-center transition-all duration-300">
                  <MapPin className="w-4 h-4 text-brand-olive group-hover:text-white transition-colors duration-300" />
                </div>

                <div className="text-start">
                  <span className="text-[9px] uppercase tracking-wider text-brand-olive font-bold">
                    {details.type}
                  </span>
                  <h3 className="font-serif text-lg font-semibold text-olive-dark group-hover:text-brand-olive transition-colors duration-250 mt-1">
                    {branchName}
                  </h3>
                  <p className="text-xs text-gray-400 mt-2 line-clamp-1 group-hover:text-gray-500 transition-colors font-sans">
                    {details.desc}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-brand-olive font-medium mt-4 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-[-4px] group-hover:translate-x-0 font-sans">
                  <span>{t('branchSelect.enter')}</span>
                  {language === 'ar' ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer info/status */}
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 uppercase tracking-wider mt-8 pt-6 border-t border-gray-100 font-sans">
          <Building2 className="w-3.5 h-3.5 text-gray-300" />
          <span>{t('branchSelect.sync_active')}</span>
        </div>
      </div>
    </div>
  );
}
