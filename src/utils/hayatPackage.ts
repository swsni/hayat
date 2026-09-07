import { CustomerPackage } from '../types';

export function expandHayatPackage(
  customerId: string,
  packageId: string,
  category: 'salon' | 'gym' | 'cafe',
  purchasedAt: string,
  startDate: string,
  isQatar: boolean,
  generatedPackageId: string,
  rootPackageName: string = ''
): CustomerPackage[] {
  const hayatEnd = new Date(startDate);
  hayatEnd.setMonth(hayatEnd.getMonth() + 6);
  const hayatEndDateStr = hayatEnd.toISOString().substring(0, 10);

  let subPackages: { name: string, count: number }[] = [];
  const isEnglish = rootPackageName.toLowerCase().includes('package');

  if (rootPackageName.includes('باقة حياة') || rootPackageName.includes('Hayat Package')) {
    subPackages = [
      { name: isEnglish ? 'Hayat Package - Green Mashat with wash' : 'باقة حياة - جلسة مشاط اخضر مع غسيل', count: 1 },
      { name: isEnglish ? 'Hayat Package - Sidr with wash' : 'باقة حياة - جلسة سدر مع غسيل', count: 2 },
      { name: isEnglish ? 'Hayat Package - Oils with wash' : 'باقة حياة - جلسه زيوت مع غسيل', count: 1 },
      { name: isEnglish ? 'Hayat Package - Henna with wash' : 'باقة حياة - جلسة حنة مع غسيل', count: 1 },
      { name: isEnglish ? 'Hayat Package - Moisturizing Mask' : 'باقة حياة - جلسة ماسك الترطيب', count: 1 }
    ];
    if (isQatar) {
      subPackages = subPackages.filter(hp => !hp.name.includes('مشاط اخضر') && !hp.name.includes('Green Mashat'));
    }
  } else if (rootPackageName.includes('بكج الترطيب') || rootPackageName.includes('Moisturizing Package')) {
    subPackages = [
      { name: isEnglish ? 'Moisturizing Package - Henna or Mashat' : 'بكج الترطيب - جلسات حنة او مشاط', count: 7 },
      { name: isEnglish ? 'Moisturizing Package - Oil or Butter Massage' : 'بكج الترطيب - جلسة مساج زيت او الزبدات', count: 1 },
      { name: isEnglish ? 'Moisturizing Package - Moisturizing Mask' : 'بكج الترطيب - جلسة ماسك الترطيب', count: 2 }
    ];
  } else if (rootPackageName.includes('بكج الفراغات') || rootPackageName.includes('Gaps Package')) {
    subPackages = [
      { name: isEnglish ? 'Gaps Package - Hair Scrub' : 'بكج الفراغات - جلسة سكراب للشعر', count: 1 },
      { name: isEnglish ? 'Gaps Package - Henna or Mashat' : 'بكج الفراغات - جلسات حنة او مشاط', count: 5 },
      { name: isEnglish ? 'Gaps Package - Sidr' : 'بكج الفراغات - جلسات سدر', count: 2 },
      { name: isEnglish ? 'Gaps Package - Oil or Butter Massage' : 'بكج الفراغات - جلسة مساج زيت او الزبدات', count: 1 },
      { name: isEnglish ? 'Gaps Package - Moisturizing Mask' : 'بكج الفراغات - جلسة ماسك الترطيب', count: 1 }
    ];
  }

  return subPackages.map((hp, idx) => ({
    id: `${generatedPackageId}-${idx}`,
    customerId,
    packageId,
    packageName: hp.name,
    category,
    totalSessions: hp.count,
    remainingSessions: hp.count,
    purchasedAt,
    isActive: true,
    startDate,
    endDate: hayatEndDateStr,
  } as CustomerPackage));
}
