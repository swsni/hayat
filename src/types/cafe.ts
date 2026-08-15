import { PaymentMethod, PaymentSplit } from './core';

export interface CafeOrder {
  id?: string;
  orderNumber: string;
  customerId?: string;
  branch?: string;
  staffName?: string;
  source?: string;
  customerType?: 'walk_in' | 'member' | 'guest';
  items: Array<{ id: string; name: string; price: number; quantity: number }>;
  total: number;
  notes?: string;
  translated_notes?: {
    ar?: string;
    en?: string;
  };
  status: 'Pending' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled' | 'Refunded';
  paymentMethod?: PaymentMethod;
  payments?: PaymentSplit[];
  paymentSplit?: {
    cash: number;
    benefit: number;
    card: number;
  };
  deliveryLocation?: string;
  scheduledTime?: string;
  discountAmount?: number;
  freeItemId?: string;
  earnsStamp?: boolean;
  isRefund?: boolean;
  originalOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CafeCategory {
  id: string;
  name: string;
  order: number;
}

export interface CafeMenuItem {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  order: number;
  relatedItemIds?: string[];
  isStampEligible?: boolean;
}

export interface SuspendedOrder {
  id?: string;
  staffId: string;
  branch: string;
  customerName: string;
  cart: Array<{ id: string; name: string; price: number; quantity: number }>;
  total: number;
  savedAt: string;
}
