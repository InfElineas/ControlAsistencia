import { isNativeRuntime } from '@/lib/mobile-runtime';

export type NotificationPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

function normalizePermission(value?: string): NotificationPermissionState {
  if (value === 'granted' || value === 'denied' || value === 'prompt') return value;
  return 'unsupported';
}

export async function checkNotificationPermission(): Promise<NotificationPermissionState> {
  if (isNativeRuntime() && window.Capacitor?.Plugins?.LocalNotifications?.checkPermissions) {
    const result = await window.Capacitor.Plugins.LocalNotifications.checkPermissions();
    return normalizePermission(result.display);
  }

  if (typeof Notification === 'undefined') return 'unsupported';

  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'prompt';
}

export async function requestNotificationPermission(): Promise<{
  state: NotificationPermissionState;
  prompted: boolean;
}> {
  if (isNativeRuntime() && window.Capacitor?.Plugins?.LocalNotifications?.requestPermissions) {
    const result = await window.Capacitor.Plugins.LocalNotifications.requestPermissions();
    return {
      state: normalizePermission(result.display),
      prompted: true,
    };
  }

  if (typeof Notification === 'undefined') {
    return { state: 'unsupported', prompted: false };
  }

  const permission = await Notification.requestPermission();
  return {
    state: normalizePermission(permission),
    prompted: true,
  };
}
