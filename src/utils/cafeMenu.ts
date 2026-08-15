export interface SeedCafeCategory {
  category: { ar: string; en: string };
  items: Array<{ id: string; name: { ar: string; en: string }; price: number }>;
}

export const CAFE_MENU: SeedCafeCategory[] = [
  {
    category: { ar: 'موهيتو', en: 'Mojito' },
    items: [
      { id: 'm-7up', name: { ar: '7UP موهيتو', en: '7UP Mojito' }, price: 1.800 },
      { id: 'm-redbull', name: { ar: 'ريد بول موهيتو', en: 'Red Bull Mojito' }, price: 2.500 },
      { id: 'm-blue', name: { ar: 'بلو أورانج موهيتو', en: 'Blue Zesty Orange Mojito' }, price: 2.500 },
      { id: 'm-blueberry', name: { ar: 'بلوبيري موهيتو', en: 'Blueberry Mojito' }, price: 2.500 },
      { id: 'm-strawberry', name: { ar: 'ستروبيري موهيتو', en: 'Strawberry Mojito' }, price: 2.500 },
      { id: 'm-watermelon', name: { ar: 'وتر ملون موهيتو', en: 'Watermelon Mojito' }, price: 2.500 },
      { id: 'm-passion', name: { ar: 'باشن فروت موهيتو', en: 'Passion Fruit Mojito' }, price: 2.500 },
      { id: 'm-karkadeh', name: { ar: 'كركديه', en: 'Karkadeh' }, price: 1.100 },
    ]
  },
  {
    category: { ar: 'قهوة وشاي', en: 'Coffee & Tea' },
    items: [
      { id: 'ct-turkish', name: { ar: 'قهوة تركية', en: 'Turkish Coffee' }, price: 0.660 },
      { id: 'ct-french', name: { ar: 'قهوة فرنسية', en: 'French Coffee' }, price: 0.660 },
      { id: 'ct-redtea', name: { ar: 'شاي أحمر', en: 'Red Tea' }, price: 0.330 },
      { id: 'ct-greentea', name: { ar: 'شاي أخضر', en: 'Green Tea' }, price: 0.330 },
    ]
  },
  {
    category: { ar: 'قهوة مختصة', en: 'Specialty Coffee' },
    items: [
      { id: 'c-espresso', name: { ar: 'اسبريسو', en: 'Espresso' }, price: 1.300 },
      { id: 'c-cappuccino', name: { ar: 'كابتشينو', en: 'Cappuccino' }, price: 1.700 },
      { id: 'c-americano', name: { ar: 'أمريكانو', en: 'Americano' }, price: 1.500 },
      { id: 'c-mocha', name: { ar: 'موكا', en: 'Mocha' }, price: 2.200 },
      { id: 'c-caramel', name: { ar: 'كراميل ماكياتو', en: 'Caramel Macchiato' }, price: 1.900 },
      { id: 'c-latte', name: { ar: 'لاتيه', en: 'Latte' }, price: 1.700 },
      { id: 'c-spanish', name: { ar: 'سبانش لاتيه', en: 'Spanish Latte' }, price: 1.800 },
      { id: 'c-flatwhite', name: { ar: 'فلات وايت', en: 'Flat White' }, price: 1.700 },
      { id: 'c-v60', name: { ar: 'V60', en: 'V60' }, price: 2.200 },
    ]
  }
];

export const getLocalisedCafeName = (value: unknown, lang: 'ar' | 'en') => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'ar' in value && 'en' in value) {
    const record = value as { ar?: string; en?: string };
    return record[lang] || record.en || record.ar || '';
  }
  return '';
};

export const buildDefaultCafeSeedData = () => {
  const categories = CAFE_MENU.map((group, index) => ({
    id: `seed-cat-${index + 1}`,
    name: group.category.en,
    order: index + 1
  }));

  const items = CAFE_MENU.flatMap((group, catIndex) =>
    group.items.map((item, itemIndex) => ({
      id: item.id,
      categoryId: `seed-cat-${catIndex + 1}`,
      name: item.name.en,
      price: item.price,
      isAvailable: true,
      order: itemIndex + 1,
      relatedItemIds: [],
      isStampEligible: true
    }))
  );

  return { categories, items };
};
