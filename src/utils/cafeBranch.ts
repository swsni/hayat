const DEFAULT_CAFE_BRANCH_NAME = 'Janabiya';
const normalizeBranchName = (value: string): string => value.trim().toLowerCase();
const isCafeBranchSupported = (branchName: string): boolean => normalizeBranchName(branchName) === 'janabiya';

export const getCafeBranchName = (): string => {
  try {
    const stored = localStorage.getItem('local_cafe_branch');
    if (stored && isCafeBranchSupported(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage access failures and use the default branch.
  }

  return DEFAULT_CAFE_BRANCH_NAME;
};

export const isCafeBranchEnabled = (branchName: string): boolean => {
  return isCafeBranchSupported(branchName);
};