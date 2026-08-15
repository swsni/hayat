export const canUseBrowserNotifications = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const ensureBrowserNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!canUseBrowserNotifications()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
};

export const showBrowserNotification = async (params: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): Promise<void> => {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== 'granted') return;

  const { title, body, url, tag } = params;
  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.showNotification(title, {
          body,
          tag,
          data: { url: url || '/cafe' },
          icon: '/notification_icon.png',
          badge: '/notification_icon.png',
        });
        return;
      }
    }

    new Notification(title, { body, tag });
  } catch (error) {
    console.warn('[Notifications] Failed to show browser notification:', error);
  }
};
