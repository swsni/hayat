import type { Invoice } from '../types';

export const isCafeInvoice = (invoice: Partial<Invoice> | null | undefined): boolean => {
  if (!invoice) return false;
  return invoice.category === 'cafe_sale' || invoice.category === 'cafe' || !!invoice.cafeOrderId;
};