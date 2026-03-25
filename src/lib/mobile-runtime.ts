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
