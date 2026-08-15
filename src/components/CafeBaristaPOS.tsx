import React, { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { CafeCategory, CafeMenuItem } from '../types';
import { X, Plus, Minus, ShoppingBag, Edit3 } from 'lucide-react';

type Props = {
  onClose: () => void;
  language: 'ar' | 'en';
  onCheckout: (cart: any[], total: number, discountAmount?: number) => void;
};

const HARDCODED_CATEGORIES: any[] = [
  { id: 'mojito', name: 'Mojito', order: 1 },
  { id: 'coffee', name: 'Coffee & Tea', order: 2 },
];

const HARDCODED_ITEMS: any[] = [
  { id: 'h-m1', categoryId: 'mojito', name: '7UP', price: 1.800, isAvailable: true, order: 1 },
  { id: 'h-m2', categoryId: 'mojito', name: 'Red Bull', price: 2.500, isAvailable: true, order: 2 },
  { id: 'h-m3', categoryId: 'mojito', name: 'Blue Zesty Orange Mojito', price: 1.800, isAvailable: true, order: 3 },
  { id: 'h-m4', categoryId: 'mojito', name: 'Blueberry Mojito', price: 1.800, isAvailable: true, order: 4 },
  { id: 'h-m5', categoryId: 'mojito', name: 'Strawberry Mojito', price: 1.800, isAvailable: true, order: 5 },
  { id: 'h-m6', categoryId: 'mojito', name: 'Watermelon Mojito', price: 1.800, isAvailable: true, order: 6 },
  { id: 'h-m7', categoryId: 'mojito', name: 'Passion Fruit Mojito', price: 1.800, isAvailable: true, order: 7 },
  { id: 'h-m8', categoryId: 'mojito', name: 'Karkadeh', price: 1.100, isAvailable: true, order: 8 },

  { id: 'h-c1', categoryId: 'coffee', name: 'Turkish Coffee', price: 0.660, isAvailable: true, order: 1 },
  { id: 'h-c2', categoryId: 'coffee', name: 'French coffee', price: 0.660, isAvailable: true, order: 2 },
  { id: 'h-c3', categoryId: 'coffee', name: 'Red Tea', price: 0.330, isAvailable: true, order: 3 },
  { id: 'h-c4', categoryId: 'coffee', name: 'Green Tea', price: 0.330, isAvailable: true, order: 4 },
  { id: 'h-c5', categoryId: 'coffee', name: 'Espresso', price: 1.300, isAvailable: true, order: 5 },
  { id: 'h-c6', categoryId: 'coffee', name: 'Cappuccino', price: 1.700, isAvailable: true, order: 6 },
  { id: 'h-c7', categoryId: 'coffee', name: 'Americano', price: 1.500, isAvailable: true, order: 7 },
  { id: 'h-c8', categoryId: 'coffee', name: 'Mocha', price: 2.200, isAvailable: true, order: 8 },
  { id: 'h-c9', categoryId: 'coffee', name: 'Caramel Macchiato', price: 1.900, isAvailable: true, order: 9 },
  { id: 'h-c10', categoryId: 'coffee', name: 'Latte', price: 1.700, isAvailable: true, order: 10 },
  { id: 'h-c11', categoryId: 'coffee', name: 'Spanish Latte', price: 1.800, isAvailable: true, order: 11 },
  { id: 'h-c12', categoryId: 'coffee', name: 'Flat White', price: 1.700, isAvailable: true, order: 12 },
  { id: 'h-c13', categoryId: 'coffee', name: 'V60', price: 2.200, isAvailable: true, order: 13 },
];

export default function CafeBaristaPOS({ onClose, language, onCheckout }: Props) {
  const [categories, setCategories] = useState<any[]>(HARDCODED_CATEGORIES);
  const [items, setItems] = useState<any[]>(HARDCODED_ITEMS);
  const [cart, setCart] = useState<Array<{ id: string, name: string, price: number, quantity: number }>>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isEmployeeDiscount, setIsEmployeeDiscount] = useState(false);
  
  // Custom Item Modal State
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const dir = language === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    const unsubCats = onSnapshot(collection(db, 'cafe_categories'), (snap) => {
      if (!snap.empty) {
        const cats: any[] = [];
        snap.forEach(d => cats.push({ id: d.id, ...d.data() }));
        setCategories(cats.sort((a, b) => a.order - b.order));
      }
    });

    const unsubItems = onSnapshot(collection(db, 'cafe_items'), (snap) => {
      if (!snap.empty) {
        const itms: any[] = [];
        snap.forEach(d => itms.push({ id: d.id, ...d.data() }));
        setItems(itms.sort((a, b) => a.order - b.order));
      }
    });

    return () => { unsubCats(); unsubItems(); };
  }, []);

  const filteredItems = activeCategory === 'all' 
    ? items.filter(i => i.isAvailable !== false) 
    : items.filter(i => i.categoryId === activeCategory && i.isAvailable !== false);

  const addToCart = (item: any) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { id: item.id!, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id === id) return { ...c, quantity: c.quantity + delta };
      return c;
    }).filter(c => c.quantity > 0));
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName || !customPrice || isNaN(Number(customPrice))) return;
    
    setCart(prev => [...prev, {
      id: `custom-${Date.now()}`,
      name: customName,
      price: Number(customPrice),
      quantity: 1
    }]);
    
    setCustomName('');
    setCustomPrice('');
    setShowCustomModal(false);
  };

  const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const discountAmount = isEmployeeDiscount ? subtotal * 0.30 : 0;
  const total = subtotal - discountAmount;

  const handleCheckout = () => {
    if (cart.length === 0) return;
    onCheckout(cart, total, discountAmount);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 lg:p-8 backdrop-blur-sm animate-fade-in" dir={dir}>
      <div className="bg-white w-full max-w-6xl h-full lg:h-[90vh] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Left: Menu */}
        <div className="flex-1 flex flex-col bg-gray-50 border-r border-gray-200">
          <div className="p-4 border-b border-gray-200 bg-white flex justify-between items-center min-h-[64px]">
            <h2 className="text-xl lg:text-2xl font-bold text-gray-800">{language === 'ar' ? 'نظام نقاط البيع' : 'POS System'}</h2>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowCustomModal(true)} 
                className="flex items-center gap-2 px-4 py-2 bg-[#7d834e] text-white rounded-lg font-bold hover:bg-[#6c7143] transition-colors min-h-[44px]"
              >
                <Edit3 className="w-5 h-5" />
                {language === 'ar' ? 'منتج مخصص' : 'Custom Item'}
              </button>
              <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center">
                <X className="w-7 h-7" />
              </button>
            </div>
          </div>
          
          <div className="flex overflow-x-auto gap-3 p-4 bg-white border-b border-gray-100 shrink-0 no-scrollbar items-center">
            <button 
              onClick={() => setActiveCategory('all')}
              className={`px-5 py-3 rounded-xl whitespace-nowrap font-bold text-lg transition-colors min-h-[44px] ${activeCategory === 'all' ? 'bg-[#7d834e] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {language === 'ar' ? 'الكل' : 'All'}
            </button>
            {categories.map(c => (
              <button 
                key={c.id}
                onClick={() => setActiveCategory(c.id!)}
                className={`px-5 py-3 rounded-xl whitespace-nowrap font-bold text-lg transition-colors min-h-[44px] ${activeCategory === c.id ? 'bg-[#7d834e] text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 lg:p-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map(item => (
                <button 
                  key={item.id} 
                  onClick={() => addToCart(item)}
                  className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-[#7d834e] hover:shadow-md transition-all text-left flex flex-col h-full min-h-[100px] active:scale-95"
                >
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-gray-800 leading-tight">{item.name}</h3>
                  </div>
                  <div className="mt-3 font-black text-xl text-[#7d834e]">{item.price.toFixed(3)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Cart */}
        <div className="w-full md:w-[400px] lg:w-[450px] bg-white flex flex-col border-t md:border-t-0 md:border-l border-gray-200 shrink-0">
          <div className="p-4 lg:p-5 border-b border-gray-200 bg-gray-50/50 min-h-[64px] flex items-center">
            <h3 className="font-bold text-lg lg:text-xl text-gray-800 flex items-center gap-2">
              <ShoppingBag className="w-6 h-6" />
              {language === 'ar' ? 'الطلب الحالي' : 'Current Order'}
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <ShoppingBag className="w-16 h-16 opacity-20" />
                <span className="text-lg font-bold">{language === 'ar' ? 'السلة فارغة' : 'Cart is empty'}</span>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex-1 pr-3">
                    <p className="font-bold text-lg text-gray-800">{item.name}</p>
                    <p className="text-sm text-[#7d834e] font-black">{(item.price * item.quantity).toFixed(3)}</p>
                  </div>
                  <div className="flex items-center gap-4 bg-white px-3 py-2 rounded-xl border border-gray-200 shadow-sm">
                    <button onClick={() => updateQty(item.id, -1)} className="text-gray-500 hover:text-red-500 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center bg-gray-50 rounded-lg active:bg-gray-100"><Minus className="w-5 h-5" /></button>
                    <span className="font-bold text-xl w-6 text-center">{item.quantity}</span>
                    <button onClick={() => updateQty(item.id, 1)} className="text-gray-500 hover:text-green-500 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center bg-gray-50 rounded-lg active:bg-gray-100"><Plus className="w-5 h-5" /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-5 lg:p-6 border-t border-gray-200 bg-gray-50 space-y-4">
            {/* Employee Discount Toggle */}
            <button
              type="button"
              onClick={() => setIsEmployeeDiscount(!isEmployeeDiscount)}
              className={`w-full py-3 px-4 rounded-xl text-sm font-bold transition-all flex items-center justify-between border cursor-pointer ${
                isEmployeeDiscount 
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm' 
                  : 'bg-white text-gray-700 border-gray-300 hover:border-[#7d834e]'
              }`}
            >
              <span>{language === 'ar' ? '🏷️ خصم موظفين (30%)' : '🏷️ Staff Discount (30%)'}</span>
              <span className={`text-xs px-2.5 py-1 rounded font-black ${isEmployeeDiscount ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {isEmployeeDiscount ? (language === 'ar' ? '✓ مفعّل' : '✓ Active') : (language === 'ar' ? 'إضافة' : 'Apply')}
              </span>
            </button>

            {isEmployeeDiscount && (
              <div className="space-y-1.5 text-sm bg-emerald-50/70 p-3 rounded-xl border border-emerald-100">
                <div className="flex justify-between text-gray-600 font-medium">
                  <span>{language === 'ar' ? 'المجموع الفرعي:' : 'Subtotal:'}</span>
                  <span className="font-mono">{subtotal.toFixed(3)} BD</span>
                </div>
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>{language === 'ar' ? 'خصم الموظفين (30%):' : 'Staff Discount (30%):'}</span>
                  <span className="font-mono">-{discountAmount.toFixed(3)} BD</span>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-1">
              <span className="text-gray-500 font-bold text-lg">{language === 'ar' ? 'الإجمالي النهائي:' : 'Final Total:'}</span>
              <span className="text-4xl font-black text-[#5a5e32]">{total.toFixed(3)} BD</span>
            </div>
            
            <button 
              onClick={handleCheckout}
              disabled={cart.length === 0}
              className="w-full bg-[#7d834e] text-white font-black text-xl py-5 rounded-2xl hover:bg-[#6c7143] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95 transition-all min-h-[64px]"
            >
              {language === 'ar' ? 'متابعة الدفع' : 'Proceed to Payment'}
            </button>
          </div>
        </div>

        {/* Custom Item Modal Overlay (Pop-up inside POS) */}
        {showCustomModal && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm">
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

      </div>
    </div>
  );
}
