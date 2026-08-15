import { Package } from '../../types';
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../../firebase';

export interface PackageFormState {
  id: string;
  name: string;
  price: string;
  sessions: string;
  category: 'salon' | 'gym';
  targetBranch?: string;
}

const LOCAL_PACKAGES_KEY = 'local_packages';

export function readLocalPackages(): Package[] {
  try {
    const raw = localStorage.getItem(LOCAL_PACKAGES_KEY);
    return raw ? JSON.parse(raw) as Package[] : [];
  } catch (err) {
    console.error('[PackageHelpers] Failed to read local packages', err);
    return [];
  }
}

export function writeLocalPackages(packages: Package[]) {
  localStorage.setItem(LOCAL_PACKAGES_KEY, JSON.stringify(packages));
}

export async function savePackageData(
  packageForm: PackageFormState,
  isEditing: boolean,
  category: 'salon' | 'gym',
  packagesList: Package[],
  gymList: Package[]
) {
  const priceNum = parseFloat(packageForm.price);
  const sessionsNum = parseInt(packageForm.sessions, 10);

  if (isFirebaseConfigured && db) {
    if (isEditing) {
      await updateDoc(doc(db, 'packages', packageForm.id), {
        name: packageForm.name,
        price: priceNum,
        sessions: sessionsNum,
        category,
        targetBranch: packageForm.targetBranch || ''
      });
    } else {
      await addDoc(collection(db, 'packages'), {
        name: packageForm.name,
        price: priceNum,
        sessions: sessionsNum,
        category,
        targetBranch: packageForm.targetBranch || '',
        createdAt: new Date().toISOString()
      });
    }
  } else {
    let allPkgs = [...packagesList, ...gymList];
    if (isEditing) {
      allPkgs = allPkgs.map(p => p.id === packageForm.id ? {
        ...p,
        name: packageForm.name,
        price: priceNum,
        sessions: sessionsNum,
        category,
        targetBranch: packageForm.targetBranch || ''
      } : p);
    } else {
      allPkgs.push({
        id: 'pkg-' + Date.now(),
        name: packageForm.name,
        price: priceNum,
        sessions: sessionsNum,
        category,
        targetBranch: packageForm.targetBranch || '',
        createdAt: new Date().toISOString()
      } as Package);
    }
    writeLocalPackages(allPkgs);
  }
}

export async function deletePackageData(
  id: string,
  packagesList: Package[],
  gymList: Package[]
) {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, 'packages', id));
  } else {
    const remaining = [...packagesList, ...gymList].filter((p) => p.id !== id);
    writeLocalPackages(remaining);
  }
}
