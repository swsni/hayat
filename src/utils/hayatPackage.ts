import { CustomerPackage } from '../types';

export function expandHayatPackage(
  customerId: string,
  packageId: string,
  category: 'salon' | 'gym' | 'cafe',
  purchasedAt: string,
  startDate: string,
  isQatar: boolean,
  generatedPackageId: string
): CustomerPackage[] {
  const hayatEnd = new Date(startDate);
  hayatEnd.setMonth(hayatEnd.getMonth() + 6);
  const hayatEndDateStr = hayatEnd.toISOString().substring(0, 10);

  let subPackages = [
    { name: 'باقة حياة - جلسة مشاط اخضر مع غسيل', count: 1 },
    { name: 'باقة حياة - جلسة سدر مع غسيل', count: 2 },
    { name: 'باقة حياة - جلسه زيوت مع غسيل', count: 1 },
    { name: 'باقة حياة - جلسة حنة مع غسيل', count: 1 },
    { name: 'باقة حياة - جلسة ماسك الترطيب', count: 1 }
  ];

  if (isQatar) {
    subPackages = subPackages.filter(hp => !hp.name.includes('مشاط اخضر'));
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
