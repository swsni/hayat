import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../LanguageContext';
import { db } from '../../firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { ShieldCheck, ShieldBan, RefreshCw, KeyRound } from 'lucide-react';

export default function GateLogsAdmin() {
  const { language } = useLanguage();
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'gateLogs'), orderBy('timestamp', 'desc'), limit(100));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setLogs(data);
    } catch (err) {
      console.error("Failed to fetch gate logs:", err);
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

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="p-6 border-b border-gray-200 bg-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold font-serif text-olive-dark flex items-center gap-2">
            <KeyRound className="w-6 h-6 text-brand-olive" />
            {language === 'ar' ? 'سجل بوابة الجيم' : 'Gate Access Logs'}
          </h2>
          <p className="text-sm text-gray-500 mt-1 font-sans">
            {language === 'ar' ? 'عرض محاولات الدخول عبر البوابة الإلكترونية' : 'View physical gate scan attempts'}
          </p>
        </div>
        <button 
          onClick={fetchLogs} 
          disabled={loading}
          className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {loading && logs.length === 0 ? (
          <div className="flex justify-center items-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-olive"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-gray-400 font-sans">
            {language === 'ar' ? 'لا يوجد سجلات حتى الآن.' : 'No gate logs found.'}
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map(log => (
              <div key={log.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                  log.status === 'GRANTED' ? 'bg-green-50 text-green-500' : 'bg-red-50 text-red-500'
                }`}>
                  {log.status === 'GRANTED' ? <ShieldCheck className="w-6 h-6" /> : <ShieldBan className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-gray-900 truncate text-sm">
                      {log.customerName}
                    </h3>
                    <span className="text-[10px] text-gray-400 font-mono shrink-0 ml-2">
                      {formatDate(log.timestamp)}
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 font-mono">ID: {log.customerId}</span>
                      <span className={`text-[11px] font-bold mt-1 ${log.status === 'GRANTED' ? 'text-green-600' : 'text-red-500'}`}>
                        {log.reason}
                      </span>
                    </div>
                    {log.branch && (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        {log.branch}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
