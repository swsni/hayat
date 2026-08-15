export function showToast(message: string, type: 'success' | 'ref' | 'error' = 'success') {
  window.dispatchEvent(
    new CustomEvent('app_toast', {
      detail: { message, type },
    })
  );
}
