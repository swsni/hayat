import React, { useState } from 'react';
import { useCurrency } from '../LanguageContext';
import { CafeCategory, CafeMenuItem } from '../types';
import { useLanguage } from '../LanguageContext';
import { Plus, Edit3, Trash2, Image as ImageIcon, Check, X, GripVertical, AlertTriangle } from 'lucide-react';
import { db } from '../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { useAdminContext } from './admin/AdminContext';
import { CAFE_MENU } from '../utils/cafeMenu';
interface CafeMenuAdminProps {
  categories: CafeCategory[];
  items: CafeMenuItem[];
  triggerToast: (msg: string, type: 'success' | 'error') => void;
}

export default function CafeMenuAdmin({ categories, items, triggerToast }: CafeMenuAdminProps) {
  const { language } = useLanguage();
  const { setAdminConfirmModal } = useAdminContext();
  const currency = useCurrency();
  const dir = language === 'ar' ? 'rtl' : 'ltr';

  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');

  // Category State
  const [editingCategory, setEditingCategory] = useState<Partial<CafeCategory> | null>(null);
  
  // Item State
  const [editingItem, setEditingItem] = useState<Partial<CafeMenuItem> | null>(null);

  // Category Actions
  const handleSaveCategory = async () => {
    const catName = editingCategory?.name;
    const nameAr = typeof catName === 'object' ? catName?.ar : catName;
    const nameEn = typeof catName === 'object' ? catName?.en : catName;
    if (!nameAr) {
      triggerToast(language === 'ar' ? 'الرجاء إدخال اسم الفئة' : 'Please enter category name', 'error');
      return;
    }

    if (!db) {
      triggerToast(language === 'ar' ? 'لا يوجد اتصال بقاعدة البيانات' : 'Database is unavailable', 'error');
      return;
    }

    try {
      const saveName = nameAr || '';
      if (editingCategory.id) {
        await updateDoc(doc(db, 'cafe_categories', editingCategory.id), {
          name: saveName,
          order: editingCategory.order ?? categories.length
        });
        triggerToast(language === 'ar' ? 'تم تحديث الفئة' : 'Category updated', 'success');
      } else {
        await addDoc(collection(db, 'cafe_categories'), {
          name: saveName,
          order: categories.length
        });
        triggerToast(language === 'ar' ? 'تمت إضافة الفئة' : 'Category added', 'success');
      }
      setEditingCategory(null);
    } catch (e) {
      console.error('Error saving category:', e);
      triggerToast(language === 'ar' ? 'حدث خطأ' : 'An error occurred', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: id,
      targetName: '',
      confirmationPromptText: language === 'ar' ? 'هل أنت متأكد من حذف هذه الفئة؟ سيتم حذف جميع المنتجات التابعة لها.' : 'Are you sure? All items in this category will be deleted.',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'cafe_categories', id));
          const itemsToDelete = items.filter(item => item.categoryId === id);
          itemsToDelete.forEach(item => {
            batch.delete(doc(db, 'cafe_items', item.id!));
          });
          await batch.commit();
          triggerToast(language === 'ar' ? 'تم الحذف بنجاح' : 'Deleted successfully', 'success');
        } catch (e) {
          triggerToast(language === 'ar' ? 'حدث خطأ' : 'An error occurred', 'error');
        }
      }
    });
  };

  // Item Actions
  const handleSaveItem = async () => {
    const itemName = editingItem?.name;
    const itemNameStr = typeof itemName === 'object' ? (itemName?.ar || itemName?.en) : itemName;
    if (!itemNameStr || !editingItem?.categoryId || editingItem.price === undefined) {
      triggerToast(language === 'ar' ? 'الرجاء تعبئة جميع الحقول المطلوبة' : 'Please fill all required fields', 'error');
      return;
    }

    if (!db) {
      triggerToast(language === 'ar' ? 'لا يوجد اتصال بقاعدة البيانات' : 'Database is unavailable', 'error');
      return;
    }

    try {
      const saveItemName = itemNameStr || '';
      if (editingItem.id) {
        await updateDoc(doc(db, 'cafe_items', editingItem.id), {
          name: saveItemName,
          categoryId: editingItem.categoryId,
          price: Number(editingItem.price),
          imageUrl: editingItem.imageUrl || '',
          isAvailable: editingItem.isAvailable ?? true,
          order: editingItem.order ?? 0,
          relatedItemIds: editingItem.relatedItemIds || [],
          isStampEligible: editingItem.isStampEligible ?? false
        });
        triggerToast(language === 'ar' ? 'تم تحديث المنتج' : 'Item updated', 'success');
      } else {
        await addDoc(collection(db, 'cafe_items'), {
          name: saveItemName,
          categoryId: editingItem.categoryId,
          price: Number(editingItem.price),
          imageUrl: editingItem.imageUrl || '',
          isAvailable: editingItem.isAvailable ?? true,
          order: items.filter(i => i.categoryId === editingItem.categoryId).length,
          relatedItemIds: editingItem.relatedItemIds || [],
          isStampEligible: editingItem.isStampEligible ?? false
        });
        triggerToast(language === 'ar' ? 'تمت إضافة المنتج' : 'Item added', 'success');
      }
      setEditingItem(null);
    } catch (e) {
      console.error('Error saving item:', e);
      triggerToast(language === 'ar' ? 'حدث خطأ' : 'An error occurred', 'error');
    }
  };

  const handleDeleteItem = async (id: string) => {
    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: id,
      targetName: '',
      confirmationPromptText: language === 'ar' ? 'هل أنت متأكد من حذف هذا المنتج؟' : 'Are you sure you want to delete this item?',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'cafe_items', id));
          triggerToast(language === 'ar' ? 'تم الحذف بنجاح' : 'Deleted successfully', 'success');
        } catch (e) {
          triggerToast(language === 'ar' ? 'حدث خطأ' : 'An error occurred', 'error');
        }
      }
    });
  };

  const toggleAvailability = async (id: string, currentStatus: boolean) => {
    if (!db) {
      triggerToast(language === 'ar' ? 'لا يوجد اتصال بقاعدة البيانات' : 'Database is unavailable', 'error');
      return;
    }

    try {
      await updateDoc(doc(db, 'cafe_items', id), {
        isAvailable: !currentStatus
      });
      triggerToast(language === 'ar' ? 'تم تحديث حالة التوفر' : 'Availability updated', 'success');
    } catch (e) {
      triggerToast(language === 'ar' ? 'حدث خطأ' : 'An error occurred', 'error');
    }
  };

  const handleSeedMenu = async () => {
    setAdminConfirmModal({
      isOpen: true,
      actionType: 'custom-confirm',
      targetId: '',
      targetName: '',
      confirmationPromptText: language === 'ar' ? 'هل أنت متأكد من إضافة القائمة الافتراضية؟' : 'Are you sure you want to add the default menu?',
      onConfirm: async () => {
        if (!db) {
          triggerToast(language === 'ar' ? 'لا يوجد اتصال بقاعدة البيانات' : 'Database is unavailable', 'error');
          return;
        }

        try {
          const batch = writeBatch(db);
          const categoryRefs = CAFE_MENU.map(() => doc(collection(db, 'cafe_categories')));

          categoryRefs.forEach((catRef, index) => {
            batch.set(catRef, {
              name: { ar: CAFE_MENU[index].category.ar, en: CAFE_MENU[index].category.en },
              order: index
            });
          });

          CAFE_MENU.forEach((group, catIndex) => {
            const categoryId = categoryRefs[catIndex].id;
            group.items.forEach((item, itemIndex) => {
              const itemRef = doc(collection(db, 'cafe_items'));
              batch.set(itemRef, {
                categoryId,
                name: { ar: item.name.ar, en: item.name.en },
                price: item.price,
                imageUrl: '',
                isAvailable: true,
                order: itemIndex,
                relatedItemIds: [],
                isStampEligible: true
              });
            });
          });
          
          await batch.commit();
          triggerToast(language === 'ar' ? 'تمت الإضافة بنجاح' : 'Seeded successfully', 'success');
        } catch (err) {
          console.error('Seeding failed:', err);
          triggerToast(language === 'ar' ? 'حدث خطأ أثناء الإضافة' : 'Failed to seed menu', 'error');
        }
      }
    });
  };

  return (
    <div className="space-y-6 animate-fade-in" dir={dir}>
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('items')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'items' ? 'bg-brand-olive text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {language === 'ar' ? 'المنتجات' : 'Products'}
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'categories' ? 'bg-brand-olive text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {language === 'ar' ? 'الفئات' : 'Categories'}
          </button>
        </div>
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          {categories.length === 0 && items.length === 0 && (
            <button
              onClick={handleSeedMenu}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
            >
              {language === 'ar' ? 'إضافة القائمة الافتراضية' : 'Seed Default Menu'}
            </button>
          )}

          {activeTab === 'items' ? (
          <button
            onClick={() => setEditingItem({ name: '', price: 0, isAvailable: true, categoryId: categories[0]?.id || '', relatedItemIds: [], isStampEligible: false })}
            className="flex items-center gap-2 bg-brand-olive text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-olive-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> {language === 'ar' ? 'إضافة منتج' : 'Add Item'}
          </button>
        ) : (
          <button
            onClick={() => setEditingCategory({ name: '' })}
            className="flex items-center gap-2 bg-brand-olive text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-olive-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> {language === 'ar' ? 'إضافة فئة' : 'Add Category'}
          </button>
        )}
        </div>
      </div>

      {/* Categories View */}
      {activeTab === 'categories' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {categories.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              {language === 'ar' ? 'لا توجد فئات حالياً' : 'No categories found'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {categories.map((cat) => (
                <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-5 h-5 text-gray-300 cursor-move" />
                    <div>
                      <p className="font-bold text-olive-dark">{typeof cat.name === 'object' ? (language === 'ar' ? (cat.name as any).ar : (cat.name as any).en) : cat.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditingCategory(cat)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteCategory(cat.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Items View */}
      {activeTab === 'items' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.length === 0 && (
            <div className="col-span-full p-8 text-center bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500 flex flex-col items-center">
              <AlertTriangle className="w-12 h-12 text-yellow-400 mb-3" />
              <p className="font-bold">{language === 'ar' ? 'الرجاء إضافة فئة واحدة على الأقل أولاً' : 'Please add at least one category first'}</p>
            </div>
          )}
          {items.map((item) => {
            const cat = categories.find(c => c.id === item.categoryId);
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
                <div className="h-32 bg-gray-100 relative">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button onClick={() => setEditingItem(item)} className="p-1.5 bg-white text-blue-600 rounded-lg shadow-sm hover:bg-blue-50 transition-colors">
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteItem(item.id!)} className="p-1.5 bg-white text-red-600 rounded-lg shadow-sm hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="absolute top-2 left-2">
                    <button 
                      onClick={() => toggleAvailability(item.id!, item.isAvailable)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold shadow-sm backdrop-blur-sm ${item.isAvailable ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'}`}
                    >
                      {item.isAvailable ? (language === 'ar' ? 'متاح' : 'Available') : (language === 'ar' ? 'نفذت الكمية' : 'Out of Stock')}
                    </button>
                  </div>
                </div>
                <div className="p-4 grow flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-olive-dark">{typeof item.name === 'object' ? (language === 'ar' ? (item.name as any).ar : (item.name as any).en) : item.name}</h3>
                    </div>
                    <span className="font-bold text-brand-olive">{item.price.toFixed(3)} {currency}</span>
                  </div>
                  <div className="mt-auto pt-3 border-t border-gray-50">
                    <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">
                      {cat ? (typeof cat.name === 'object' ? (language === 'ar' ? (cat.name as any).ar : (cat.name as any).en) : cat.name) : 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 bg-black/60 z-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-olive-dark mb-4">
              {editingCategory.id ? (language === 'ar' ? 'تعديل الفئة' : 'Edit Category') : (language === 'ar' ? 'إضافة فئة جديدة' : 'Add New Category')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">{language === 'ar' ? 'الاسم' : 'Name'}</label>
                <input 
                  type="text" 
                  value={typeof editingCategory.name === 'object' ? ((editingCategory.name as any)?.ar || (editingCategory.name as any)?.en || '') : (editingCategory.name || '')}
                  onChange={(e) => setEditingCategory({...editingCategory, name: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-olive focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={handleSaveCategory} className="flex-1 bg-brand-olive text-white font-bold py-3 rounded-xl hover:bg-olive-dark transition-colors">
                {language === 'ar' ? 'حفظ' : 'Save'}
              </button>
              <button onClick={() => setEditingCategory(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors">
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/60 z-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-olive-dark mb-4">
              {editingItem.id ? (language === 'ar' ? 'تعديل المنتج' : 'Edit Item') : (language === 'ar' ? 'إضافة منتج جديد' : 'Add New Item')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">الفئة / Category</label>
                <select 
                  value={editingItem.categoryId || ''}
                  onChange={(e) => setEditingItem({...editingItem, categoryId: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-olive outline-none"
                >
                  <option value="" disabled>{language === 'ar' ? 'اختر الفئة' : 'Select Category'}</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{typeof cat.name === 'object' ? (language === 'ar' ? (cat.name as any).ar : (cat.name as any).en) : cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">{language === 'ar' ? 'الاسم' : 'Name'}</label>
                <input 
                  type="text" 
                  value={typeof editingItem.name === 'object' ? ((editingItem.name as any)?.ar || (editingItem.name as any)?.en || '') : (editingItem.name || '')}
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-olive outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">السعر ({currency})</label>
                <input 
                  type="number" 
                  step="0.100"
                  value={editingItem.price || ''}
                  onChange={(e) => setEditingItem({...editingItem, price: parseFloat(e.target.value)})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-olive outline-none text-left"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">رابط الصورة / Image URL (اختياري)</label>
                <input 
                  type="text" 
                  value={editingItem.imageUrl || ''}
                  onChange={(e) => setEditingItem({...editingItem, imageUrl: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-olive outline-none text-left text-xs"
                  dir="ltr"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  المنتجات المرتبطة / Related Items
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border border-gray-200 rounded-xl max-h-40 overflow-y-auto">
                  {items.filter(i => i.id !== editingItem.id).map(item => (
                    <label key={item.id} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-gray-200 text-sm cursor-pointer hover:bg-gray-50">
                      <input 
                        type="checkbox"
                        className="accent-brand-olive w-4 h-4"
                        checked={editingItem.relatedItemIds?.includes(item.id!) || false}
                        onChange={(e) => {
                          const current = editingItem.relatedItemIds || [];
                          const newIds = e.target.checked 
                            ? [...current, item.id!] 
                            : current.filter(id => id !== item.id);
                          setEditingItem({...editingItem, relatedItemIds: newIds});
                        }}
                      />
                      <span>{typeof item.name === 'object' ? (language === 'ar' ? (item.name as any).ar : (item.name as any).en) : item.name}</span>
                    </label>
                  ))}
                  {items.length <= 1 && (
                    <span className="text-gray-400 text-sm">
                      {language === 'ar' ? 'لا توجد منتجات أخرى' : 'No other items available'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <input 
                  type="checkbox"
                  id="stampToggle"
                  className="accent-brand-olive w-5 h-5"
                  checked={editingItem.isStampEligible || false}
                  onChange={(e) => setEditingItem({...editingItem, isStampEligible: e.target.checked})}
                />
                <label htmlFor="stampToggle" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                  مؤهل لختم الولاء / Eligible for Loyalty Stamps
                </label>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button onClick={handleSaveItem} className="flex-1 bg-brand-olive text-white font-bold py-3 rounded-xl hover:bg-olive-dark transition-colors">
                {language === 'ar' ? 'حفظ' : 'Save'}
              </button>
              <button onClick={() => setEditingItem(null)} className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors">
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
