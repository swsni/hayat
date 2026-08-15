import { PaymentMethod, PaymentSplit } from './core';

export interface Package {
  id: string;
  name: string;
  price: number; // dynamically rendered depending on currency
  sessions: number; // e.g. 1 for single pass, 10 for package, or duration based
  category: 'salon' | 'gym';
  createdAt: string;
  targetBranch?: string; // e.g. 'Qatar', 'Bahrain', or ''/'All' for all branches
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
  parentId?: string;
  parentName?: string;
  coffeeStamps?: number;
  walletBalance?: number;
  isBlocked?: boolean;
  blockedAt?: string;
  blockedBy?: string;
  blockedReason?: string;
  gymAccess?: 'member' | 'staff' | 'family';
}

export interface CustomerPackage {
  id?: string;
  customerId: string;
  packageId: string;
  packageName: string;
  category: 'salon' | 'gym';
  totalSessions: number;
  remainingSessions: number;
  purchasedAt: string;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  isVerified?: boolean;
  isFrozen?: boolean;
  frozenAt?: string | null;
  frozenUntil?: string | null;
}

export interface Invoice {
  id?: string;
  primaryCustomerId: string;
  cafeOrderId?: string;
  customerName?: string;
  amount: number;
  paymentMethod: PaymentMethod;
  payments?: PaymentSplit[];
  description: string;
  category?: string;
  createdAt: string;
  branch: string;
  staffName: string;
  staffId?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  isSplitSecondary?: boolean;
  isRefund?: boolean;
  originalInvoiceId?: string;
}

export type AuditActionType = 'Purchase' | 'Deduct' | 'Undo' | 'Bonus Provision' | 'Profile Update' | 'Refund' | 'Manual Top-Up' | 'Block Customer' | 'Unblock Customer' | 'Freeze Subscription' | 'Unfreeze Subscription';

export interface AuditLog {
  id?: string;
  customerId: string;
  action: AuditActionType;
  description: string;
  timestamp: string;
  staffName: string;
  staffId?: string;
  branch: string;
}
