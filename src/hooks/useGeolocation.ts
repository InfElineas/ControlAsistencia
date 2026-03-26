import { useState, useCallback } from 'react';
import { isNativeRuntime } from '@/lib/mobile-runtime';

export type GeolocationErrorKind =
  | 'permission_denied'
  | 'gps_disabled'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported'
  | 'unknown'
  | null;

type PermissionStateValue = 'granted' | 'denied' | 'prompt' | 'unknown';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  errorKind: GeolocationErrorKind;
  loading: boolean;
  permissionState: PermissionStateValue;
}

interface GeofenceConfig {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  accuracyThreshold: number;
}

interface GeofenceResult {
  isInside: boolean;
  distance: number;
  accuracyOk: boolean;
}

interface CapacitorPermissionResult {
  location?: PermissionStateValue;
  coarseLocation?: PermissionStateValue;
}

interface CapacitorPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

interface CapacitorGeolocationPlugin {
  getCurrentPosition?: (options?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
  }) => Promise<CapacitorPosition>;
  checkPermissions?: () => Promise<CapacitorPermissionResult>;
  requestPermissions?: () => Promise<CapacitorPermissionResult>;
}

function resolvePermissionState(result?: CapacitorPermissionResult): PermissionStateValue {
  const location = result?.location ?? result?.coarseLocation;
  if (location === 'granted' || location === 'denied' || location === 'prompt') {
    return location;
  }
  return 'unknown';
}

function mapNativeError(error: unknown): { kind: GeolocationErrorKind; message: string } {
  const raw = String((error as { message?: string; code?: string })?.message || (error as { code?: string })?.code || '');
  const normalized = raw.toLowerCase();

  if (normalized.includes('denied') || normalized.includes('not authorized') || normalized.includes('permission')) {
    return {
      kind: 'permission_denied',
      message: 'Permiso de ubicación denegado. Debes permitir la ubicación para marcar asistencia.',
    };
  }

  if (
    normalized.includes('location disabled') ||
    normalized.includes('location services are not enabled') ||
    normalized.includes('settings') ||
    normalized.includes('provider')
  ) {
    return {
      kind: 'gps_disabled',
      message: 'La ubicación del dispositivo parece desactivada. Activa GPS/Ubicación en Ajustes.',
    };
  }

  if (normalized.includes('timeout')) {
    return {
      kind: 'timeout',
      message: 'No se pudo obtener ubicación a tiempo. Intenta nuevamente en una zona abierta.',
    };
  }

  return {
    kind: 'unknown',
    message: 'No se pudo obtener ubicación del dispositivo.',
  };
}

function mapWebError(error: GeolocationPositionError): { kind: GeolocationErrorKind; message: string } {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return {
        kind: 'permission_denied',
        message: 'Permiso de ubicación denegado. Habilita el permiso para continuar.',
      };
    case error.POSITION_UNAVAILABLE:
      return {
        kind: 'gps_disabled',
        message: 'Ubicación no disponible. Revisa que el GPS esté activo y con buena señal.',
      };
    case error.TIMEOUT:
      return {
        kind: 'timeout',
        message: 'Tiempo de espera agotado al obtener ubicación. Intenta de nuevo.',
      };
    default:
      return {
        kind: 'unknown',
        message: 'Error al obtener ubicación.',
      };
  }
}

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function useGeolocation() {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    errorKind: null,
    loading: false,
    permissionState: 'unknown',
  });

  const requestLocationAccess = useCallback(async (): Promise<PermissionStateValue> => {
    const nativeGeolocation = window.Capacitor?.Plugins?.Geolocation as CapacitorGeolocationPlugin | undefined;

    if (isNativeRuntime() && nativeGeolocation) {
      const current = nativeGeolocation.checkPermissions ? await nativeGeolocation.checkPermissions() : undefined;
      const currentState = resolvePermissionState(current);
      if (currentState === 'granted') {
        setState((prev) => ({ ...prev, permissionState: 'granted' }));
        return 'granted';
      }

      const requested = nativeGeolocation.requestPermissions ? await nativeGeolocation.requestPermissions() : current;
      const requestedState = resolvePermissionState(requested);
      setState((prev) => ({ ...prev, permissionState: requestedState }));
      return requestedState;
    }

    if (!navigator.geolocation) {
      setState((prev) => ({
        ...prev,
        permissionState: 'unknown',
        error: 'Geolocalización no disponible en este dispositivo.',
        errorKind: 'unsupported',
      }));
      return 'unknown';
    }

    if (navigator.permissions?.query) {
      const result = await navigator.permissions.query({ name: 'geolocation' });
      const webState = result.state as PermissionStateValue;
      setState((prev) => ({ ...prev, permissionState: webState }));
      return webState;
    }

    return 'prompt';
  }, []);

  const getCurrentPosition = useCallback(async () => {
    const nativeGeolocation = window.Capacitor?.Plugins?.Geolocation as CapacitorGeolocationPlugin | undefined;

    setState((prev) => ({ ...prev, loading: true, error: null, errorKind: null }));

    try {
      const permissionState = await requestLocationAccess();
      if (permissionState === 'denied') {
        setState((prev) => ({
          ...prev,
          loading: false,
          permissionState,
          errorKind: 'permission_denied',
          error: 'Permiso de ubicación denegado. Debes permitirlo para marcar asistencia.',
        }));
        return;
      }

      if (isNativeRuntime() && nativeGeolocation?.getCurrentPosition) {
        const position = await nativeGeolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });

        setState((prev) => ({
          ...prev,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          errorKind: null,
          loading: false,
          permissionState: permissionState === 'unknown' ? prev.permissionState : permissionState,
        }));
        return;
      }

      if (!navigator.geolocation) {
        setState((prev) => ({
          ...prev,
          loading: false,
          errorKind: 'unsupported',
          error: 'Geolocalización no disponible en este dispositivo.',
        }));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setState((prev) => ({
            ...prev,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            error: null,
            errorKind: null,
            loading: false,
          }));
        },
        (error) => {
          const mapped = mapWebError(error);
          setState((prev) => ({
            ...prev,
            loading: false,
            errorKind: mapped.kind,
            error: mapped.message,
            permissionState: mapped.kind === 'permission_denied' ? 'denied' : prev.permissionState,
          }));
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        }
      );
    } catch (error) {
      const mapped = mapNativeError(error);
      setState((prev) => ({
        ...prev,
        loading: false,
        errorKind: mapped.kind,
        error: mapped.message,
        permissionState: mapped.kind === 'permission_denied' ? 'denied' : prev.permissionState,
      }));
    }
  }, [requestLocationAccess]);

  const openLocationSettings = useCallback(async (): Promise<boolean> => {
    const appPlugin = window.Capacitor?.Plugins?.App as { openSettings?: () => Promise<void> } | undefined;
    if (isNativeRuntime() && appPlugin?.openSettings) {
      await appPlugin.openSettings();
      return true;
    }
    return false;
  }, []);

  const checkGeofence = useCallback(
    (config: GeofenceConfig): GeofenceResult | null => {
      if (state.latitude === null || state.longitude === null) {
        return null;
      }

      const distance = calculateDistance(
        state.latitude,
        state.longitude,
        config.centerLat,
        config.centerLng
      );

      const isInside = distance <= config.radiusMeters;
      const accuracyOk = state.accuracy !== null && state.accuracy <= config.accuracyThreshold;

      return {
        isInside,
        distance: Math.round(distance),
        accuracyOk,
      };
    },
    [state.latitude, state.longitude, state.accuracy]
  );

  return {
    ...state,
    getCurrentPosition,
    requestLocationAccess,
    openLocationSettings,
    checkGeofence,
  };
}
