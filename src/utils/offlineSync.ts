import { db, isFirebaseConfigured } from '../firebase';
import { collection, addDoc, doc, writeBatch, getDocs, query, orderBy, increment } from 'firebase/firestore';
import { Customer, CustomerPackage, Invoice, AuditLog } from '../types';
import { showToast } from './toast';
import { triggerWalletUpdate } from './wallet';
import { get, set } from 'idb-keyval';
import { isQatarBranch } from './branchHelpers';
import { expandHayatPackage } from './hayatPackage';

export interface PendingAction {
  id: string;
  type: 'create_customer' | 'deduct_session' | 'undo_session' | 'pos_purchase';
  payload: any;
  timestamp: string;
}

class OfflineSyncService {
  private queueKey = 'local_pending_offline_actions';

  // Get current pending sync queue
  async getPendingActions(): Promise<PendingAction[]> {
    try {
      const actions = await get<PendingAction[]>(this.queueKey);
      return actions || [];
    } catch {
      return [];
    }
  }

  // Save actions queue
  private async savePendingActions(actions: PendingAction[]) {
    await set(this.queueKey, actions);
  }

  // Queue a new action when offline/network failure
  async queueAction(type: PendingAction['type'], payload: any) {
    const actions = await this.getPendingActions();
    const actionId = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    
    // Pre-generate IDs for Firestore to ensure idempotency and prevent duplicates
    if (type === 'pos_purchase') {
      payload.generatedInvoiceIds = payload.splitPayments.map((_: any, index: number) => `inv-offline-${Date.now()}-${index}`);
      payload.generatedPackageId = `pkg-offline-${Date.now()}`;
      payload.generatedLogId = `log-offline-${Date.now()}`;
      if (payload.selectedItem?.isCouple && payload.coupleSecondCustomer) {
        payload.generatedPartnerPackageId = `pkg-offline-${Date.now()}-partner`;
        payload.generatedPartnerLogId = `log-offline-${Date.now()}-partner`;
      }
      if (payload.selectedItem?.isTriple && payload.tripleThirdCustomer) {
        payload.generatedThirdPackageId = `pkg-offline-${Date.now()}-third`;
        payload.generatedThirdLogId = `log-offline-${Date.now()}-third`;
      }
    } else if (type === 'create_customer') {
      payload.id = payload.id || `cust-offline-${Date.now()}`;
    }

    const newAction: PendingAction = {
      id: actionId,
      type,
      payload,
      timestamp: new Date().toISOString()
    };
    
    actions.push(newAction);
    await this.savePendingActions(actions);
    
    // Apply immediate optimistic updates to local caches so the app remains fully responsive and styled
    await this.applyOptimisticUpdate(newAction);
    showToast('Working offline: Actions cached locally.', 'ref');
  }

  // Perform immediate optimistic updates in standard idb caches
  private async applyOptimisticUpdate(action: PendingAction) {
    const now = action.payload.timestamp || new Date().toISOString();
    
    if (action.type === 'create_customer') {
      const customers = (await get<Customer[]>('local_customers')) || [];
      const newCust: Customer = {
        id: action.payload.id || action.id,
        name: action.payload.name,
        phone: action.payload.phone,
        createdAt: now
      };
      // Check if already in local list to avoid duplicates
      if (!customers.some((c: Customer) => c.phone === newCust.phone)) {
        customers.unshift(newCust);
        await set('local_customers', customers);
      }
    } 
    
    else if (action.type === 'deduct_session') {
      const { pkgId, customerId, packageName, staffName, staffId, branch } = action.payload;
      
      // Update local Packages
      const localPkgs = (await get<CustomerPackage[]>('local_packages')) || [];
      const pIndex = localPkgs.findIndex((p: CustomerPackage) => p.id === pkgId);
      let newRemaining = 0;
      if (pIndex > -1) {
        newRemaining = Math.max(0, localPkgs[pIndex].remainingSessions - 1);
        localPkgs[pIndex].remainingSessions = newRemaining;
        await set('local_packages', localPkgs);
      }

      // Record local Audit Logs
      const localLogs = (await get<AuditLog[]>('local_logs')) || [];
      localLogs.push({
        id: `log-${Date.now()}`,
        customerId,
        action: 'Deduct',
        description: `Deducted 1 session from "${packageName}" (${newRemaining} remaining)`,
        timestamp: now,
        staffName,
        staffId,
        branch
      });
      await set('local_logs', localLogs);
    } 
    
    else if (action.type === 'undo_session') {
      const { pkgId, customerId, packageName, staffName, staffId, branch, totalSessions } = action.payload;
      
      // Update local Packages
      const localPkgs = (await get<CustomerPackage[]>('local_packages')) || [];
      const pIndex = localPkgs.findIndex((p: CustomerPackage) => p.id === pkgId);
      let newRemaining = 1;
      if (pIndex > -1) {
        newRemaining = Math.min(totalSessions, localPkgs[pIndex].remainingSessions + 1);
        localPkgs[pIndex].remainingSessions = newRemaining;
        await set('local_packages', localPkgs);
      }

      // Record local Audit Logs
      const localLogs = (await get<AuditLog[]>('local_logs')) || [];
      localLogs.push({
        id: `log-${Date.now()}`,
        customerId,
        action: 'Undo',
        description: `Restored 1 session to "${packageName}" (${newRemaining} remaining)`,
        timestamp: now,
        staffName,
        staffId,
        branch
      });
      await set('local_logs', localLogs);
    } 
    
    else if (action.type === 'pos_purchase') {
      const { customer, selectedItem, coupleSecondCustomer, tripleThirdCustomer, paymentMethod, type, staffName, staffId, branch, generatedInvoiceIds, generatedPackageId, generatedLogId, generatedPartnerPackageId, generatedPartnerLogId, generatedThirdPackageId, generatedThirdLogId, splitPayments } = action.payload;
      
      // Update local customer wallet balance if Store Credit used
      const storeCreditUsed = splitPayments
        .filter((p: any) => p.method === 'Store Credit')
        .reduce((sum: number, p: any) => sum + p.amount, 0);

      if (storeCreditUsed > 0) {
        const localCustomers = (await get<any[]>('local_customers')) || [];
        const cIndex = localCustomers.findIndex((c: any) => c.id === customer.id);
        if (cIndex !== -1) {
          const currentBalance = localCustomers[cIndex].walletBalance || 0;
          localCustomers[cIndex].walletBalance = Math.max(0, currentBalance - storeCreditUsed);
          await set('local_customers', localCustomers);
        }
      }

      // Save local invoice
      const currentInvoices = (await get<Invoice[]>('local_invoices')) || [];
      splitPayments.forEach((payment: any, index: number) => {
        const invoiceId = generatedInvoiceIds[index];
        currentInvoices.push({
          id: invoiceId,
          primaryCustomerId: customer.id,
          amount: payment.amount,
          paymentMethod: payment.method,
          description: selectedItem.name,
          createdAt: now,
          branch,
          staffName,
          staffId,
          isSplitSecondary: index > 0
        } as Invoice);
      });
      await set('local_invoices', currentInvoices);

      // Save local primary packages
      const currentPackages = (await get<CustomerPackage[]>('local_packages')) || [];
      if (type !== 'cafe') {
        if (selectedItem.name && selectedItem.name.includes('باقة حياة')) {
          const calcStartDate = action.payload.startDate || now.substring(0, 10);
          const isQatar = isQatarBranch(branch);
          const subPackages = expandHayatPackage(
            customer.id,
            selectedItem.id,
            type,
            now,
            calcStartDate,
            isQatar,
            generatedPackageId
          );
          currentPackages.push(...subPackages);
        } else {
          currentPackages.push({
            id: generatedPackageId,
            customerId: customer.id,
            packageId: selectedItem.id,
            packageName: selectedItem.name,
            category: type,
            totalSessions: selectedItem.sessions,
            remainingSessions: selectedItem.sessions,
            purchasedAt: now,
            isActive: true,
            startDate: action.payload.startDate || null,
            endDate: action.payload.endDate || null
          } as CustomerPackage);
        }
      }

      // Save local primary logs
      const currentLogs = (await get<AuditLog[]>('local_logs')) || [];
      const isQatar = branch.toLowerCase().includes('qatar') || branch.includes('قطر');
      const currency = isQatar ? 'ر.ق' : 'BHD';

      currentLogs.push({
        id: generatedLogId,
        customerId: customer.id,
        action: 'Purchase',
        description: `Purchased ${selectedItem.name} (${selectedItem.price} ${currency}) via ${action.payload.splitPayments.map((p:any) => p.method).join(' & ')}`,
        timestamp: now,
        staffName,
        staffId,
        branch
      } as AuditLog);

      // Handle couple partner locally as well
      if (selectedItem.isCouple && coupleSecondCustomer) {
        currentPackages.push({
          id: generatedPartnerPackageId,
          customerId: coupleSecondCustomer.id,
          packageId: selectedItem.id,
          packageName: '1 Month Membership (Couple Partner)',
          category: 'gym',
          totalSessions: 1,
          remainingSessions: 1,
          purchasedAt: now,
          isActive: true,
          startDate: action.payload.startDate || null,
          endDate: action.payload.endDate || null
        } as CustomerPackage);

        currentLogs.push({
          id: generatedPartnerLogId,
          customerId: coupleSecondCustomer.id,
          action: 'Bonus Provision',
          description: `Granted Gym Access from Couple Promo linked to ${customer.name}`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);
      }

      // Handle triple partner locally as well
      if (selectedItem.isTriple && tripleThirdCustomer) {
        currentPackages.push({
          id: generatedThirdPackageId || `pkg-offline-${Date.now()}-third`,
          customerId: tripleThirdCustomer.id,
          packageId: selectedItem.id,
          packageName: '1 Month Membership (Triple Partner)',
          category: 'gym',
          totalSessions: 1,
          remainingSessions: 1,
          purchasedAt: now,
          isActive: true,
          startDate: action.payload.startDate || null,
          endDate: action.payload.endDate || null
        } as CustomerPackage);

        currentLogs.push({
          id: generatedThirdLogId || `log-offline-${Date.now()}-third`,
          customerId: tripleThirdCustomer.id,
          action: 'Bonus Provision',
          description: `Granted Gym Access from Triple Promo linked to ${customer.name}`,
          timestamp: now,
          staffName,
          staffId,
          branch
        } as AuditLog);
      }

      await set('local_packages', currentPackages);
      await set('local_logs', currentLogs);
    }
  }

  // Synchronize all cached offline actions to Firebase Firestore when connection restabilizes
  async syncPendingActions(): Promise<boolean> {
    if (!isFirebaseConfigured || !db || !navigator.onLine) {
      return false;
    }

    const actions = await this.getPendingActions();
    if (actions.length === 0) {
      return false;
    }

    console.log(`[Offline Sync] Synchronizing ${actions.length} pending local events back to Firestore...`);
    showToast(`Syncing ${actions.length} offline transactions...`, 'ref');

    let successCount = 0;
    const remainingActions: PendingAction[] = [];

    for (const action of actions) {
      try {
        if (action.type === 'create_customer') {
          // Add customer to firestore
          const { id, name, phone, createdAt } = action.payload;
          const customerRef = id ? doc(db, 'customers', id) : doc(collection(db, 'customers'));
          const batch = writeBatch(db);
          batch.set(customerRef, { name, phone, createdAt });
          await batch.commit();
          successCount++;
        } 
        
        else if (action.type === 'deduct_session') {
          const { pkgId, customerId, packageName, staffName, staffId, branch, timestamp } = action.payload;
          const batch = writeBatch(db);
          
          const pkgRef = doc(db, 'customerPackages', pkgId);
          const localPkgs = (await get<CustomerPackage[]>('local_packages')) || [];
          const localPkg = localPkgs.find((p: CustomerPackage) => p.id === pkgId);
          const finalSessions = localPkg ? localPkg.remainingSessions : 0;

          batch.update(pkgRef, { remainingSessions: finalSessions });

          const logRef = doc(collection(db, 'auditLogs'));
          batch.set(logRef, {
            customerId,
            action: 'Deduct',
            description: `Deducted 1 session from "${packageName}" (${finalSessions} remaining)`,
            timestamp,
            staffName,
            staffId,
            branch
          });

          await batch.commit();
          triggerWalletUpdate(customerId);
          successCount++;
        } 
        
        else if (action.type === 'undo_session') {
          const { pkgId, customerId, packageName, staffName, staffId, branch, timestamp, totalSessions } = action.payload;
          const batch = writeBatch(db);
          
          const pkgRef = doc(db, 'customerPackages', pkgId);
          const localPkgs = (await get<CustomerPackage[]>('local_packages')) || [];
          const localPkg = localPkgs.find((p: CustomerPackage) => p.id === pkgId);
          const finalSessions = localPkg ? localPkg.remainingSessions : totalSessions;

          batch.update(pkgRef, { remainingSessions: finalSessions });

          const logRef = doc(collection(db, 'auditLogs'));
          batch.set(logRef, {
            customerId,
            action: 'Undo',
            description: `Restored 1 session to "${packageName}" (${finalSessions} remaining)`,
            timestamp,
            staffName,
            staffId,
            branch
          });

          await batch.commit();
          triggerWalletUpdate(customerId);
          successCount++;
        } 
        
        else if (action.type === 'pos_purchase') {
          const { customer, selectedItem, coupleSecondCustomer, tripleThirdCustomer, splitPayments, type, staffName, staffId, branch, timestamp, generatedInvoiceIds, generatedPackageId, generatedLogId, generatedPartnerPackageId, generatedPartnerLogId, generatedThirdPackageId, generatedThirdLogId } = action.payload;
          const batch = writeBatch(db);

          // 0. Wallet deduction (if Store Credit used)
          const storeCreditUsed = splitPayments
            .filter((p: any) => p.method === 'Store Credit')
            .reduce((sum: number, p: any) => sum + p.amount, 0);

          if (storeCreditUsed > 0) {
            const custRef = doc(db, 'customers', customer.id);
            batch.update(custRef, {
              walletBalance: increment(-storeCreditUsed)
            });
          }

          // 1. Invoice registration (using pre-generated IDs to prevent duplicates on retry)
          splitPayments.forEach((payment: any, index: number) => {
            const invoiceRef = doc(db, 'invoices', generatedInvoiceIds[index]);
            batch.set(invoiceRef, {
              primaryCustomerId: customer.id,
              customerName: customer.name,
              amount: payment.amount,
              paymentMethod: payment.method,
              description: selectedItem.name,
              createdAt: timestamp,
              branch,
              staffName,
              staffId,
              isSplitSecondary: index > 0
            });
          });

          // 2. Client package registration
          if (type !== 'cafe') {
            if (selectedItem.name && selectedItem.name.includes('باقة حياة')) {
              const calcStartDate = action.payload.startDate || timestamp.substring(0, 10);
              const isQatar = isQatarBranch(branch);
              const subPackages = expandHayatPackage(
                customer.id,
                selectedItem.id,
                type,
                timestamp,
                calcStartDate,
                isQatar,
                generatedPackageId
              );
              
              subPackages.forEach((pkg) => {
                const packageRef = doc(db, 'customerPackages', pkg.id);
                // Omit id from the document data itself
                const { id, ...pkgData } = pkg;
                batch.set(packageRef, pkgData);
              });
            } else {
              const packageRef = doc(db, 'customerPackages', generatedPackageId);
              batch.set(packageRef, {
                customerId: customer.id,
                packageId: selectedItem.id,
                packageName: selectedItem.name,
                category: type,
                totalSessions: selectedItem.sessions,
                remainingSessions: selectedItem.sessions,
                purchasedAt: timestamp,
                isActive: true,
                startDate: action.payload.startDate || null,
                endDate: action.payload.endDate || null
              });
            }
          }

          // 3. Primary Customer Audit Log
          const logRef = doc(db, 'auditLogs', generatedLogId);
          const isQatarLog = branch.toLowerCase().includes('qatar') || branch.includes('قطر');
          const curr = isQatarLog ? 'ر.ق' : 'BHD';

          batch.set(logRef, {
            customerId: customer.id,
            action: 'Purchase',
            description: `Purchased ${selectedItem.name} (${selectedItem.price} ${curr}) via ${splitPayments.map((p:any) => p.method).join(' & ')}`,
            timestamp,
            staffName,
            staffId,
            branch
          });

          // 4. Handle couple promo
          if (selectedItem.isCouple && coupleSecondCustomer) {
            const partnerPackageRef = doc(db, 'customerPackages', generatedPartnerPackageId);
            batch.set(partnerPackageRef, {
              customerId: coupleSecondCustomer.id,
              packageId: selectedItem.id,
              packageName: '1 Month Membership (Couple Partner)',
              category: 'gym',
              totalSessions: 1,
              remainingSessions: 1,
              purchasedAt: timestamp,
              isActive: true,
              startDate: action.payload.startDate || null,
              endDate: action.payload.endDate || null
            });

            const partnerLogRef = doc(db, 'auditLogs', generatedPartnerLogId);
            batch.set(partnerLogRef, {
              customerId: coupleSecondCustomer.id,
              action: 'Bonus Provision',
              description: `Granted Gym Access from Couple Promo linked to ${customer.name}`,
              timestamp,
              staffName,
              staffId,
              branch
            });
          }

          // 5. Handle triple promo
          if (selectedItem.isTriple && tripleThirdCustomer) {
            const thirdPackageRef = doc(db, 'customerPackages', generatedThirdPackageId || `pkg-offline-${Date.now()}-third`);
            batch.set(thirdPackageRef, {
              customerId: tripleThirdCustomer.id,
              packageId: selectedItem.id,
              packageName: '1 Month Membership (Triple Partner)',
              category: 'gym',
              totalSessions: 1,
              remainingSessions: 1,
              purchasedAt: timestamp,
              isActive: true,
              startDate: action.payload.startDate || null,
              endDate: action.payload.endDate || null
            });

            const thirdLogRef = doc(db, 'auditLogs', generatedThirdLogId || `log-offline-${Date.now()}-third`);
            batch.set(thirdLogRef, {
              customerId: tripleThirdCustomer.id,
              action: 'Bonus Provision',
              description: `Granted Gym Access from Triple Promo linked to ${customer.name}`,
              timestamp,
              staffName,
              staffId,
              branch
            });
          }

          await batch.commit();
          triggerWalletUpdate(customer.id);
          if (selectedItem.isCouple && coupleSecondCustomer) {
            triggerWalletUpdate(coupleSecondCustomer.id);
          }
          if (selectedItem.isTriple && tripleThirdCustomer) {
            triggerWalletUpdate(tripleThirdCustomer.id);
          }
          successCount++;
        }
      } catch (err) {
        console.error(`[Offline Sync] Failed to replay action ${action.id}:`, err);
        // Put back in queue to try later
        remainingActions.push(action);
      }
    }

    await this.savePendingActions(remainingActions);

    if (successCount > 0) {
      showToast(`Cloud Sync Complete: ${successCount} events synced successfully!`, 'success');
      // Trigger refresh profiles on UI elements
      window.dispatchEvent(new CustomEvent('hala_refresh_profile'));
      return true;
    }
    return false;
  }

  // Pre-fetch and cache all records from cloud to provide seamless offline performance
  async cacheCloudDataLocally() {
    if (!isFirebaseConfigured || !db || !navigator.onLine) {
      return;
    }

    try {
      console.log('[Offline Sync] Caching fresh cloud directories locally...');
      
      // Customers
      const customersSnap = await getDocs(query(collection(db, 'customers'), orderBy('createdAt', 'desc')));
      const customersList: Customer[] = [];
      customersSnap.forEach(d => customersList.push({ id: d.id, ...d.data() } as Customer));
      await set('local_customers', customersList);

      // Customer Packages
      const packagesSnap = await getDocs(collection(db, 'customerPackages'));
      const packagesList: CustomerPackage[] = [];
      packagesSnap.forEach(d => packagesList.push({ id: d.id, ...d.data() } as CustomerPackage));
      await set('local_packages', packagesList);

      // Invoices
      const invoicesSnap = await getDocs(collection(db, 'invoices'));
      const invoicesList: Invoice[] = [];
      invoicesSnap.forEach(d => invoicesList.push({ id: d.id, ...d.data() } as Invoice));
      await set('local_invoices', invoicesList);

      // Logs
      const logsSnap = await getDocs(collection(db, 'auditLogs'));
      const logsList: AuditLog[] = [];
      logsSnap.forEach(d => logsList.push({ id: d.id, ...d.data() } as AuditLog));
      await set('local_logs', logsList);

      console.log('[Offline Sync] Offline local cached data initialized successfully in IndexedDB.');
    } catch (err) {
      console.warn('[Offline Sync] Failed to pre-fetch cloud data, relying on existing local caches:', err);
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
