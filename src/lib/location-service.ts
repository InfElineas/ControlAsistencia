import { isNativeRuntime } from '@/lib/mobile-runtime';

export type LocationPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type LocationErrorStatus =
  | 'permission_denied'
  | 'permission_blocked'
  | 'gps_disabled'
  | 'location_unavailable'
  | 'timeout'
  | 'outside_geofence'
  | 'background_not_granted'
  | 'background_tracking_unavailable'
  | 'unknown_error'
  | null;

export interface LocationPermissionSnapshot {
  foreground: LocationPermissionState;
  background: LocationPermissionState;
  native: boolean;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number;
}

interface NativePermissionResult {
  location?: LocationPermissionState;
  coarseLocation?: LocationPermissionState;
}

function normalizePermission(value?: string): LocationPermissionState {
  if (value === 'granted' || value === 'denied' || value === 'prompt') {
    return value;
  }
  return 'unknown';
}

function parseLocationError(error: unknown): { status: LocationErrorStatus; message: string } {
  const raw = String((error as { message?: string; code?: string })?.message || (error as { code?: string })?.code || '');
  const normalized = raw.toLowerCase();

  if (normalized.includes('permission') || normalized.includes('not authorized') || normalized.includes('denied')) {
    return {
      status: 'permission_denied',
      message: 'Debes permitir acceso a la ubicación para poder marcar.',
    };
  }

  if (
    normalized.includes('location disabled') ||
    normalized.includes('location services are not enabled') ||
    normalized.includes('provider') ||
    normalized.includes('settings')
  ) {
    return {
      status: 'gps_disabled',
      message: 'Activa la ubicación del dispositivo para continuar.',
    };
  }

  if (normalized.includes('timeout')) {
    return {
      status: 'timeout',
      message: 'No se pudo obtener ubicación a tiempo. Intenta nuevamente.',
    };
  }

  if (normalized.includes('unavailable')) {
    return {
      status: 'location_unavailable',
      message: 'La ubicación no está disponible en este momento.',
    };
  }

  return {
    status: 'unknown_error',
    message: 'No fue posible determinar tu ubicación.',
  };
}

export async function checkLocationPermissions(): Promise<LocationPermissionSnapshot> {
  const native = isNativeRuntime();

  if (native && window.Capacitor?.Plugins?.Geolocation?.checkPermissions) {
    const nativePermissions = await window.Capacitor.Plugins.Geolocation.checkPermissions();
    const foreground = normalizePermission(nativePermissions.location ?? nativePermissions.coarseLocation);

    const backgroundPlugin = window.Capacitor.Plugins.BackgroundGeolocation;
    const bgPermissions = backgroundPlugin?.checkPermissions ? await backgroundPlugin.checkPermissions() : undefined;
    const background = normalizePermission(bgPermissions?.location);

    return { foreground, background, native };
  }

  if (!navigator.permissions?.query) {
    return { foreground: 'unknown', background: 'unknown', native };
  }

  const foregroundQuery = await navigator.permissions.query({ name: 'geolocation' });
  return {
    foreground: normalizePermission(foregroundQuery.state),
    background: 'unknown',
    native,
  };
}

export async function requestForegroundLocationPermission(): Promise<{
  state: LocationPermissionState;
  blocked: boolean;
}> {
  const native = isNativeRuntime();

  if (native && window.Capacitor?.Plugins?.Geolocation) {
    const geoPlugin = window.Capacitor.Plugins.Geolocation;
    const current = geoPlugin.checkPermissions ? await geoPlugin.checkPermissions() : undefined;
    const currentState = normalizePermission(current?.location ?? current?.coarseLocation);

    const requested = geoPlugin.requestPermissions ? await geoPlugin.requestPermissions() : current;
    const requestedState = normalizePermission(requested?.location ?? requested?.coarseLocation);

    return {
      state: requestedState,
      blocked: requestedState === 'denied' && currentState === 'denied',
    };
  }

  if (!navigator.geolocation) return { state: 'unknown', blocked: false };
  if (!navigator.permissions?.query) return { state: 'prompt', blocked: false };
  const state = await navigator.permissions.query({ name: 'geolocation' });
  const normalized = normalizePermission(state.state);
  return {
    state: normalized,
    blocked: normalized === 'denied',
  };
}

export async function requestBackgroundLocationPermission(): Promise<{
  state: LocationPermissionState;
  blocked: boolean;
}> {
  const native = isNativeRuntime();
  const bgPlugin = window.Capacitor?.Plugins?.BackgroundGeolocation;

  if (!native || !bgPlugin) {
    return { state: 'unknown', blocked: false };
  }

  const current = bgPlugin.checkPermissions ? await bgPlugin.checkPermissions() : undefined;
  const currentState = normalizePermission(current?.location);

  const requested = bgPlugin.requestPermissions ? await bgPlugin.requestPermissions() : current;
  const requestedState = normalizePermission(requested?.location);

  return {
    state: requestedState,
    blocked: requestedState === 'denied' && currentState === 'denied',
  };
}

export async function openAppSettings(): Promise<boolean> {
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (isNativeRuntime() && appPlugin?.openSettings) {
    await appPlugin.openSettings();
    return true;
  }
  return false;
}

export async function openLocationSettings(): Promise<boolean> {
  return openAppSettings();
}

export async function getCurrentDevicePosition(): Promise<
  | { ok: true; position: LocationPoint }
  | { ok: false; status: LocationErrorStatus; message: string }
> {
  try {
    if (isNativeRuntime() && window.Capacitor?.Plugins?.Geolocation?.getCurrentPosition) {
      const nativePosition = await window.Capacitor.Plugins.Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });

      return {
        ok: true,
        position: {
          latitude: nativePosition.coords.latitude,
          longitude: nativePosition.coords.longitude,
          accuracy: nativePosition.coords.accuracy,
        },
      };
    }

    if (!navigator.geolocation) {
      return {
        ok: false,
        status: 'location_unavailable',
        message: 'Geolocalización no disponible en este dispositivo.',
      };
    }

    const webPosition = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      });
    });

    return {
      ok: true,
      position: {
        latitude: webPosition.coords.latitude,
        longitude: webPosition.coords.longitude,
        accuracy: webPosition.coords.accuracy,
      },
    };
  } catch (error) {
    if (typeof GeolocationPositionError !== 'undefined' && error instanceof GeolocationPositionError) {
      switch (error.code) {
        case error.PERMISSION_DENIED:
          return { ok: false, status: 'permission_denied', message: 'Debes permitir acceso a la ubicación para poder marcar.' };
        case error.POSITION_UNAVAILABLE:
          return { ok: false, status: 'location_unavailable', message: 'La ubicación no está disponible en este momento.' };
        case error.TIMEOUT:
          return { ok: false, status: 'timeout', message: 'No se pudo obtener ubicación a tiempo. Intenta nuevamente.' };
      }
    }

    const mapped = parseLocationError(error);
    return {
      ok: false,
      status: mapped.status,
      message: mapped.message,
    };
  }
}

let watchId: number | string | null = null;

export async function startBackgroundLocationTracking(onLocation: (point: LocationPoint) => void): Promise<LocationErrorStatus> {
  const native = isNativeRuntime();

  if (native && window.Capacitor?.Plugins?.BackgroundGeolocation?.startTracking) {
    await window.Capacitor.Plugins.BackgroundGeolocation.startTracking();
    return null;
  }

  if (!navigator.geolocation) {
    return 'background_tracking_unavailable';
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      onLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });
    },
    () => undefined,
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15000,
    }
  );

  return 'background_tracking_unavailable';
}

export async function stopBackgroundLocationTracking(): Promise<void> {
  if (isNativeRuntime() && window.Capacitor?.Plugins?.BackgroundGeolocation?.stopTracking) {
    await window.Capacitor.Plugins.BackgroundGeolocation.stopTracking();
  }

  if (typeof watchId === 'number') {
    navigator.geolocation.clearWatch(watchId);
  }

  if (typeof watchId === 'string' && window.Capacitor?.Plugins?.Geolocation?.clearWatch) {
    await window.Capacitor.Plugins.Geolocation.clearWatch({ id: watchId });
  }

  watchId = null;
}
