import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import type { Staff } from '../types';
import { getCafeBranchName } from './cafeBranch';

const getStoredSessionUser = (): Staff | null => {
  try {
    const saved = sessionStorage.getItem('hala_session');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed?.user || null;
  } catch {
    return null;
  }
};

export const getStoredCafeAccessRole = (): Staff['role'] | null => {
  const tokenStr = sessionStorage.getItem('cafe_auth');
  if (tokenStr) {
    try {
      const token = JSON.parse(tokenStr);
      if (token.expires && token.expires > Date.now() && token.role) {
        return token.role;
      }
    } catch {}
  }
  const user = getStoredSessionUser();
  const role = user?.role;
  return role === 'admin' || role === 'barista' || role === 'staff' ? role : null;
};

const canUserAccessCafe = (user: Staff | null): boolean => {
  if (!user) return false;
  if (user.role !== 'admin' && user.role !== 'barista') return false;
  if (user.branchPermissions?.includes('All')) return true;
  return user.branchPermissions?.includes(getCafeBranchName()) || false;
};

export const isCafeAccessAllowed = (): boolean => {
  const tokenStr = sessionStorage.getItem('cafe_auth');
  if (tokenStr) {
    try {
      const token = JSON.parse(tokenStr);
      if (token.expires && token.expires > Date.now()) return true;
    } catch {}
  }
  return canUserAccessCafe(getStoredSessionUser());
};

export const unlockCafeAccessByPin = async (pin: string): Promise<{ ok: boolean; role?: Staff['role']; name?: string }> => {
  if (isCafeAccessAllowed()) {
    const role = getStoredCafeAccessRole();
    return { ok: true, role: role || 'admin' };
  }

  if (isFirebaseConfigured && db) {
    const q = query(collection(db, 'staff'), where('pin', '==', pin));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const data = snap.docs[0].data() as Partial<Staff>;
      const role = data.role;
      const branchPermissions = data.branchPermissions || ['All'];
      if ((role === 'admin' || role === 'barista') && (branchPermissions.includes('All') || branchPermissions.includes(getCafeBranchName()))) {
        const token = {
          role,
          name: data.name,
          expires: Date.now() + 12 * 60 * 60 * 1000 // 12 hours
        };
        sessionStorage.setItem('cafe_auth', JSON.stringify(token));
        return { ok: true, role, name: data.name };
      }
    }
  }

  const localStaff = localStorage.getItem('local_staff');
  if (localStaff) {
    try {
      const staffList: Staff[] = JSON.parse(localStaff);
      const found = staffList.find((s) => s.pin === pin && (s.role === 'admin' || s.role === 'barista') && (s.branchPermissions?.includes('All') || s.branchPermissions?.includes(getCafeBranchName())));
      if (found) {
        const token = {
          role: found.role,
          name: found.name,
          expires: Date.now() + 12 * 60 * 60 * 1000
        };
        sessionStorage.setItem('cafe_auth', JSON.stringify(token));
        return { ok: true, role: found.role, name: found.name };
      }
    } catch {
      // ignore malformed cache
    }
  }

  return { ok: false };
};
