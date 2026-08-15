import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../LanguageContext';
import { db } from '../../firebase';
import { collection, query, orderBy, limit, getDocs, where, Timestamp } from 'firebase/firestore';
import { RefreshCw, History, Search, Calendar as CalendarIcon, User, Coffee, Dumbbell, Receipt } from 'lucide-react';
import { AuditLog } from '../../types';

export default function AuditLogsAdmin() {
  const { language } = useLanguage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Date filter logic (default: today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const [startDate, setStartDate] = useState<string>(today.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(today.toISOString().split('T')[0]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let q = query(
        collection(db, 'auditLogs'),
        orderBy('timestamp', 'desc'),
        limit(500) // limit to avoid massive reads
      );

      // We cannot easily do range queries and orderBy on different fields without a composite index,
      // so we will fetch ordered by timestamp, and then filter locally by date and search query.
      
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AuditLog[];
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatDate = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString(language === 'ar' ? 'ar-BH' : 'en-US');
  };
  
  const getActionIcon = (action: string) => {
    if (action.includes('Cafe') || action.includes('Coffee')) return <Coffee className="w-5 h-5" />;
    if (action.includes('Gym') || action.includes('Package') || action.includes('Deduction')) return <Dumbbell className="w-5 h-5" />;
    return <Receipt className="w-5 h-5" />;
  };

  // Filter logs locally
  const filteredLogs = logs.filter(log => {
    // Date filter
    const logDate = log.timestamp?.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
    
    // Create start of day for startDate
    const sDate = new Date(startDate);
    sDate.setHours(0, 0, 0, 0);
    
    // Create end of day for endDate
    const eDate = new Date(endDate);
    eDate.setHours(23, 59, 59, 999);
    
    // Check bounds
    if (logDate < sDate || logDate > eDate) {
      return false;
    }

    // Search filter (staff, customer, action)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchStaff = log.staffName?.toLowerCase().includes(q) || false;
      const matchCustomer = log.customerName?.toLowerCase().includes(q) || false;
      const matchAction = log.action?.toLowerCase().includes(q) || false;
      const matchDetails = log.details?.toLowerCase().includes(q) || false;
      if (!matchStaff && !matchCustomer && !matchAction && !matchDetails) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif text-olive-dark flex items-center gap-2">
            <History className="w-6 h-6 text-brand-olive" />
            {language === 'ar' ? 'سجل المعاملات الشامل' : 'Global Audit Logs'}
          </h2>
          <p className="text-sm text-gray-500 mt-1 font-sans">
            {language === 'ar' ? 'مراقبة كافة حركات الخصم والمبيعات للموظفين' : 'Monitor all deductions and sales across staff'}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
           <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
             <CalendarIcon className="w-4 h-4 text-gray-400" />
             <input 
               type="date" 
               value={startDate} 
               onChange={e => setStartDate(e.target.value)}
               className="bg-transparent text-xs outline-none text-gray-700"
             />
             <span className="text-gray-400 text-xs">-</span>
             <input 
               type="date" 
               value={endDate} 
               onChange={e => setEndDate(e.target.value)}
               className="bg-transparent text-xs outline-none text-gray-700"
             />
           </div>
          <button 
            onClick={fetchLogs} 
            disabled={loading}
            className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="px-6 py-4 bg-white border-b border-gray-100">
        <div className="relative w-full max-w-md">
          <input
            type="text"
            placeholder={language === 'ar' ? 'بحث باسم الموظفة، الزبونة، أو نوع العملية...' : 'Search staff, customer, or action...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full px-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-brand-olive transition-all text-gray-700 ${language === 'ar' ? 'text-right' : 'text-left'}`}
          />
          <Search className={`w-4 h-4 text-gray-400 absolute top-1/2 -translate-y-1/2 ${language === 'ar' ? 'right-4' : 'left-4'}`} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-olive"></div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-sans">
            {language === 'ar' ? 'لا يوجد سجلات مطابقة.' : 'No matching logs found.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLogs.map(log => (
              <div key={log.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-olive-soft text-brand-olive flex items-center justify-center shrink-0">
                   {getActionIcon(log.action)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col md:flex-row justify-between md:items-start mb-1 gap-2">
                    <h3 className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                      {log.action}
                    </h3>
                    <span className="text-[10px] text-gray-400 font-mono shrink-0 bg-gray-50 px-2 py-1 rounded">
                      {formatDate(log.timestamp)}
                    </span>
                  </div>
                  
                  <div className="flex flex-col gap-1 mt-2">
                     {log.customerName && (
                        <div className="text-xs text-gray-600 flex items-center gap-1.5">
                           <User className="w-3.5 h-3.5 text-gray-400" />
                           <span className="font-semibold text-gray-800">{log.customerName}</span>
                           <span className="text-gray-400">({log.customerId})</span>
                        </div>
                     )}
                     <div className="text-xs text-gray-500">
                        {log.details}
                     </div>
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end border-t md:border-t-0 md:border-l border-gray-100 pt-3 md:pt-0 md:pl-4 mt-2 md:mt-0">
                  <span className="text-[10px] uppercase font-bold text-gray-400 mb-1">
                     {language === 'ar' ? 'الموظفة' : 'Staff'}
                  </span>
                  <span className="text-xs font-bold text-olive-dark bg-olive-light/30 px-2 py-1 rounded">
                     {log.staffName || 'System'}
                  </span>
                  {log.branch && (
                     <span className="text-[9px] uppercase font-bold text-gray-400 mt-1">
                        {log.branch}
                     </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
