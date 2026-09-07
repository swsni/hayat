import React, { useState, useEffect } from 'react';
import { db, storage } from '../../firebase';
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, Timestamp, writeBatch, query, where } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ShoppingBag, ShoppingCart, Tag, Plus, Edit, Trash2, Printer, X, Upload, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '../../LanguageContext';
import { showToast } from '../../utils/toast';

interface Product {
  id?: string;
  name_ar: string;
  name_en: string;
  descriptionAr?: string;
  descriptionEn?: string;
  price: number;
  category: string;
  image?: string;
  imageUrl?: string;
  variations?: string[];
}

interface Order {
  id: string;
  date: string | Timestamp;
  customerName: string;
  customerPhone: string;
  totalAmount: number;
  status: string;
  items?: any[];
}

interface Coupon {
  id?: string;
  code: string;
  discount: number;
  type: 'PERCENTAGE' | 'FIXED';
  maxUses: number;
  expiryDate: string;
}

export default function EcommerceAdmin() {
  const { language } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<'products' | 'orders' | 'coupons'>('products');
  const [loading, setLoading] = useState(false);

  // States
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [selectedOrderItems, setSelectedOrderItems] = useState<Order | null>(null);

  // Forms
  const [variationsInput, setVariationsInput] = useState('');
  const [productForm, setProductForm] = useState<Product>({
    name_ar: '', name_en: '', descriptionAr: '', descriptionEn: '', price: 0, category: 'باقات', image: '', variations: []
  });
  const [couponForm, setCouponForm] = useState<Coupon>({
    code: '', discount: 0, type: 'PERCENTAGE', maxUses: 0, expiryDate: ''
  });

  
  const orderStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'READY', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const q = await getDocs(collection(db, 'products'));
      setProducts(q.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    } catch (e) {
      showToast('Error fetching products', 'error');
    }
    setLoading(false);
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      // ✅ التوافق مع مجلد ecommerce_orders الموجود في قاعدة البيانات لديك
      const q = await getDocs(collection(db, 'ecommerce_orders'));
      setOrders(q.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          date: data.created_at || data.date,
          customerName: data.customerName || 'عميل',
          customerPhone: data.customerPhone || data.customer_id || '',
          totalAmount: data.total_amount || data.totalAmount || 0,
          status: data.status || 'PENDING',
          items: data.items || []
        } as Order;
      }));
    } catch (e) {
      showToast('Error fetching orders', 'error');
    }
    setLoading(false);
  };

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const q = await getDocs(collection(db, 'coupons'));
      setCoupons(q.docs.map(doc => ({ id: doc.id, ...doc.data() } as Coupon)));
    } catch (e) {
      showToast('Error fetching coupons', 'error');
    }
    setLoading(false);
  };

  const [categories, setCategories] = useState<string[]>(['باقات', 'أعشاب', 'مكملات', 'معدات', 'صالون']);
  const [newCategory, setNewCategory] = useState('');

  const fetchCategories = async () => {
    try {
      const q = query(collection(db, 'categories'));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setCategories(snapshot.docs.map(d => (d.data() as any).name));
      }
    } catch (e) {
      console.error('Failed to fetch categories:', e);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategory.trim()) return;
    if (categories.includes(newCategory.trim())) {
      showToast('Category already exists', 'error');
      return;
    }
    
    try {
      await addDoc(collection(db, 'categories'), { name: newCategory.trim() });
      setCategories([...categories, newCategory.trim()]);
      setNewCategory('');
      showToast('Category added successfully', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error adding category', 'error');
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (!window.confirm(`Delete category "${catName}"?`)) return;
    try {
      const q = query(collection(db, 'categories'), where('name', '==', catName));
      const snapshot = await getDocs(q);
      snapshot.forEach(async (d) => {
        await deleteDoc(doc(db, 'categories', d.id));
      });
      setCategories(categories.filter(c => c !== catName));
      showToast('Category deleted', 'success');
    } catch (e) {
      showToast('Error deleting category', 'error');
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    if (activeSubTab === 'products') fetchProducts();
    if (activeSubTab === 'orders') fetchOrders();
    if (activeSubTab === 'coupons') fetchCoupons();
  }, [activeSubTab]);

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const varsArray = variationsInput.split(',').map(v => v.trim()).filter(Boolean);
      const productToSave = { ...productForm, variations: varsArray };
      if (editingProduct?.id) {
        await updateDoc(doc(db, 'products', editingProduct.id), productToSave);
        showToast('Product updated successfully', 'success');
      } else {
        await addDoc(collection(db, 'products'), productToSave);
        showToast('Product added successfully', 'success');
      }
      setIsProductModalOpen(false);
      fetchProducts();
    } catch (e) {
      showToast('Error saving product', 'error');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      showToast('Product deleted successfully', 'success');
      fetchProducts();
    } catch (e) {
      showToast('Error deleting product', 'error');
    }
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({ name_ar: '', name_en: '', descriptionAr: '', descriptionEn: '', price: 0, category: 'باقات', image: '', variations: [] });
    setVariationsInput('');
    setIsProductModalOpen(true);
  };

  const [uploadingImage, setUploadingImage] = useState(false);

  const openEditProduct = (product: Product) => {
    setEditingProduct(product);
    setProductForm(product);
    const varStrings = product.variations?.map((v: any) => typeof v === 'string' ? v : (v.label || '')) || [];
    setVariationsInput(varStrings.join(', '));
    setIsProductModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !storage) return;
    const file = e.target.files[0];
    setUploadingImage(true);
    try {
      const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      setProductForm(prev => ({ ...prev, image: downloadURL }));
      showToast('Image uploaded successfully', 'success');
    } catch (error) {
      console.error(error);
      showToast('Error uploading image', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  // ✅ ميزة إضافة المنتجات دفعة واحدة عبر ملف CSV / Text مبسط
  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n');
        const batch = writeBatch(db);
        let count = 0;

        // تخطي السطر الأول (Titles) والبدء من البيانات
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          // الأعمدة المفصولة بفاصلة (CSV): name_en, name_ar, price, category, image
          const cols = line.split(',').map(c => c.trim());
          if (cols.length >= 4) {
            const newDocRef = doc(collection(db, 'products'));
            batch.set(newDocRef, {
              name_en: cols[0] || 'Product',
              name_ar: cols[1] || 'منتج',
              price: parseFloat(cols[2]) || 0,
              category: cols[3] || 'باقات',
              image: cols[4] || '',
              variations: []
            });
            count++;
          }
        }

        if (count > 0) {
          await batch.commit();
          showToast(`Successfully imported ${count} products!`, 'success');
          fetchProducts();
        } else {
          showToast('No valid rows found in file', 'error');
        }
      } catch (err) {
        console.error(err);
        showToast('Error processing file', 'error');
      }
    };

    reader.readAsText(file);
  };

  const handleOrderStatusChange = async (orderId: string, status: string) => {
    try {
      await updateDoc(doc(db, 'ecommerce_orders', orderId), { status });
      showToast('Order status updated', 'success');
      fetchOrders();
    } catch (e) {
      showToast('Error updating order status', 'error');
    }
  };

  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'coupons'), couponForm);
      showToast('Coupon added successfully', 'success');
      setIsCouponModalOpen(false);
      fetchCoupons();
    } catch (e) {
      showToast('Error saving coupon', 'error');
    }
  };

  const handleDeleteCoupon = async (id: string) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;
    try {
      await deleteDoc(doc(db, 'coupons', id));
      showToast('Coupon deleted successfully', 'success');
      fetchCoupons();
    } catch (e) {
      showToast('Error deleting coupon', 'error');
    }
  };

  const formatDate = (dateValue: any) => {
    if (!dateValue) return '';
    if (typeof dateValue === 'string') return dateValue;
    if (dateValue.toDate) return dateValue.toDate().toLocaleDateString();
    return '';
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
      <div className="flex items-center gap-4 mb-6 border-b border-gray-100 pb-4">
        <button
          onClick={() => setActiveSubTab('products')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'products' ? 'bg-brand-olive text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-olive-light hover:text-olive-dark'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-4 h-4" />
            <span>{language === 'ar' ? 'المنتجات' : 'Products'}</span>
          </div>
        </button>

        <button
          onClick={() => setActiveSubTab('orders')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'orders' ? 'bg-brand-olive text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-olive-light hover:text-olive-dark'
          }`}
        >
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            <span>{language === 'ar' ? 'الطلبات' : 'Orders'}</span>
          </div>
        </button>

        <button
          onClick={() => setActiveSubTab('coupons')}
          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeSubTab === 'coupons' ? 'bg-brand-olive text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-olive-light hover:text-olive-dark'
          }`}
        >
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4" />
            <span>{language === 'ar' ? 'الكوبونات' : 'Coupons'}</span>
          </div>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="text-center py-4 text-gray-500">Loading...</div>}

        {activeSubTab === 'products' && (
          <div>
            <div className="flex flex-col gap-4 mb-6 border-b border-gray-100 pb-4">
              <div className="flex justify-between items-center">
                <label className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl font-bold cursor-pointer transition-colors border border-gray-200 text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-green-600" />
                  <span>{language === 'ar' ? 'استيراد منتجات (CSV)' : 'Import CSV'}</span>
                  <input type="file" accept=".csv, .txt" className="hidden" onChange={handleBulkUpload} />
                </label>
                <button onClick={openAddProduct} className="flex items-center gap-2 bg-brand-olive text-white px-4 py-2 rounded-xl font-bold hover:bg-olive-dark transition-colors">
                  <Plus className="w-4 h-4" /> {language === 'ar' ? 'إضافة منتج' : 'Add Product'}
                </button>
              </div>

              {/* Category Management */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-3">{language === 'ar' ? 'إدارة الفئات (Categories)' : 'Manage Categories'}</h3>
                <form onSubmit={handleAddCategory} className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder={language === 'ar' ? 'اسم الفئة الجديدة...' : 'New category name...'}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-brand-olive"
                  />
                  <button type="submit" className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-900 transition-colors">
                    {language === 'ar' ? 'إضافة فئة' : 'Add Category'}
                  </button>
                </form>
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <div key={cat} className="flex items-center gap-1 bg-white border border-gray-300 px-3 py-1 rounded-full text-sm">
                      <span>{cat}</span>
                      <button onClick={() => handleDeleteCategory(cat)} className="text-red-500 hover:text-red-700 p-0.5" title="Delete">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(p => (
                <div key={p.id} className="border border-gray-100 rounded-2xl p-4 shadow-sm relative">
                  <div className="flex justify-end absolute top-2 right-2 gap-2 bg-white/80 p-1 rounded-lg">
                    <button onClick={() => openEditProduct(p)} className="text-blue-500 hover:text-blue-700">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDeleteProduct(p.id!)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {p.image && <img src={p.image} alt={p.name_en} className="w-full h-40 object-cover rounded-xl mb-4" />}
                  <h3 className="font-bold text-lg mb-1">{language === 'ar' ? p.name_ar : p.name_en}</h3>
                  <p className="text-gray-500 text-sm mb-2">{p.category}</p>
                  <p className="font-bold text-brand-olive">{p.price} BHD</p>
                  {p.variations && p.variations.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded-lg">
                      {p.variations.map((v: any) => typeof v === 'string' ? v : (v.label || '')).join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'orders' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                  <th className="p-3 font-semibold">Order ID</th>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Customer</th>
                  <th className="p-3 font-semibold">Total Amount</th>
                  <th className="p-3 font-semibold">Status</th>
                  <th className="p-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="p-3 text-sm font-mono text-gray-600">{o.id}</td>
                    <td className="p-3 text-sm">{formatDate(o.date)}</td>
                    <td className="p-3 text-sm">
                      <div className="font-semibold">{o.customerName}</div>
                      <div className="text-gray-500 text-xs">{o.customerPhone}</div>
                    </td>
                    <td className="p-3 text-sm font-bold">{o.totalAmount} BHD</td>
                    <td className="p-3">
                      <select
                        value={o.status}
                        onChange={(e) => handleOrderStatusChange(o.id, e.target.value)}
                        className="bg-white border border-gray-200 text-sm rounded-lg px-2 py-1 outline-none focus:border-brand-olive font-medium"
                      >
                        {orderStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedOrderItems(o)} className="text-gray-600 hover:text-brand-olive flex items-center gap-1 text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors hover:border-brand-olive">
                          <ShoppingBag className="w-4 h-4" /> Items
                        </button>
                        <button onClick={() => window.print()} className="text-gray-600 hover:text-brand-olive flex items-center gap-1 text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg font-medium transition-colors hover:border-brand-olive">
                          <Printer className="w-4 h-4" /> Print
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && !loading && (
                  <tr><td colSpan={6} className="p-8 text-center text-gray-500">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeSubTab === 'coupons' && (
          <div>
            <div className="flex justify-end mb-4">
              <button onClick={() => setIsCouponModalOpen(true)} className="flex items-center gap-2 bg-brand-olive text-white px-4 py-2 rounded-xl font-bold hover:bg-olive-dark transition-colors">
                <Plus className="w-4 h-4" /> {language === 'ar' ? 'إضافة كوبون' : 'Add Coupon'}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {coupons.map(c => (
                <div key={c.id} className="border border-dashed border-brand-olive bg-olive-light/10 rounded-2xl p-4 shadow-sm relative">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-xl text-brand-olive uppercase tracking-wider">{c.code}</h3>
                    <button onClick={() => handleDeleteCoupon(c.id!)} className="text-red-500 hover:text-red-700 bg-white p-1 rounded-full shadow-sm">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-2xl font-black mb-2 text-gray-800">
                    {c.type === 'PERCENTAGE' ? `${c.discount}% OFF` : `${c.discount} BHD OFF`}
                  </div>
                  <div className="flex flex-col gap-1 mt-4 border-t border-brand-olive/20 pt-3">
                    <div className="flex justify-between text-sm text-gray-600">
                      <span className="font-semibold">Max uses:</span>
                      <span>{c.maxUses}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span className="font-semibold">Expires:</span>
                      <span>{c.expiryDate}</span>
                    </div>
                  </div>
                </div>
              ))}
              {coupons.length === 0 && !loading && (
                <div className="col-span-full py-8 text-center text-gray-500">No coupons found.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Product Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 relative">
            <button onClick={() => setIsProductModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold mb-6">{editingProduct ? 'Edit Product' : 'Add Product'}</h2>
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700">Title (EN)</label>
                  <input type="text" required value={productForm.name_en} onChange={e => setProductForm({...productForm, name_en: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700">Title (AR)</label>
                  <input type="text" required value={productForm.name_ar} onChange={e => setProductForm({...productForm, name_ar: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all text-right" dir="rtl" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700">Price (BHD)</label>
                  <input type="number" required min="0" step="0.001" value={productForm.price} onChange={e => setProductForm({...productForm, price: parseFloat(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700">Category</label>
                  <select value={productForm.category} onChange={e => setProductForm({...productForm, category: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all">
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700">Image</label>
                <div className="flex gap-2 items-center">
                  <input type="url" value={productForm.image} onChange={e => setProductForm({...productForm, image: e.target.value})} className="flex-1 border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" placeholder="https://... or upload" />
                  <label className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg cursor-pointer transition-colors border border-gray-300">
                    {uploadingImage ? <div className="w-5 h-5 border-2 border-gray-500 border-t-transparent rounded-full animate-spin"></div> : <Upload className="w-5 h-5" />}
                    <span>Upload</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700">Variations (comma separated)</label>
                <input type="text" value={variationsInput} onChange={e => setVariationsInput(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" placeholder="e.g. 100 جرام, 250 جرام" />
              </div>
              <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-6 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-brand-olive text-white font-bold hover:bg-olive-dark transition-colors shadow-md">{editingProduct ? 'Update Product' : 'Save Product'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Coupon Modal */}
      {isCouponModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 relative">
            <button onClick={() => setIsCouponModalOpen(false)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-2xl font-bold mb-6">Add Coupon</h2>
            <form onSubmit={handleSaveCoupon} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700">Code</label>
                <input type="text" required value={couponForm.code} onChange={e => setCouponForm({...couponForm, code: e.target.value.toUpperCase()})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all uppercase placeholder:normal-case" placeholder="e.g. SAVE10" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700">Discount Amount</label>
                  <input type="number" required min="0" step="0.001" value={couponForm.discount || ''} onChange={e => setCouponForm({...couponForm, discount: parseFloat(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1 text-gray-700">Type</label>
                  <select value={couponForm.type} onChange={e => setCouponForm({...couponForm, type: e.target.value as 'PERCENTAGE' | 'FIXED'})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all">
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700">Max Uses</label>
                <input type="number" required min="0" value={couponForm.maxUses || ''} onChange={e => setCouponForm({...couponForm, maxUses: parseInt(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1 text-gray-700">Expiry Date</label>
                <input type="date" required value={couponForm.expiryDate} onChange={e => setCouponForm({...couponForm, expiryDate: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive transition-all" />
              </div>
              <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
                <button type="button" onClick={() => setIsCouponModalOpen(false)} className="px-6 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2.5 rounded-xl bg-brand-olive text-white font-bold hover:bg-olive-dark transition-colors shadow-md">Save Coupon</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Order Items Modal */}
      {selectedOrderItems && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 relative max-h-[80vh] flex flex-col">
            <button onClick={() => setSelectedOrderItems(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold mb-6">Order Items: {selectedOrderItems.id}</h2>
            <div className="overflow-y-auto flex-1 pr-2">
              {selectedOrderItems.items && selectedOrderItems.items.length > 0 ? (
                <pre>{JSON.stringify(selectedOrderItems.items, null, 2)}</pre>
              ) : (
                <p className="text-gray-500 text-center py-8">No items found for this order.</p>
              )}
            </div>
            <div className="pt-4 mt-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setSelectedOrderItems(null)} className="px-6 py-2 rounded-xl bg-brand-olive text-white font-bold hover:bg-olive-dark transition-colors">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
