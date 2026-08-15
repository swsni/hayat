import { auth } from '../firebase';

/**
 * Triggers an Apple Wallet push update for a specific customer.
 * Calls the trigger-push backend API to send an APNs push notification.
 * 
 * @param customerId The ID of the customer whose wallet pass should be updated.
 */
export async function triggerWalletUpdate(customerId: string): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };

    if (auth?.currentUser) {
      try {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      } catch (tokenErr) {
        console.warn('[Wallet Trigger] Could not attach Firebase bearer token:', tokenErr);
      }
    }

    // Call the dedicated Apple Wallet backend (hosted on Firebase Functions)
    // Using the live API endpoint for the trigger-push command.
    const response = await fetch("/api/wallet/trigger-push", {
      method: "POST",
      headers,
      body: JSON.stringify({ customerId }),
    });

    if (!response.ok) {
      console.warn(`[Wallet Trigger] Failed to trigger update for customer ${customerId}. Status: ${response.status}`);
      return false;
    }

    const data = await response.json();

    if (!data?.success) {
      const reasons = Array.isArray(data?.summary?.reasons) ? data.summary.reasons.join(' | ') : 'Unknown reason';
      console.warn(`[Wallet Trigger] Push request accepted but no successful APNs delivery for ${customerId}. Reasons: ${reasons}`);
      return false;
    }

    console.log(`[Wallet Trigger] Successfully requested push update for customer ${customerId}:`, data);
    return true;
  } catch (error) {
    console.error(`[Wallet Trigger] Network/CORS error calling wallet trigger endpoint for ${customerId}:`, error);
    return false;
  }
}
