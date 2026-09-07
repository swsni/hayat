import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, Coffee, PlusCircle } from 'lucide-react';
import { useLanguage } from '../LanguageContext';
import { db, isFirebaseConfigured } from '../firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { showToast } from '../utils/toast';
import { getLocalisedCafeName } from '../utils/cafeMenu';

interface CoffeeSalesModalProps {
  onClose: () => void;
  onProceedToCheckout: (item: any) => void;
}

export default function CoffeeSalesModal({ onClose, onProceedToCheckout }: CoffeeSalesModalProps) {
  const { language, t } = useLanguage();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [quantity, setQuantity] = useState(1);
  const [flavor, setFlavor] = useState('');
  
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  
  const [dbCafeItems, setDbCafeItems] = useState<any[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  useEffect(() => {
    const fetchCustomItems = async () => {
      if (!isFirebaseConfigured || !db) {
        setDbCafeItems([]);
        return;
      }

      setIsLoadingItems(true);
      try {
        const primarySnap = await getDocs(collection(db, 'cafe_items'));
        let items = primarySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (items.length === 0) {
          const legacySnap = await getDocs(collection(db, 'cafeItems'));
          items = legacySnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        setDbCafeItems(items);
      } catch (err) {
        console.error('Error fetching cafe items:', err);
        try {
          const legacySnap = await getDocs(collection(db, 'cafeItems'));
          setDbCafeItems(legacySnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        } catch (legacyErr) {
          console.error('Error fetching legacy cafe items:', legacyErr);
          setDbCafeItems([]);
        }
      } finally {
        setIsLoadingItems(false);
      }
    };
    fetchCustomItems();
  }, []);

  const mojitoItems = [
    { id: 'm-1', name: t('cafe.item_7up'), price: 1.800, hasFlavors: true },
    { id: 'm-2', name: t('cafe.item_redbull'), price: 2.500, hasFlavors: true },
    { id: 'm-3', name: t('cafe.item_karkadeh'), price: 1.100, hasFlavors: false },
  ];

  const coffeeTeaItems = [
    { id: 'ct-1', name: t('cafe.item_turkish'), price: 0.660 },
    { id: 'ct-2', name: t('cafe.item_french'), price: 0.660 },
    { id: 'ct-3', name: t('cafe.item_red_tea'), price: 0.330 },
    { id: 'ct-4', name: t('cafe.item_green_tea'), price: 0.330 },
  ];

  const coffeeItems = [
    { id: 'c-1', name: t('cafe.item_espresso'), price: 1.300 },
    { id: 'c-2', name: t('cafe.item_cappuccino'), price: 1.700 },
    { id: 'c-3', name: t('cafe.item_americano'), price: 1.500 },
    { id: 'c-4', name: t('cafe.item_mocha'), price: 2.200 },
    { id: 'c-5', name: t('cafe.item_caramel_macchiato'), price: 1.900 },
    { id: 'c-6', name: t('cafe.item_latte'), price: 1.700 },
    { id: 'c-7', name: t('cafe.item_spanish_latte'), price: 1.800 },
    { id: 'c-8', name: t('cafe.item_flat_white'), price: 1.700 },
    { id: 'c-9', name: t('cafe.item_v60'), price: 2.200 },
  ];

  const flavors = [
    t('cafe.flavor_blue_zesty'),
    t('cafe.flavor_blueberry'),
    t('cafe.flavor_strawberry'),
    t('cafe.flavor_watermelon'),
    t('cafe.flavor_passion')
  ];

  const handleSelectItem = (item: any) => {
    setSelectedItem(item);
    setQuantity(1);
    setFlavor('');
    setIsCustomMode(false);
  };

  const handleCustomSubmit = async () => {
    if (!customName || !customPrice) {
      showToast('Please provide name and price', 'error');
      return;
    }
    const priceNum = parseFloat(customPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      showToast('Invalid price', 'error');
      return;
    }

    const newItem = {
      name: customName,
      price: priceNum,
      categoryId: 'custom',
      isAvailable: true,
      order: 0,
      createdAt: new Date().toISOString()
    };

    if (isFirebaseConfigured && db) {
      try {
        const docRef = await addDoc(collection(db, 'cafe_items'), newItem);
        const savedItem = { id: docRef.id, ...newItem };
        setDbCafeItems(prev => [...prev, savedItem]);
        handleSelectItem(savedItem);
        setCustomName('');
        setCustomPrice('');
        showToast('Custom item added!');
      } catch (err) {
        showToast('Error saving item', 'error');
      }
    } else {
      // Offline fallback
      const savedItem = { id: 'local-' + Date.now(), ...newItem };
      setDbCafeItems(prev => [...prev, savedItem]);
      handleSelectItem(savedItem);
      showToast('Custom item added locally!');
    }
  };

  const handleProceed = () => {
    if (!selectedItem) return;
    if (selectedItem.hasFlavors && !flavor) {
      showToast(language === 'ar' ? 'الرجاء اختيار نكهة' : 'Please select a flavor', 'error');
      return;
    }

    const displayName = getLocalisedCafeName(selectedItem.name, language as 'ar' | 'en');
    const finalName = flavor ? `${displayName} - ${flavor}` : displayName;
    const finalItem = {
      ...selectedItem,
      name: finalName,
      price: selectedItem.price * quantity, // Send total price
      originalPrice: selectedItem.price,
      quantity,
      flavor,
      isCafeItem: true // identifier for POS checkout
    };

    onProceedToCheckout(finalItem);
  };

  const renderItemGrid = (items: any[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {items.map(item => {
        const displayName = getLocalisedCafeName(item.name, language as 'ar' | 'en');
        return (
        <button
          key={item.id}
          onClick={() => handleSelectItem(item)}
          className={`p-3 rounded-lg border text-sm font-medium transition-colors text-start ${
            selectedItem?.id === item.id
              ? 'bg-brand-olive text-white border-brand-olive'
              : 'bg-white text-olive-dark border-olive-light hover:bg-olive-soft'
          }`}
        >
          <div className="line-clamp-2">{displayName}</div>
          <div className={`mt-1 font-mono text-xs ${selectedItem?.id === item.id ? 'text-olive-light' : 'text-gray-500'}`}>
            {parseFloat(item.price.toString()).toFixed(3)} {t('common.currency')}
          </div>
        </button>
      )})}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-olive-dark/45 backdrop-blur-sm">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden font-sans">
        
        {/* Header */}
        <div className="p-4 border-b border-olive-light flex justify-between items-center bg-olive-soft/30">
          <div className="flex items-center gap-2">
            <Coffee className="w-5 h-5 text-brand-olive" />
            <h3 className="font-serif font-bold text-lg text-olive-dark">{t('cafe.menu_title')}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-olive-soft text-gray-400 hover:text-olive-dark transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-50/50">
          
          {/* Custom DB Items (if any) */}
          {dbCafeItems.length > 0 && (
            <section>
              <h4 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3 border-b pb-1">
                {language === 'ar' ? 'أصناف مضافة' : 'Custom Items'}
              </h4>
              {renderItemGrid(dbCafeItems)}
            </section>
          )}

          {/* Mojito Menu */}
          <section>
            <h4 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3 border-b pb-1">{t('cafe.mojito_menu')}</h4>
            {renderItemGrid(mojitoItems)}
          </section>

          {/* Coffee & Tea Menu */}
          <section>
            <h4 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3 border-b pb-1">{t('cafe.coffee_tea')}</h4>
            {renderItemGrid(coffeeTeaItems)}
          </section>

          {/* Coffee Menu */}
          <section>
            <h4 className="text-xs uppercase tracking-wider font-bold text-gray-500 mb-3 border-b pb-1">{t('cafe.coffee_menu')}</h4>
            {renderItemGrid(coffeeItems)}
          </section>

          {/* Something Else */}
          <section>
            <button
              onClick={() => { setIsCustomMode(!isCustomMode); setSelectedItem(null); }}
              className="flex items-center gap-2 text-sm font-bold text-brand-olive hover:text-olive-dark uppercase tracking-wide transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              {t('cafe.something_else')}
            </button>

            {isCustomMode && (
              <div className="mt-4 p-4 rounded-xl border border-olive-light bg-white flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">{t('cafe.custom_name')}</label>
                  <input
                    type="text"
                    value={customName}
                    onChange={e => setCustomName(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:border-brand-olive outline-none"
                    placeholder="e.g. Special Drink"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">{t('cafe.custom_price')}</label>
                  <input
                    type="number"
                    value={customPrice}
                    onChange={e => setCustomPrice(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm font-mono focus:border-brand-olive outline-none"
                    placeholder="0.000"
                    step="0.100"
                  />
                </div>
                <button
                  onClick={handleCustomSubmit}
                  className="h-10 px-4 bg-brand-olive text-white text-sm font-bold rounded-lg hover:bg-olive-dark transition-colors"
                >
                  {t('cafe.add_custom')}
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Footer actions */}
        {selectedItem && (
          <div className="p-4 border-t border-olive-light bg-white flex flex-col gap-4">
            
            {/* Flavor selection for Mojitos */}
            {selectedItem.hasFlavors && (
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 mb-2">{t('cafe.choose_flavor')}</label>
                <div className="flex flex-wrap gap-2">
                  {flavors.map(f => (
                    <button
                      key={f}
                      onClick={() => setFlavor(f)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                        flavor === f 
                          ? 'bg-rose-100 text-rose-700 border-rose-200' 
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between mt-2">
              {/* Quantity */}
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase font-bold text-gray-500">{t('cafe.quantity')}</span>
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-8 h-8 rounded flex items-center justify-center bg-white shadow-sm text-gray-600 hover:text-brand-olive"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-10 text-center font-mono font-bold text-olive-dark">{quantity}</span>
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="w-8 h-8 rounded flex items-center justify-center bg-white shadow-sm text-gray-600 hover:text-brand-olive"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Proceed Button */}
              <button
                onClick={handleProceed}
                className="px-6 py-3 bg-olive-dark hover:bg-olive-dark-hover text-white text-sm font-bold uppercase tracking-wider rounded-xl transition-colors shadow-md flex items-center gap-2"
              >
                <span>{t('cafe.add_to_order')}</span>
                <span className="font-mono bg-white/20 px-2 py-0.5 rounded">
                  {(selectedItem.price * quantity).toFixed(3)} {t('common.currency')}
                </span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
