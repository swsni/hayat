import React, { useState } from 'react';
import { useCurrency } from '../LanguageContext';
import { PaymentMethod, PaymentSplit, SuspendedOrder } from '../types';
import { X, Plus, Minus, ShoppingBag, Coffee, Beaker, CupSoda, CheckCircle, PauseCircle, List, User, Edit3 } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, query, getDocs, deleteDoc, doc } from 'firebase/firestore';
import SplitPaymentModal from './SplitPaymentModal';
import { getCafeBranchName } from '../utils/cafeBranch';
import { isQatarBranch } from '../utils/branchHelpers';

type Props = {
  onClose: () => void;
  language: 'ar' | 'en';
  onCheckout: (cart: any[], total: number, paymentMethod: PaymentMethod, payments?: PaymentSplit[], discountAmount?: number) => void;
  staffId?: string;
  branch?: string;
};

type Category = 'Coffee' | 'Traditional' | 'Mojito';

const MENU = {
  Coffee: [
    { id: 'esp', name: { en: 'Espresso', ar: 'إسبريسو' }, price: 1.300 },
    { id: 'cap', name: { en: 'Cappuccino', ar: 'كابتشينو' }, price: 1.700 },
    { id: 'ame', name: { en: 'Americano', ar: 'أمريكانو' }, price: 1.500 },
    { id: 'moc', name: { en: 'Mocha', ar: 'موكا' }, price: 2.200 },
    { id: 'car', name: { en: 'Caramel Macchiato', ar: 'كراميل ميكياتو' }, price: 1.900 },
    { id: 'lat', name: { en: 'Latte', ar: 'لاتيه' }, price: 1.700 },
    { id: 'spa', name: { en: 'Spanish Latte', ar: 'سبانيش لاتيه' }, price: 1.800 },
    { id: 'fla', name: { en: 'Flat White', ar: 'فلات وايت' }, price: 1.700 },
    { id: 'v60', name: { en: 'V60', ar: 'في 60' }, price: 2.200 },
  ],
  Traditional: [
    { id: 'tur', name: { en: 'Turkish Coffee', ar: 'قهوة تركية' }, price: 0.660 },
    { id: 'fre', name: { en: 'French Coffee', ar: 'قهوة فرنسية' }, price: 0.660 },
    { id: 'red', name: { en: 'Red Tea', ar: 'شاي أحمر' }, price: 0.330 },
    { id: 'gre', name: { en: 'Green Tea', ar: 'شاي أخضر' }, price: 0.330 },
    { id: 'kar', name: { en: 'Karkadeh', ar: 'كركديه' }, price: 1.100 },
  ],
  MojitoBases: [
    { id: 'm-7up', name: { en: '7UP', ar: 'سفن أب' }, price: 1.800 },
    { id: 'm-rb', name: { en: 'Red Bull', ar: 'ريد بول' }, price: 2.500 },
  ],
  MojitoFlavors: [
    { id: 'f-blz', name: { en: 'Blue Zesty Orange', ar: 'برتقال بلو زيستي' } },
    { id: 'f-blb', name: { en: 'Blueberry', ar: 'توت أزرق' } },
    { id: 'f-str', name: { en: 'Strawberry', ar: 'فراولة' } },
    { id: 'f-wat', name: { en: 'Watermelon', ar: 'بطيخ' } },
    { id: 'f-pas', name: { en: 'Passion Fruit', ar: 'باشن فروت' } },
  ]
};

export default function CafeBaristaManualPOS({ onClose, language, onCheckout, staffId = 'barista', branch = getCafeBranchName() }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>('Coffee');
  const [cart, setCart] = useState<Array<{ id: string, name: string, price: number, quantity: number }>>([]);
  const [isEmployeeDiscount, setIsEmployeeDiscount] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  
  const currency = useCurrency();
  const isQatar = isQatarBranch(branch || '');
  
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod | null>(null);
  
  // Split & Suspended State
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [suspendedOrders, setSuspendedOrders] = useState<SuspendedOrder[]>([]);
  const [showSuspendedPanel, setShowSuspendedPanel] = useState(false);
  const [customerIdentifier, setCustomerIdentifier] = useState('');

  // Custom Item Modal State
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Mojito state
  const [mojitoBase, setMojitoBase] = useState<{ id: string, name: string, price: number } | null>(null);

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const addToCart = (id: string, name: string, price: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === id);
      if (existing) {
        return prev.map(c => c.id === id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { id, name, price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id === id) return { ...c, quantity: c.quantity + delta };
      return c;
    }).filter(c => c.quantity > 0));
  };

  const handleAddMojito = (flavor: { id: string, name: { en: string, ar: string } }) => {
    if (!mojitoBase) return;
    const finalId = `${mojitoBase.id}-${flavor.id}`;
    const finalName = `Mojito - ${mojitoBase.name} (${flavor.name[language]})`;
    addToCart(finalId, finalName, mojitoBase.price);
    setMojitoBase(null); // reset base after adding
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName || !customPrice || isNaN(Number(customPrice))) return;
    addToCart(`custom-${Date.now()}`, customName, Number(customPrice));
    setCustomName('');
    setCustomPrice('');
    setShowCustomModal(false);
  };

  const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const discountAmount = isEmployeeDiscount ? subtotal * 0.30 : 0;
  const total = subtotal - discountAmount;

  const loadSuspendedOrders = async () => {
    try {
      const q = query(collection(db, 'suspended_orders'));
      const snap = await getDocs(q);
      setSuspendedOrders(snap.docs.map(d => ({ id: d.id, ...d.data() } as SuspendedOrder)));
    } catch (e) {
      console.error(e);
    }
  };

  const handleParkSale = async () => {
    if (cart.length === 0) return;
    try {
      const parkName = customerIdentifier.trim() || `Walk-in ${new Date().toLocaleTimeString()}`;
      await addDoc(collection(db, 'suspended_orders'), {
        staffId,
        branch,
        customerName: parkName,
        cart,
        total,
        savedAt: new Date().toISOString()
      });
      setCart([]);
      setSelectedPayment(null);
      setCustomerIdentifier('');
      setShowSuspendedPanel(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRecallOrder = async (order: SuspendedOrder) => {
    setCart(order.cart);
    if (order.id) {
      await deleteDoc(doc(db, 'suspended_orders', order.id));
    }
    setShowSuspendedPanel(false);
  };

  const handleCheckout = () => {
    if (cart.length === 0 || !selectedPayment) return;
    if (selectedPayment === 'Split') {
      setShowSplitModal(true);
      return;
    }
    onCheckout(cart, total, selectedPayment, undefined, discountAmount);
  };

  const handleSplitConfirm = (split: { cash: number; benefit: number; card: number }) => {
    setShowSplitModal(false);
    const payments: PaymentSplit[] = [];
    if (split.cash > 0) payments.push({ method: 'Cash', amount: split.cash });
    if (split.benefit > 0) payments.push({ method: 'BenefitPay', amount: split.benefit });
    if (split.card > 0) payments.push({ method: 'Card', amount: split.card });
    
    onCheckout(cart, total, 'Split', payments, discountAmount);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in" dir={dir}>
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-2xl shadow-2xl flex overflow-hidden flex-col md:flex-row">
        
        {/* Left: Menu & Categories */}
        <div className="flex-1 flex flex-col bg-gray-50 border-r border-gray-200 relative">
          {showSuspendedPanel && (
            <div className="absolute inset-0 bg-white z-20 flex flex-col animate-fade-in">
              <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <List className="w-6 h-6 text-orange-500" />
                  {language === 'ar' ? 'الطلبات المعلقة' : 'Suspended Orders'}
                </h2>
                <button onClick={() => setShowSuspendedPanel(false)} className="p-2 hover:bg-gray-200 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {suspendedOrders.length === 0 ? (
                  <div className="text-center text-gray-400 py-10 font-bold">{language === 'ar' ? 'لا توجد طلبات معلقة' : 'No suspended orders'}</div>
                ) : (
                  suspendedOrders.map(order => (
                    <div key={order.id} className="bg-orange-50 border border-orange-200 p-4 rounded-xl flex justify-between items-center">
                      <div>
                        <div className="font-bold text-orange-800 text-lg flex items-center gap-2">
                          <User className="w-4 h-4" /> {order.customerName}
                        </div>
                        <div className="text-sm text-orange-600 mt-1">
                          {new Date(order.savedAt).toLocaleTimeString()} - {order.cart.length} {language === 'ar' ? 'عناصر' : 'items'}
                        </div>
                        <div className="font-black text-orange-900 mt-1">{order.total.toFixed(3)} {currency}</div>
                      </div>
                      <button 
                        onClick={() => handleRecallOrder(order)}
                        className="bg-orange-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-orange-600"
                      >
                        {language === 'ar' ? 'استدعاء' : 'Recall'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <Coffee className="w-6 h-6 text-[#7d834e]" />
              {language === 'ar' ? 'طلب جديد (يدوي)' : 'New Order (Manual)'}
            </h2>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowCustomModal(true)} 
                className="bg-[#7d834e] text-white px-3 py-1.5 rounded-lg font-bold text-sm hover:bg-[#6c7143] transition-colors flex items-center gap-1 min-h-[44px]"
              >
                <Edit3 className="w-5 h-5" />
                <span className="hidden sm:inline">{language === 'ar' ? 'منتج مخصص' : 'Custom'}</span>
              </button>
              <button 
                onClick={() => {
                  loadSuspendedOrders();
                  setShowSuspendedPanel(true);
                }} 
                className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-bold text-sm hover:bg-orange-200 transition-colors flex items-center gap-1 min-h-[44px]"
              >
                <List className="w-5 h-5" />
                <span className="hidden sm:inline">{language === 'ar' ? 'الطلبات المعلقة' : 'Suspended'}</span>
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>
          
          <div className="flex gap-2 p-4 bg-white border-b border-gray-100 shrink-0">
            {[
              { id: 'Coffee', icon: Coffee, label: { ar: 'قهوة مختصة', en: 'Coffee' } },
              { id: 'Traditional', icon: Beaker, label: { ar: 'مشروبات تقليدية', en: 'Traditional & Tea' } },
              { id: 'Mojito', icon: CupSoda, label: { ar: 'موهيتو', en: 'Mojito' } }
            ].map(cat => (
              <button 
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id as Category);
                  setMojitoBase(null);
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all min-h-[64px] ${
                  activeCategory === cat.id 
                    ? 'bg-[#7d834e] text-white shadow-md scale-105' 
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <cat.icon className="w-6 h-6" />
                <span className="text-sm">{cat.label[language]}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {activeCategory === 'Coffee' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MENU.Coffee.map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => addToCart(item.id, item.name[language], item.price)}
                    className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-[#7d834e] hover:shadow-md transition-all text-left flex flex-col items-center justify-center text-center active:scale-95 min-h-[80px]"
                  >
                    <h3 className="font-bold text-gray-800 mb-2">{item.name[language]}</h3>
                    <div className="font-black text-[#5a5e32]">{item.price.toFixed(3)} {currency}</div>
                  </button>
                ))}
              </div>
            )}

            {activeCategory === 'Traditional' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {MENU.Traditional.map(item => (
                  <button 
                    key={item.id} 
                    onClick={() => addToCart(item.id, item.name[language], item.price)}
                    className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:border-[#7d834e] hover:shadow-md transition-all text-left flex flex-col items-center justify-center text-center active:scale-95 min-h-[80px]"
                  >
                    <h3 className="font-bold text-gray-800 mb-2">{item.name[language]}</h3>
                    <div className="font-black text-[#5a5e32]">{item.price.toFixed(3)} {currency}</div>
                  </button>
                ))}
              </div>
            )}

            {activeCategory === 'Mojito' && (
              <div className="animate-fade-in">
                {!mojitoBase ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800 text-center mb-4">
                      {language === 'ar' ? 'اختر المشروب الأساسي (Base)' : 'Select Mojito Base'}
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {MENU.MojitoBases.map(base => (
                        <button 
                          key={base.id}
                          onClick={() => setMojitoBase({ id: base.id, name: base.name[language], price: base.price })}
                          className="bg-white p-6 rounded-2xl border-2 border-gray-200 hover:border-[#7d834e] shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center active:scale-95 min-h-[100px]"
                        >
                          <CupSoda className="w-10 h-10 text-[#7d834e] mb-3" />
                          <span className="font-bold text-xl text-gray-800 mb-2">{base.name[language]}</span>
                          <span className="font-black text-lg text-[#5a5e32]">{base.price.toFixed(3)} {currency}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex justify-between items-center bg-[#7d834e]/10 p-4 rounded-xl border border-[#7d834e]/20 mb-4">
                      <span className="font-bold text-[#5a5e32]">
                        {language === 'ar' ? `الأساس: ${mojitoBase.name}` : `Base: ${mojitoBase.name}`}
                      </span>
                      <button 
                        onClick={() => setMojitoBase(null)}
                        className="text-sm font-bold text-gray-500 hover:text-gray-800 underline"
                      >
                        {language === 'ar' ? 'تغيير الأساس' : 'Change Base'}
                      </button>
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 text-center mb-4">
                      {language === 'ar' ? 'اختر النكهة (Flavor)' : 'Select Flavor'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {MENU.MojitoFlavors.map(flavor => (
                        <button 
                          key={flavor.id}
                          onClick={() => handleAddMojito(flavor)}
                          className="bg-white p-4 rounded-xl border border-gray-200 hover:border-[#7d834e] hover:bg-[#7d834e]/5 shadow-sm hover:shadow-md transition-all flex flex-col items-center text-center active:scale-95 min-h-[64px] justify-center"
                        >
                          <span className="font-bold text-gray-800">{flavor.name[language]}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart & Payment */}
        <div className="w-full md:w-[400px] bg-white flex flex-col">
          <div className="p-4 border-b border-gray-200 bg-gray-50/50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
              <ShoppingBag className="w-6 h-6 text-[#7d834e]" />
              {language === 'ar' ? 'الطلب الحالي' : 'Current Order'}
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                <ShoppingBag className="w-16 h-16 opacity-20" />
                <p>{language === 'ar' ? 'السلة فارغة' : 'Cart is empty'}</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex-1">
                    <p className="font-bold text-sm text-gray-800">{item.name}</p>
                    <p className="text-sm text-[#7d834e] font-black">{(item.price * item.quantity).toFixed(3)} {currency}</p>
                  </div>
                  <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm ml-2">
                    <button onClick={() => updateQty(item.id, -1)} className="text-gray-500 hover:text-red-500 active:scale-90 transition-transform bg-gray-50 p-2 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"><Minus className="w-5 h-5" /></button>
                    <span className="font-bold text-lg w-6 text-center select-none">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="text-gray-500 hover:text-green-500 active:scale-90 transition-transform bg-gray-50 p-2 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center"><Plus className="w-5 h-5" /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Payment Method & Checkout */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col gap-4">
            {cart.length > 0 && (
              <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-gray-200">
                <input 
                  type="text" 
                  placeholder={language === 'ar' ? 'اسم العميل (للتعليق)' : 'Customer Name (for Parking)'}
                  value={customerIdentifier}
                  onChange={e => setCustomerIdentifier(e.target.value)}
                  className="w-full bg-transparent border-none text-sm font-bold focus:ring-0 px-2"
                />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-gray-600 mb-2">
                {language === 'ar' ? 'طريقة الدفع' : 'Payment Method'}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {['Cash', 'BenefitPay', 'Card', 'Split'].map(pm => (
                  <button
                    key={pm}
                    onClick={() => setSelectedPayment(pm as PaymentMethod)}
                    className={`py-2 rounded-lg font-bold text-[10px] sm:text-xs flex flex-col items-center justify-center gap-1 transition-all border ${
                      selectedPayment === pm 
                        ? 'bg-[#7d834e] text-white border-[#7d834e] shadow-md scale-105' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {selectedPayment === pm && <CheckCircle className="w-3 h-3 mb-0.5" />}
                    <span className="truncate w-full px-1">
                      {pm === 'BenefitPay' ? (language === 'ar' ? (isQatar ? 'فورا' : 'بنفت بي') : (isQatar ? 'Fawra' : 'BenefitPay')) : pm === 'Cash' && language === 'ar' ? 'كاش' : pm === 'Card' && language === 'ar' ? 'بطاقة' : pm === 'Split' && language === 'ar' ? 'مجزأ' : pm}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Employee Discount Toggle */}
            <button
              type="button"
              onClick={() => setIsEmployeeDiscount(!isEmployeeDiscount)}
              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-between border cursor-pointer ${
                isEmployeeDiscount 
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' 
                  : 'bg-white text-gray-700 border-gray-300 hover:border-[#7d834e]'
              }`}
            >
              <span>{language === 'ar' ? '🏷️ خصم موظفين (30%)' : '🏷️ Staff Discount (30%)'}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-black ${isEmployeeDiscount ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {isEmployeeDiscount ? (language === 'ar' ? '✓ مفعّل' : '✓ Active') : (language === 'ar' ? 'إضافة' : 'Apply')}
              </span>
            </button>

            {isEmployeeDiscount && (
              <div className="space-y-1 text-xs bg-emerald-50/70 p-2.5 rounded-xl border border-emerald-100">
                <div className="flex justify-between text-gray-600 font-medium">
                  <span>{language === 'ar' ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                  <span className="font-mono">{subtotal.toFixed(3)} {currency}</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>{language === 'ar' ? 'خصم الموظفين (30%):' : 'Staff Discount (30%):'}</span>
                  <span className="font-mono">-{discountAmount.toFixed(3)} {currency}</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-gray-200">
              <span className="text-gray-500 font-bold">{language === 'ar' ? 'الإجمالي النهائي:' : 'Final Total:'}</span>
              <span className="text-2xl font-black text-[#5a5e32]">{total.toFixed(3)} {currency}</span>
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={handleParkSale}
                disabled={cart.length === 0}
                className="flex-[1] bg-orange-100 text-orange-700 font-bold py-4 rounded-xl hover:bg-orange-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all active:scale-[0.98] flex justify-center items-center gap-2 border border-orange-200"
              >
                <PauseCircle className="w-5 h-5" />
              </button>
              <button 
                onClick={handleCheckout}
                disabled={cart.length === 0 || !selectedPayment}
                className="flex-[4] bg-[#5a5e32] text-white font-bold py-4 rounded-xl hover:bg-[#4a4e28] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all active:scale-[0.98] flex justify-center items-center gap-2"
              >
                <ShoppingBag className="w-5 h-5" />
                {selectedPayment === 'Split' 
                  ? (language === 'ar' ? 'متابعة للدفع المجزأ' : 'Proceed to Split')
                  : (language === 'ar' ? 'تأكيد وإتمام الطلب' : 'Complete Order')
                }
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Custom Item Modal Overlay (Pop-up inside POS) */}
      {showCustomModal && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
          <form onSubmit={handleAddCustomItem} className="bg-white p-6 rounded-2xl shadow-2xl w-[90%] max-w-sm animate-fade-in">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-xl font-bold text-gray-800">{language === 'ar' ? 'إضافة منتج مخصص' : 'Add Custom Item'}</h3>
              <button type="button" onClick={() => setShowCustomModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{language === 'ar' ? 'اسم المنتج' : 'Item Name'}</label>
                <input 
                  type="text" 
                  required
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full p-4 text-lg bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7d834e] outline-none min-h-[52px]"
                  placeholder={language === 'ar' ? 'مثال: كيكة شوكولاتة' : 'e.g., Chocolate Cake'}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">{language === 'ar' ? 'السعر (BD)' : 'Price (BD)'}</label>
                <input 
                  type="number" 
                  step="0.100"
                  required
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-full p-4 text-lg bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#7d834e] outline-none min-h-[52px] text-left"
                  dir="ltr"
                  placeholder="0.000"
                />
              </div>
            </div>
            
            <button 
              type="submit"
              className="w-full mt-6 bg-[#7d834e] text-white font-bold text-lg py-4 rounded-xl hover:bg-[#6c7143] shadow-md active:scale-95 transition-all min-h-[52px]"
            >
              {language === 'ar' ? 'إضافة للطلب' : 'Add to Order'}
            </button>
          </form>
        </div>
      )}

      {/* Split Payment Modal */}
      {showSplitModal && (
        <SplitPaymentModal 
          total={total}
          language={language}
          onConfirm={handleSplitConfirm}
          onCancel={() => setShowSplitModal(false)}
        />
      )}
    </div>
  );
}
