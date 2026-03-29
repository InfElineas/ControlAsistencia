declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        Geolocation?: {
          getCurrentPosition?: (options?: {
            enableHighAccuracy?: boolean;
            timeout?: number;
            maximumAge?: number;
          }) => Promise<{
            coords: {
              latitude: number;
              longitude: number;
              accuracy: number;
            };
          }>;
          watchPosition?: (
            options: {
              enableHighAccuracy?: boolean;
              timeout?: number;
              maximumAge?: number;
            },
            callback: (position: { coords: { latitude: number; longitude: number; accuracy: number } } | null, error?: unknown) => void
          ) => Promise<string>;
          clearWatch?: (options: { id: string }) => Promise<void>;
          checkPermissions?: () => Promise<{
            location?: 'granted' | 'denied' | 'prompt';
            coarseLocation?: 'granted' | 'denied' | 'prompt';
          }>;
          requestPermissions?: () => Promise<{
            location?: 'granted' | 'denied' | 'prompt';
            coarseLocation?: 'granted' | 'denied' | 'prompt';
          }>;
        };
        App?: {
          openSettings?: () => Promise<void>;
        };
        BackgroundGeolocation?: {
          checkPermissions?: () => Promise<{ location?: 'granted' | 'denied' | 'prompt' }>;
          requestPermissions?: () => Promise<{ location?: 'granted' | 'denied' | 'prompt' }>;
          startTracking?: () => Promise<void>;
          stopTracking?: () => Promise<void>;
        };
        LocalNotifications?: {
          checkPermissions?: () => Promise<{ display?: 'granted' | 'denied' | 'prompt' }>;
          requestPermissions?: () => Promise<{ display?: 'granted' | 'denied' | 'prompt' }>;
        };
      };
    };
  }
}

export function isNativeRuntime(): boolean {
  const hasNativeBridge = typeof window !== 'undefined' && typeof window.Capacitor?.isNativePlatform === 'function';
  return hasNativeBridge ? Boolean(window.Capacitor?.isNativePlatform?.()) : false;
}

export function isLikelyWebViewOrigin(origin: string): boolean {
  return origin.startsWith('capacitor://') || origin.startsWith('ionic://') || origin.startsWith('file://');
}
