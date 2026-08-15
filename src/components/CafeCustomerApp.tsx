import React, { useState, useEffect, useRef } from 'react';
import { ShoppingBag, Plus, Minus, ArrowRight, History, Coffee, CheckCircle2, Clock, AlertCircle, Globe } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, doc, query, where, getDocs, onSnapshot, limit, orderBy, updateDoc } from 'firebase/firestore';
import { CafeOrder, CafeCategory, CafeMenuItem, Customer } from '../types';
import { getLocalisedCafeName } from '../utils/cafeMenu';
import { getCafeBranchName } from '../utils/cafeBranch';
import { isQatarBranch } from '../utils/branchHelpers';
import { ensureBrowserNotificationPermission, showBrowserNotification } from '../utils/browserNotifications';

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

type Lang = 'ar' | 'en';

const t = (lang: Lang, isQatar: boolean) => ({
  title: lang === 'ar' ? 'حياة كافيه ☕️' : 'Hayat Café ☕️',
  subtitle: lang === 'ar' ? 'الطلب والدفع عند الكاونتر' : 'Order & Pay at counter',
  pastOrders: lang === 'ar' ? 'طلباتك السابقة' : 'Your Past Orders',
  reorder: lang === 'ar' ? 'طلب مرة أخرى' : 'Reorder',
  total: lang === 'ar' ? 'الإجمالي' : 'Total',
  sendOrder: lang === 'ar' ? 'إرسال الطلب' : 'Submit Order',
  sending: lang === 'ar' ? 'جاري الإرسال...' : 'Sending...',
  notesPlaceholder: lang === 'ar' ? 'ملاحظات الطلب (مثال: سكر خفيف، إيصاله لقسم الأظافر...)' : 'Order notes (e.g. less sugar, deliver to nails section...)',
  trackTitle: lang === 'ar' ? 'تتبع الطلب' : 'Track Order',
  orderNum: lang === 'ar' ? 'طلب رقم' : 'Order #',
  pending: lang === 'ar' ? 'الطلب في الانتظار...' : 'Order is pending...',
  preparing: lang === 'ar' ? 'جاري تحضير قهوتك ☕️' : 'Your coffee is being prepared ☕️',
  ready: lang === 'ar' ? 'طلبك جاهز للاستلام! 🎉' : 'Your order is ready! 🎉',
  completed: lang === 'ar' ? 'تم استلام الطلب. بالعافية!' : 'Order collected. Enjoy!',
  stayMsg: lang === 'ar' ? 'جاري تجهيز طلبك.. يرجى البقاء في هذه الصفحة، سيتم تحديثها تلقائياً وإصدار تنبيه فور جهوزية الطلب.' : 'Preparing your order.. Please stay on this page, it will auto-update and alert you when ready.',
  goCounter: lang === 'ar' ? 'تفضل إلى الكاونتر لاستلام طلبك' : 'Head to the counter to collect your order',
  payAtCounter: lang === 'ar' ? 'الدفع عند الاستلام' : 'Pay on pickup',
  newOrder: lang === 'ar' ? 'طلب جديد' : 'New Order',
  currency: lang === 'ar' ? (isQatar ? 'ر.ق' : 'د.ب') : (isQatar ? 'QAR' : 'BD'),
  error: lang === 'ar' ? 'حدث خطأ أثناء إرسال الطلب، يرجى المحاولة مرة أخرى.' : 'An error occurred, please try again.',
});

export default function CafeCustomerApp() {
  const [lang, setLang] = useState<Lang>('ar');
  const isQatar = isQatarBranch(getCafeBranchName());
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [linkResolutionError, setLinkResolutionError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<CafeOrder | null>(null);
  const [pastOrders, setPastOrders] = useState<CafeOrder[]>([]);
  
  // Dynamic Menu States
  const [categories, setCategories] = useState<CafeCategory[]>([]);
  const [items, setItems] = useState<CafeMenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  
  // Advanced Features States
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<string>('Waiting Area');
  const [scheduledTime, setScheduledTime] = useState<string>('Now');
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const notificationsInitializedRef = useRef(false);
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const i = t(lang, isQatar);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    let unsubscribeCustomer: (() => void) | undefined;
    let isMounted = true;

    const initCustomerFromLink = async () => {
      const signedCid = urlParams.get('cid');
      const signedTs = urlParams.get('ts');
      const signedSig = urlParams.get('sig');
      const legacyCustomerId = urlParams.get('customerId');
      const hasLinkParams = Boolean(signedCid || signedTs || signedSig || legacyCustomerId);

      if (!hasLinkParams) return;

      const authQuery = new URLSearchParams();
      if (signedCid) authQuery.set('cid', signedCid);
      if (signedTs) authQuery.set('ts', signedTs);
      if (signedSig) authQuery.set('sig', signedSig);
      if (legacyCustomerId) authQuery.set('customerId', legacyCustomerId);

      try {
        const response = await fetch(`/api/cafe/resolve-customer?${authQuery.toString()}`);
        if (!response.ok) {
          throw new Error('Invalid or expired auto-login link');
        }

        const payload = await response.json();
        const resolvedCustomerId = typeof payload?.customerId === 'string' ? payload.customerId : '';
        if (!resolvedCustomerId) {
          throw new Error('Could not verify account');
        }

        if (payload?.resolvedVia === 'legacy' && payload?.signedQuery) {
          const nextParams = new URLSearchParams(window.location.search);
          const cid = typeof payload.signedQuery.cid === 'string' ? payload.signedQuery.cid : '';
          const ts = typeof payload.signedQuery.ts === 'string' ? payload.signedQuery.ts : '';
          const sig = typeof payload.signedQuery.sig === 'string' ? payload.signedQuery.sig : '';
          if (cid && ts && sig) {
            nextParams.set('cid', cid);
            nextParams.set('ts', ts);
            nextParams.set('sig', sig);
            nextParams.delete('customerId');
            const nextQuery = nextParams.toString();
            const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
            window.history.replaceState({}, '', nextUrl);
          }
        }

        if (!isMounted) return;

        setLinkResolutionError(null);
        setCustomerId(resolvedCustomerId);
        fetchPastOrders(resolvedCustomerId);

        unsubscribeCustomer = onSnapshot(doc(db, 'customers', resolvedCustomerId), (docSnap) => {
          if (docSnap.exists()) {
            setCustomer({ id: docSnap.id, ...docSnap.data() } as Customer);
          }
        });
      } catch (err: any) {
        console.warn('[Cafe] Failed to resolve customer from link:', err);
        if (!isMounted) return;
        setCustomerId(null);
        setCustomer(null);
        setLinkResolutionError(err?.message || 'Could not verify link');
      }
    };

    initCustomerFromLink();

    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

    const unsubscribeCategories = onSnapshot(collection(db, 'cafe_categories'), (snapshot) => {
      const cats: CafeCategory[] = [];
      snapshot.forEach(docSnap => {
        cats.push({ id: docSnap.id, ...docSnap.data() } as CafeCategory);
      });
      setCategories(cats.sort((a, b) => a.order - b.order));
    });

    const unsubscribeItems = onSnapshot(collection(db, 'cafe_items'), (snapshot) => {
      const itms: CafeMenuItem[] = [];
      snapshot.forEach(docSnap => {
        itms.push({ id: docSnap.id, ...docSnap.data() } as CafeMenuItem);
      });
      setItems(itms.sort((a, b) => a.order - b.order));
    });

    return () => {
      isMounted = false;
      if (unsubscribeCustomer) unsubscribeCustomer();
      unsubscribeCategories();
      unsubscribeItems();
    };
  }, []);

  const fetchPastOrders = async (cid: string) => {
    try {
      const q = query(
        collection(db, 'cafe_orders'),
        where('customerId', '==', cid)
      );
      const snap = await getDocs(q);
      
      // Filter, sort, and limit locally to avoid composite index requirements
      const orders = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as CafeOrder))
        .filter(o => o.status === 'Completed')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3);
        
      setPastOrders(orders);
    } catch (e) {
      console.error('Failed to fetch past orders', e);
    }
  };

  useEffect(() => {
    if (!activeOrder?.id) return;
    const unsubscribe = onSnapshot(doc(db, 'cafe_orders', activeOrder.id) as any, (doc: any) => {
      if (doc.exists()) {
        const data = doc.data() as CafeOrder;
        if (data.status === 'Ready' && activeOrder.status !== 'Ready') {
          if (audioRef.current) {
            audioRef.current.play().catch(e => console.log('Audio play failed:', e));
          }
        }
        setActiveOrder({ id: doc.id, ...data });
      }
    });
    return () => unsubscribe();
  }, [activeOrder?.id, activeOrder?.status]);

  useEffect(() => {
    if (!customerId) return;

    notificationsInitializedRef.current = false;
    seenNotificationIdsRef.current = new Set();

    const qNotifications = query(
      collection(db, 'web_notifications'),
      where('targetCustomerId', '==', customerId),
      orderBy('createdAt', 'desc'),
      limit(25)
    );

    const unsubscribe = onSnapshot(qNotifications, async (snapshot) => {
      if (!notificationsInitializedRef.current) {
        snapshot.docs.forEach((docSnap) => seenNotificationIdsRef.current.add(docSnap.id));
        notificationsInitializedRef.current = true;
        return;
      }

      const permission = await ensureBrowserNotificationPermission();
      if (permission !== 'granted') return;

      for (const change of snapshot.docChanges()) {
        if (change.type !== 'added') continue;
        if (seenNotificationIdsRef.current.has(change.doc.id)) continue;

        seenNotificationIdsRef.current.add(change.doc.id);
        const payload = change.doc.data() as {
          title?: string;
          body?: string;
          url?: string;
          type?: string;
        };

        await showBrowserNotification({
          title: payload.title || 'Hayat',
          body: payload.body || 'لديك تحديث جديد.',
          url: payload.url || '/cafe',
          tag: payload.type || 'hayat-notification',
        });

        try {
          await updateDoc(change.doc.ref, {
            isRead: true,
            readAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[Cafe] Failed to mark notification as read:', err);
        }
      }
    }, (error) => {
      console.warn('[Cafe] Web notification listener failed:', error);
    });

    return () => {
      unsubscribe();
      notificationsInitializedRef.current = false;
      seenNotificationIdsRef.current = new Set();
    };
  }, [customerId]);

  const addToCart = (item: { id: string; name: { ar: string; en: string }; price: number }) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { id: item.id, name: getLocalisedCafeName(item.name, lang), price: item.price, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === id);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => i.id !== id);
    });
  };

  const handleReorder = (order: CafeOrder) => {
    setCart(order.items);
    setNotes(order.notes || '');
  };

  // Loyalty and Cart Calculations
  const eligibleItemsInCart = cart.filter(cartItem => {
    const menuItem = items.find(i => i.id === cartItem.id);
    return menuItem?.isStampEligible;
  });
  
  const isEligibleForFreeDrink = customer && (customer.coffeeStamps || 0) >= 4 && eligibleItemsInCart.length > 0;
  
  let cheapestItemPrice = 0;
  let freeItemId = '';
  if (isEligibleForFreeDrink) {
    const cheapestItem = [...cart].sort((a, b) => a.price - b.price)[0];
    if (cheapestItem) {
      cheapestItemPrice = cheapestItem.price;
      freeItemId = cheapestItem.id;
    }
  }

  const subtotalAmount = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const totalAmount = Math.max(0, subtotalAmount - cheapestItemPrice);

  const cartItemIdsForCrossSell = new Set(cart.map(c => c.id));
  const recommendedIds = new Set<string>();
  cart.forEach(c => {
    const menuItem = items.find(i => i.id === c.id);
    if (menuItem?.relatedItemIds) {
      menuItem.relatedItemIds.forEach(id => recommendedIds.add(id));
    }
  });
  const crossSellItems = items.filter(i => recommendedIds.has(i.id) && !cartItemIdsForCrossSell.has(i.id) && i.isAvailable);

  const checkout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    
    const orderNumber = Math.floor(1000 + Math.random() * 9000).toString();
    
    const newOrder: any = {
      orderNumber,
      branch: getCafeBranchName(),
      source: 'wallet_customer_app',
      customerType: customerId ? 'member' : 'guest',
      items: cart,
      total: totalAmount,
      notes,
      status: 'Pending',
      deliveryLocation,
      scheduledTime,
      earnsStamp: eligibleItemsInCart.length > 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (customerId) newOrder.customerId = customerId;
    if (cheapestItemPrice > 0) newOrder.discountAmount = cheapestItemPrice;
    if (freeItemId) newOrder.freeItemId = freeItemId;

    try {
      const docRef = await addDoc(collection(db, 'cafe_orders'), newOrder);
      const savedOrder = { ...newOrder, id: docRef.id } as CafeOrder;
      setActiveOrder(savedOrder);
      setCart([]);
      setNotes('');
      // Don't reset stamps immediately; wait for Barista to mark as 'Completed'
    } catch (e: any) {
      console.error('Checkout failed', e);
      alert(i.error + '\nDetails: ' + (e?.message || JSON.stringify(e)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Language toggle button component
  const LangToggle = () => (
    <button
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-pink-200 text-xs font-bold text-[#7d834e] hover:bg-pink-50 transition-all shadow-sm"
    >
      <Globe className="w-3.5 h-3.5" />
      {lang === 'ar' ? 'English' : 'عربي'}
    </button>
  );

  // ── Tracking Screen ──
  if (activeOrder) {
    return (
      <div className="min-h-screen flex flex-col items-center font-sans" dir={dir}
        style={{ background: 'linear-gradient(180deg, #fce4ec 0%, #fdf2f8 40%, #fff5f7 100%)' }}>
        <div className="w-full max-w-md mt-6 mx-4">
          {linkResolutionError && (
            <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">
              {linkResolutionError}
            </div>
          )}
          {/* Tracking Header */}
          <div className="flex justify-between items-center mb-4 px-2">
            <LangToggle />
          </div>
          <div className="bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-pink-100 overflow-hidden pb-8">
            <div className="p-6 text-center" style={{ background: 'linear-gradient(135deg, #7d834e 0%, #9aa365 100%)' }}>
              <h1 className="text-2xl font-serif font-bold text-white">{i.trackTitle}</h1>
              <p className="text-white/80 mt-1 text-sm">{i.orderNum} #{activeOrder.orderNumber}</p>
            </div>
            
            <div className="p-6 flex flex-col items-center">
              {activeOrder.status === 'Pending' && (
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-pulse"
                  style={{ background: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)' }}>
                  <Clock className="w-10 h-10 text-pink-400" />
                </div>
              )}
              {activeOrder.status === 'Preparing' && (
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-spin-slow"
                  style={{ background: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)' }}>
                  <Coffee className="w-10 h-10 text-[#7d834e]" />
                </div>
              )}
              {activeOrder.status === 'Ready' && (
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6 animate-bounce"
                  style={{ background: 'linear-gradient(135deg, #c8e6c9 0%, #a5d6a7 100%)' }}>
                  <CheckCircle2 className="w-12 h-12 text-[#7d834e]" />
                </div>
              )}
              
              <h2 className="text-xl font-bold text-[#5a5e32] mb-2">
                {activeOrder.status === 'Pending' && i.pending}
                {activeOrder.status === 'Preparing' && i.preparing}
                {activeOrder.status === 'Ready' && i.ready}
                {activeOrder.status === 'Completed' && i.completed}
                {activeOrder.status === 'Cancelled' && (lang === 'ar' ? 'نعتذر، تم إلغاء الطلب' : 'Sorry, order cancelled')}
              </h2>
              
              {activeOrder.status !== 'Ready' && activeOrder.status !== 'Completed' && activeOrder.status !== 'Cancelled' && (
                <div className="mt-4 p-4 bg-pink-50 border border-pink-100 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-pink-700 leading-relaxed font-medium">{i.stayMsg}</p>
                </div>
              )}

              {activeOrder.status === 'Ready' && (
                <div className="mt-4 p-4 bg-[#f0f3e6] border border-[#d4dab3] rounded-xl text-center">
                  <p className="text-[#5a5e32] font-bold mb-2">{i.goCounter}</p>
                  <p className="text-sm text-[#7d834e]">{i.payAtCounter}: {activeOrder.total.toFixed(3)} {i.currency}</p>
                </div>
              )}

              {(activeOrder.status === 'Completed' || activeOrder.status === 'Cancelled') && (
                <button 
                  onClick={() => setActiveOrder(null)}
                  className="mt-8 text-white px-6 py-3 rounded-xl font-bold w-full transition-all hover:shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #7d834e 0%, #9aa365 100%)' }}
                >
                  {i.newOrder}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Menu Screen ──
  return (
    <div className="min-h-screen pb-32 font-sans select-none" dir={dir}
      style={{ background: 'linear-gradient(180deg, #fce4ec 0%, #fdf2f8 30%, #fefefe 100%)' }}>
      {linkResolutionError && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl px-3 py-2">
            {linkResolutionError}
          </div>
        </div>
      )}
      
      {/* Luxurious Hero Section */}
      <div className="w-full h-64 md:h-80 relative overflow-hidden shadow-lg border-b-4 border-[#7d834e]">
        <img 
          src="/cafe-hero.png" 
          alt="Hayat Cafe" 
          className="w-full h-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex flex-col justify-between">
          <div className="flex justify-end p-4">
            <LangToggle />
          </div>
          <div className="p-6 md:p-8 max-w-2xl mx-auto w-full">
            <h1 className="text-3xl sm:text-4xl font-serif font-extrabold text-white drop-shadow-xl">{i.title}</h1>
            <p className="text-sm sm:text-base text-pink-100 mt-1 font-medium drop-shadow-lg tracking-wide">{i.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Loyalty Stamp Card */}
        {customer && (
          <div className="mb-6 bg-white/90 backdrop-blur rounded-2xl p-4 border border-pink-100 shadow-sm flex flex-col items-center">
            <h3 className="font-bold text-[#5a5e32] mb-3 text-sm">
              {lang === 'ar' ? 'بطاقة الولاء - اشتر 4 واحصل على الخامس مجاناً!' : 'Loyalty Card - Buy 4, get 5th Free!'}
            </h3>
            <div className="flex items-center gap-3">
              {[1, 2, 3, 4, 5].map((stamp) => {
                const currentStamps = customer.coffeeStamps || 0;
                // If they have 5 or more stamps, show 5 filled.
                const isEarned = stamp <= Math.min(currentStamps, 5); 
                const isFree = stamp === 5;
                
                return (
                  <div 
                    key={stamp} 
                    className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                      isEarned 
                        ? 'bg-[#7d834e] border-[#7d834e] text-white shadow-md' 
                        : 'bg-gray-50 border-gray-200 text-gray-300'
                    }`}
                  >
                    {isFree ? (
                      <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Coffee className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </div>
                );
              })}
            </div>
            {isEligibleForFreeDrink && (
              <p className="mt-3 text-xs font-bold text-pink-500 animate-bounce">
                {lang === 'ar' ? '🎉 مبروك! المشروب الخامس مجاني في هذا الطلب' : '🎉 Congrats! Your 5th drink is FREE in this order'}
              </p>
            )}
          </div>
        )}
        {/* Order History / Reorder Section */}
        {pastOrders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-pink-300 mb-3 flex items-center gap-2">
              <History className="w-4 h-4" /> {i.pastOrders}
            </h2>
            <div className="flex overflow-x-auto gap-3 pb-2 snap-x">
              {pastOrders.map(order => (
                <div key={order.id} className="min-w-[240px] bg-white/90 backdrop-blur border border-pink-100 p-3 rounded-2xl snap-start shrink-0 flex flex-col justify-between shadow-sm">
                  <div>
                    <p className="text-xs text-pink-300 mb-2">{new Date(order.createdAt).toLocaleDateString('ar-BH')}</p>
                    <ul className="text-sm text-[#5a5e32] font-medium leading-relaxed mb-3">
                      {order.items.map((itm, idx) => (
                        <li key={idx}>- {itm.quantity}x {itm.name}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-3 border-t border-pink-50">
                    <span className="font-bold text-[#7d834e]">{order.total.toFixed(3)} {i.currency}</span>
                    <button 
                      onClick={() => handleReorder(order)}
                      className="text-xs font-bold bg-pink-50 text-pink-500 px-3 py-1.5 rounded-lg hover:bg-pink-100 transition-colors"
                    >
                      {i.reorder}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        {categories.length > 0 && (
          <div className="sticky top-[73px] z-10 bg-[#fdf2f8]/90 backdrop-blur-md py-3 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 border-b border-pink-50 flex overflow-x-auto gap-2 no-scrollbar">
            <button
              onClick={() => setSelectedCategoryId('all')}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                selectedCategoryId === 'all' 
                  ? 'bg-[#7d834e] text-white shadow-md' 
                  : 'bg-white text-[#7d834e] border border-[#d4dab3] hover:bg-[#f0f3e6]'
              }`}
            >
              {lang === 'ar' ? 'الكل' : 'All'}
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id!)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  selectedCategoryId === cat.id 
                    ? 'bg-[#7d834e] text-white shadow-md' 
                    : 'bg-white text-[#7d834e] border border-[#d4dab3] hover:bg-[#f0f3e6]'
                }`}
              >
                {cat.name[lang]}
              </button>
            ))}
          </div>
        )}

        {/* Menu */}
        <div className="space-y-8">
          {categories
            .filter(cat => selectedCategoryId === 'all' || selectedCategoryId === cat.id)
            .map((category) => {
              const categoryItems = items.filter(item => item.categoryId === category.id && item.isAvailable);
              if (categoryItems.length === 0) return null;
              
              return (
                <div key={category.id} className="animate-fade-in">
                  <h2 className="text-lg font-bold text-[#5a5e32] mb-4 pb-2 flex items-center gap-2"
                    style={{ borderBottom: '2px solid #f8bbd0' }}>
                    <Coffee className="w-4 h-4 text-pink-300" />
                    {category.name[lang]}
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {categoryItems.map(item => {
                      const inCart = cart.find(i => i.id === item.id);
                      return (
                        <div key={item.id} className="bg-white/90 backdrop-blur rounded-2xl border border-pink-50 shadow-sm flex overflow-hidden hover:border-pink-200 hover:shadow-md transition-all h-28">
                          {item.imageUrl && (
                            <div className="w-28 shrink-0 bg-gray-100 relative">
                              <img src={item.imageUrl} alt={item.name[lang]} className="w-full h-full object-cover" />
                            </div>
                          )}
                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <div>
                              <h3 className="font-bold text-[#5a5e32] text-sm leading-tight line-clamp-2">{item.name[lang]}</h3>
                              <p className="text-[#7d834e] font-bold text-xs mt-1">{item.price.toFixed(3)} {i.currency}</p>
                            </div>
                            
                            <div className="flex justify-end">
                              {inCart ? (
                                <div className="flex items-center gap-2.5 bg-pink-50 rounded-xl p-1 border border-pink-100">
                                  <button onClick={() => removeFromCart(item.id!)} className="w-7 h-7 flex items-center justify-center bg-white rounded-lg text-pink-500 shadow-sm">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <span className="font-bold text-sm w-4 text-center text-[#5a5e32]">{inCart.quantity}</span>
                                  <button onClick={() => addToCart({ id: item.id!, name: item.name, price: item.price })} className="w-7 h-7 flex items-center justify-center text-white rounded-lg shadow-sm"
                                    style={{ background: '#7d834e' }}>
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => addToCart({ id: item.id!, name: item.name, price: item.price })}
                                  className="w-8 h-8 flex items-center justify-center bg-pink-50 hover:bg-[#7d834e] hover:text-white text-pink-400 rounded-lg transition-all"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
          })}
        </div>
      </div>

      {/* Floating Cart Panel */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-pink-100 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] p-4 sm:p-6 z-50 animate-slide-up rounded-t-3xl">
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            
            {/* Cross-Selling Bar */}
            {crossSellItems.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-bold text-pink-400 mb-2">{lang === 'ar' ? 'غالباً ما يُطلب مع:' : 'Frequently bought together:'}</p>
                <div className="flex overflow-x-auto gap-2 pb-2 no-scrollbar">
                  {crossSellItems.map(item => (
                    <div key={item.id} className="flex items-center gap-2 bg-pink-50/50 border border-pink-100 px-3 py-1.5 rounded-xl shrink-0">
                      <span className="text-xs font-bold text-[#5a5e32]">{item.name[lang]}</span>
                      <span className="text-xs text-[#7d834e]">{item.price.toFixed(3)}</span>
                      <button 
                        onClick={() => addToCart({ id: item.id!, name: item.name, price: item.price })}
                        className="w-5 h-5 flex items-center justify-center bg-[#7d834e] text-white rounded-md ml-1"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #f48fb1 0%, #f06292 100%)' }}>
                  {cart.reduce((s, itm) => s + itm.quantity, 0)}
                </div>
                <div>
                  <p className="text-xs text-pink-300">
                    {i.total} 
                    {cheapestItemPrice > 0 && <span className="text-[#7d834e] ml-1">({lang === 'ar' ? 'يوجد خصم' : 'Discount applied'})</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-lg font-bold text-[#5a5e32]">{totalAmount.toFixed(3)} {i.currency}</p>
                    {cheapestItemPrice > 0 && (
                      <p className="text-xs line-through text-gray-400">{subtotalAmount.toFixed(3)}</p>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={checkout}
                disabled={isSubmitting}
                className="text-white px-8 py-3.5 rounded-xl font-bold flex items-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #7d834e 0%, #9aa365 100%)' }}
              >
                {isSubmitting ? i.sending : i.sendOrder} 
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            
            <div className="border-t border-pink-50 pt-3 flex flex-col gap-3">
              <div className="flex gap-3">
                <select 
                  value={deliveryLocation}
                  onChange={(e) => setDeliveryLocation(e.target.value)}
                  className="flex-1 bg-pink-50/50 border border-pink-100 text-sm px-4 py-2.5 rounded-xl focus:outline-none focus:border-[#7d834e] text-[#5a5e32] font-medium"
                >
                  <option value="Pick-up">{lang === 'ar' ? 'استلام من الكاونتر' : 'Pick-up'}</option>
                  <option value="Waiting Area">{lang === 'ar' ? 'منطقة الانتظار' : 'Waiting Area'}</option>
                  <option value="Hair Section">{lang === 'ar' ? 'قسم الشعر' : 'Hair Section'}</option>
                  <option value="Nail Section">{lang === 'ar' ? 'قسم الأظافر' : 'Nail Section'}</option>
                </select>
                <select 
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="flex-1 bg-pink-50/50 border border-pink-100 text-sm px-4 py-2.5 rounded-xl focus:outline-none focus:border-[#7d834e] text-[#5a5e32] font-medium"
                >
                  <option value="Now">{lang === 'ar' ? 'التحضير الآن' : 'Prepare Now'}</option>
                  <option value="After 15 mins">{lang === 'ar' ? 'بعد 15 دقيقة' : 'After 15 mins'}</option>
                  <option value="After 30 mins">{lang === 'ar' ? 'بعد 30 دقيقة' : 'After 30 mins'}</option>
                </select>
              </div>
              <input 
                type="text" 
                placeholder={i.notesPlaceholder}
                className="w-full bg-pink-50/50 border border-pink-100 text-sm px-4 py-3 rounded-xl focus:outline-none focus:border-[#7d834e] transition-all placeholder:text-pink-300"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
