import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Calendar } from 'lucide-react';
import { db } from '../../firebase';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useLanguage } from '../../LanguageContext';
import { useAdminContext } from './AdminContext';

export interface GymClass {
  id?: string;
  className: string;
  trainer: string;
  time: string;
  day: string;
  capacity?: number;
}

export default function GymScheduleAdmin() {
  const { language } = useLanguage();
  const { triggerToast, actionLoading, setActionLoading } = useAdminContext();
  const [classes, setClasses] = useState<GymClass[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<GymClass | null>(null);
  
  const [formData, setFormData] = useState<GymClass>({
    className: '',
    trainer: '',
    time: '',
    day: 'Sunday',
    capacity: 20
  });

  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const daysOfWeekAr = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  useEffect(() => {
    const q = query(collection(db, 'gym_schedule'), orderBy('day'));
    const unsub = onSnapshot(q, (snap) => {
      const cls: GymClass[] = [];
      snap.forEach(d => {
        cls.push({ id: d.id, ...d.data() } as GymClass);
      });
      setClasses(cls);
    });
    return () => unsub();
  }, []);

  const handleOpenModal = (cls?: GymClass) => {
    if (cls) {
      setEditingClass(cls);
      setFormData(cls);
    } else {
      setEditingClass(null);
      setFormData({
        className: '',
        trainer: '',
        time: '',
        day: 'Sunday',
        capacity: 20
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.className || !formData.time || !formData.trainer) return;
    
    setActionLoading(true);
    try {
      if (editingClass?.id) {
        await updateDoc(doc(db, 'gym_schedule', editingClass.id), { ...formData });
        triggerToast(language === 'ar' ? 'تم التحديث بنجاح' : 'Updated successfully', 'success');
      } else {
        await addDoc(collection(db, 'gym_schedule'), { ...formData });
        triggerToast(language === 'ar' ? 'تمت الإضافة بنجاح' : 'Added successfully', 'success');
      }
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
      triggerToast(language === 'ar' ? 'حدث خطأ' : 'Error occurred', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(language === 'ar' ? 'هل أنت متأكد من الحذف؟' : 'Are you sure you want to delete?')) return;
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'gym_schedule', id));
      triggerToast(language === 'ar' ? 'تم الحذف بنجاح' : 'Deleted successfully', 'success');
    } catch (err) {
      console.error(err);
      triggerToast(language === 'ar' ? 'حدث خطأ' : 'Error occurred', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="p-4 md:p-6 bg-white rounded-2xl shadow-sm border border-gray-100 min-h-[500px]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-brand-olive" />
            {language === 'ar' ? 'جدول النادي' : 'Gym Schedule'}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {language === 'ar' ? 'إدارة الكلاسات، الأوقات، والمدربين' : 'Manage classes, times, and trainers'}
          </p>
        </div>
        <button onClick={() => handleOpenModal()} className="bg-brand-olive text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-olive-dark transition-colors text-sm">
          <Plus className="w-4 h-4" />
          {language === 'ar' ? 'إضافة كلاس' : 'Add Class'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
              <th className="p-3 font-semibold">{language === 'ar' ? 'اليوم' : 'Day'}</th>
              <th className="p-3 font-semibold">{language === 'ar' ? 'الكلاس' : 'Class'}</th>
              <th className="p-3 font-semibold">{language === 'ar' ? 'الوقت' : 'Time'}</th>
              <th className="p-3 font-semibold">{language === 'ar' ? 'المدرب' : 'Trainer'}</th>
              <th className="p-3 font-semibold">{language === 'ar' ? 'السعة' : 'Capacity'}</th>
              <th className="p-3 font-semibold text-center">{language === 'ar' ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {classes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500 font-medium">
                  {language === 'ar' ? 'لا يوجد كلاسات مجدولة.' : 'No classes scheduled.'}
                </td>
              </tr>
            ) : (
              classes.map((cls) => (
                <tr key={cls.id} className="border-b border-gray-100 hover:bg-gray-50/50 transition-colors">
                  <td className="p-3 font-medium text-gray-800">
                    {language === 'ar' ? daysOfWeekAr[daysOfWeek.indexOf(cls.day)] || cls.day : cls.day}
                  </td>
                  <td className="p-3 font-bold text-brand-olive">{cls.className}</td>
                  <td className="p-3 text-gray-600 font-mono text-xs">{cls.time}</td>
                  <td className="p-3 text-gray-800">{cls.trainer}</td>
                  <td className="p-3 text-gray-600">{cls.capacity}</td>
                  <td className="p-3 flex items-center justify-center gap-2">
                    <button onClick={() => handleOpenModal(cls)} className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(cls.id!)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 relative">
            <h2 className="text-xl font-bold mb-6">
              {editingClass ? (language === 'ar' ? 'تعديل الكلاس' : 'Edit Class') : (language === 'ar' ? 'إضافة كلاس' : 'Add Class')}
            </h2>
            <form onSubmit={handleSave} className="space-y-4 text-sm">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">{language === 'ar' ? 'اسم الكلاس' : 'Class Name'}</label>
                <input required type="text" value={formData.className} onChange={e => setFormData({...formData, className: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive" placeholder="e.g. Yoga, Zumba" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">{language === 'ar' ? 'اليوم' : 'Day'}</label>
                  <select value={formData.day} onChange={e => setFormData({...formData, day: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive bg-white">
                    {daysOfWeek.map((day, idx) => (
                      <option key={day} value={day}>{language === 'ar' ? daysOfWeekAr[idx] : day}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">{language === 'ar' ? 'الوقت' : 'Time'}</label>
                  <input required type="time" value={formData.time} onChange={e => setFormData({...formData, time: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">{language === 'ar' ? 'المدرب' : 'Trainer Name'}</label>
                  <input required type="text" value={formData.trainer} onChange={e => setFormData({...formData, trainer: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive" placeholder="e.g. Sarah" />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">{language === 'ar' ? 'السعة (اختياري)' : 'Capacity (Optional)'}</label>
                  <input type="number" min="1" value={formData.capacity || ''} onChange={e => setFormData({...formData, capacity: parseInt(e.target.value) || undefined})} className="w-full border border-gray-300 rounded-lg p-2.5 outline-none focus:border-brand-olive focus:ring-1 focus:ring-brand-olive" placeholder="20" />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" disabled={actionLoading} className="px-5 py-2.5 rounded-xl bg-brand-olive text-white font-bold hover:bg-olive-dark transition-colors shadow-sm disabled:opacity-50">
                  {actionLoading ? '...' : (language === 'ar' ? 'حفظ' : 'Save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
