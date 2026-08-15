export const isQatarBranch = (branch: string | null | undefined): boolean => {
  if (!branch) return false;
  const b = branch.toLowerCase();
  return b === 'qatar' || b === 'قطر' || b.includes('qatar') || b.includes('قطر');
};

export const getActiveBranch = (): string | null => {
  try {
    const session = JSON.parse(sessionStorage.getItem('hala_session') || '{}');
    return session.activeBranch || null;
  } catch (e) {
    return null;
  }
};


