import React, { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { CafeOrder } from '../types';
import { BarChart3, TrendingUp, Calendar, ArrowLeft } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { isCafeAccessAllowed, unlockCafeAccessByPin } from '../utils/cafeAuth';

export default function CafeAnalyticsDashboard() {
  const { language: lang, dir, t: translate } = useLanguage();
  const [orders, setOrders] = useState<CafeOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(() => !isCafeAccessAllowed());
  const [pinInput, setPinInput] = useState('');

  useEffect(() => {
    const fetchOrders = async () => {
      if (isLocked) return;
      try {
        const q = query(collection(db, 'cafe_orders'));
        const snap = await getDocs(q);
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as CafeOrder));
        setOrders(data.filter(o => o.status === 'Completed'));
      } catch (err) {
        console.error('Failed to fetch analytics data', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, [isLocked]);

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await unlockCafeAccessByPin(pinInput);
    if (result.ok) {
      setIsLocked(false);
      setPinInput('');
    } else {
      alert(lang === 'ar' ? 'الرقم السري غير صحيح' : 'Incorrect PIN');
      setPinInput('');
    }
  };

  if (isLocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir={dir}>
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-center mb-6">{lang === 'ar' ? 'لوحة التحليلات' : 'Analytics Dashboard'}</h2>
          <form onSubmit={handlePinSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'ar' ? 'الرقم السري' : 'PIN'}</label>
              <input
                type="password"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                className="w-full border-gray-300 rounded-xl p-3 bg-gray-50 focus:ring-2 focus:ring-blue-500"
                placeholder="****"
                autoFocus
              />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">
              {lang === 'ar' ? 'دخول' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Analytics Calculations
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
  const totalOrdersCount = orders.length;

  const itemCounts: Record<string, { name: string, count: number, revenue: number }> = {};
  orders.forEach(o => {
    o.items.forEach(i => {
      if (!itemCounts[i.name]) itemCounts[i.name] = { name: i.name, count: 0, revenue: 0 };
      itemCounts[i.name].count += i.quantity;
      itemCounts[i.name].revenue += (i.price * i.quantity);
    });
  });

  const topItems = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 5);
  const maxItemCount = Math.max(...topItems.map(i => i.count), 1);

  return (
    <div className="min-h-screen bg-gray-50 font-sans" dir={dir}>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => window.location.href = '/cafe/admin'} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className={`w-5 h-5 ${lang === 'ar' ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex items-center gap-2 text-xl font-bold text-gray-800">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            {lang === 'ar' ? 'لوحة التحليلات' : 'Analytics Dashboard'}
          </div>
        </div>
        <button onClick={() => {
          sessionStorage.removeItem('cafe_admin_auth');
          setIsLocked(true);
        }} className="text-sm font-bold text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg">
          {lang === 'ar' ? 'تسجيل خروج' : 'Logout'}
        </button>
      </div>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {isLoading ? (
          <div className="text-center py-20 text-gray-500 font-bold animate-pulse">
            {lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium mb-1">{lang === 'ar' ? 'إجمالي المبيعات' : 'Total Revenue'}</p>
                  <p className="text-2xl font-bold text-gray-900">{totalRevenue.toFixed(3)} BD</p>
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500 font-medium mb-1">{lang === 'ar' ? 'إجمالي الطلبات' : 'Total Orders'}</p>
                  <p className="text-2xl font-bold text-gray-900">{totalOrdersCount}</p>
                </div>
              </div>
            </div>

            {/* Top Items Chart */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="text-lg font-bold text-gray-800 mb-6">{lang === 'ar' ? 'أكثر المنتجات مبيعاً' : 'Top Selling Items'}</h3>
              <div className="space-y-4">
                {topItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4">
                    <div className="w-32 shrink-0 text-sm font-bold text-gray-600 truncate">{item.name}</div>
                    <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full transition-all duration-1000"
                        style={{ width: `${(item.count / maxItemCount) * 100}%` }}
                      />
                    </div>
                    <div className="w-16 shrink-0 text-right text-sm font-bold text-gray-900">{item.count}</div>
                  </div>
                ))}
                {topItems.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {lang === 'ar' ? 'لا توجد بيانات كافية' : 'Not enough data'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
