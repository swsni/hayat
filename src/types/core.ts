export type Branch = string;

export interface Staff {
  id: string;
  name: string;
  pin: string;
  role: 'admin' | 'staff' | 'barista';
  branchPermissions: string[]; // e.g. ['Riffa'] or ['All']
  createdAt: string;
}

export type PaymentMethod = 'Card' | 'BenefitPay' | 'Cash' | 'Paid Previously' | 'Store Credit' | 'Split';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}

export interface AppSettings {
  companyName: string;
}

export interface SessionState {
  isLoggedIn: boolean;
  user: Staff | null;
  activeBranch: Branch | null;
  loginTime?: string;
}
