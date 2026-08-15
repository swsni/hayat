import { addDoc, collection, deleteField, getDocs, query, updateDoc, where } from 'firebase/firestore';
import type { Invoice } from '../types';
import type { CafeOrder } from '../types/cafe';
import type { PaymentMethod, PaymentSplit } from '../types/core';
import { getCafeBranchName } from './cafeBranch';

const buildPaymentsFromSplit = (order: CafeOrder): PaymentSplit[] | undefined => {
  if (order.paymentSplit) {
    const payments: PaymentSplit[] = [];
    if ((order.paymentSplit.cash || 0) > 0) payments.push({ method: 'Cash', amount: order.paymentSplit.cash || 0 });
    if ((order.paymentSplit.benefit || 0) > 0) payments.push({ method: 'BenefitPay', amount: order.paymentSplit.benefit || 0 });
    if ((order.paymentSplit.card || 0) > 0) payments.push({ method: 'Card', amount: order.paymentSplit.card || 0 });
    return payments.length > 0 ? payments : undefined;
  }

  if (order.payments && order.payments.length > 0) {
    return order.payments;
  }

  return undefined;
};

const derivePaymentMethod = (
  payments: PaymentSplit[] | undefined,
  explicit: PaymentMethod | undefined,
  fallback: PaymentMethod | undefined
): PaymentMethod => {
  if (explicit) return explicit;
  if (payments && payments.length > 0) {
    return payments.length > 1 ? 'Split' : payments[0].method;
  }
  return fallback || 'Cash';
};

const shouldInvoiceBeHiddenForStatus = (status: CafeOrder['status']): boolean => {
  return status === 'Pending' || status === 'Preparing' || status === 'Ready' || status === 'Cancelled';
};

export async function syncCafeOrderToInvoice(
  db: any,
  order: CafeOrder,
  options?: {
    fallbackPaymentMethod?: PaymentMethod;
    fallbackBranch?: string;
    fallbackStaffName?: string;
  }
): Promise<string | null> {
  if (!db || !order?.id) return null;

  const existingSnap = await getDocs(query(collection(db, 'invoices'), where('cafeOrderId', '==', order.id)));
  const existingDocs = existingSnap.docs;

  if (shouldInvoiceBeHiddenForStatus(order.status)) {
    if (existingDocs.length === 0) return null;
    const now = new Date().toISOString();
    await Promise.all(
      existingDocs.map((existing) =>
        updateDoc(existing.ref, {
          isDeleted: true,
          deletedAt: now,
          isRefund: order.status === 'Cancelled' ? false : (order.status === 'Refunded' || order.isRefund || false),
        } as Partial<Invoice>)
      )
    );
    return existingDocs[0].id;
  }

  const payments = buildPaymentsFromSplit(order);
  const paymentMethod = derivePaymentMethod(payments, order.paymentMethod, options?.fallbackPaymentMethod);
  const invoiceData: Invoice = {
    primaryCustomerId: order.customerId || '',
    ...(order.customerId ? {} : { customerName: 'Walk-in Cafe Customer' }),
    amount: order.total,
    paymentMethod,
    ...(payments && payments.length > 0 ? { payments } : {}),
    description: `Cafe order #${order.orderNumber}`,
    category: 'cafe_sale',
    createdAt: order.createdAt || new Date().toISOString(),
    branch: order.branch || options?.fallbackBranch || getCafeBranchName(),
    staffName: order.staffName || options?.fallbackStaffName || 'Barista',
    cafeOrderId: order.id,
    isRefund: order.status === 'Refunded' || order.isRefund || false,
    isDeleted: false,
  };

  if (existingDocs.length > 0) {
    const updatePayload: Record<string, unknown> = {
      ...invoiceData,
      deletedAt: deleteField(),
    };
    await Promise.all(
      existingDocs.map((existing) =>
        updateDoc(existing.ref, updatePayload)
      )
    );
    return existingDocs[0].id;
  }

  const docRef = await addDoc(collection(db, 'invoices'), invoiceData);
  return docRef.id;
}
