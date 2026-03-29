import { useState, useCallback } from 'react';
import {
  checkLocationPermissions,
  getCurrentDevicePosition,
  openAppSettings,
  openLocationSettings,
  requestBackgroundLocationPermission,
  requestForegroundLocationPermission,
  startBackgroundLocationTracking,
  stopBackgroundLocationTracking,
  type LocationErrorStatus,
  type LocationPermissionSnapshot,
  type LocationPoint,
} from '@/lib/location-service';

export type GeolocationErrorKind = LocationErrorStatus;

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  errorKind: GeolocationErrorKind;
  loading: boolean;
  permissions: LocationPermissionSnapshot;
  backgroundTrackingActive: boolean;
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
    permissions: {
      foreground: 'unknown',
      background: 'unknown',
      native: false,
    },
    backgroundTrackingActive: false,
  });

  const refreshPermissions = useCallback(async () => {
    const permissions = await checkLocationPermissions();
    setState((prev) => ({ ...prev, permissions }));
    return permissions;
  }, []);

  const requestLocationAccess = useCallback(async () => {
    const foreground = await requestForegroundLocationPermission();
    const permissions = await checkLocationPermissions();

    setState((prev) => ({
      ...prev,
      permissions: {
        ...permissions,
        foreground,
      },
      error: foreground === 'denied' ? 'Debes permitir acceso a la ubicación para poder marcar.' : prev.error,
      errorKind: foreground === 'denied' ? 'permission_denied' : prev.errorKind,
    }));

    return foreground;
  }, []);

  const requestBackgroundAccess = useCallback(async () => {
    const background = await requestBackgroundLocationPermission();
    const permissions = await checkLocationPermissions();

    setState((prev) => ({
      ...prev,
      permissions: {
        ...permissions,
        background,
      },
    }));

    return background;
  }, []);

  const getCurrentPosition = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null, errorKind: null }));

    const permissions = await refreshPermissions();
    if (permissions.foreground === 'denied') {
      setState((prev) => ({
        ...prev,
        loading: false,
        errorKind: 'permission_blocked',
        error: 'Permiso de ubicación bloqueado. Abre ajustes de la app para habilitarlo.',
      }));
      return;
    }

    if (permissions.foreground !== 'granted') {
      const granted = await requestLocationAccess();
      if (granted !== 'granted') {
        setState((prev) => ({
          ...prev,
          loading: false,
          errorKind: 'permission_denied',
          error: 'Debes permitir acceso a la ubicación para poder marcar.',
        }));
        return;
      }
    }

    const positionResult = await getCurrentDevicePosition();

    if (!positionResult.ok) {
      setState((prev) => ({
        ...prev,
        loading: false,
        errorKind: positionResult.status,
        error: positionResult.message,
      }));
      return;
    }

    const point: LocationPoint = positionResult.position;
    setState((prev) => ({
      ...prev,
      latitude: point.latitude,
      longitude: point.longitude,
      accuracy: point.accuracy,
      loading: false,
      error: null,
      errorKind: null,
    }));
  }, [refreshPermissions, requestLocationAccess]);

  const startBackgroundTracking = useCallback(async () => {
    const bgPermission = await requestBackgroundAccess();
    if (bgPermission !== 'granted') {
      setState((prev) => ({
        ...prev,
        errorKind: 'background_not_granted',
        error: 'Debes habilitar ubicación en segundo plano para la salida automática.',
        backgroundTrackingActive: false,
      }));
      return 'background_not_granted' as const;
    }

    const trackingStatus = await startBackgroundLocationTracking((point) => {
      setState((prev) => ({
        ...prev,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
      }));
    });

    setState((prev) => ({
      ...prev,
      backgroundTrackingActive: trackingStatus === null,
      errorKind: trackingStatus,
      error:
        trackingStatus === 'background_tracking_unavailable'
          ? 'Seguimiento en segundo plano no disponible sin plugin/servicio nativo adicional.'
          : prev.error,
    }));

    return trackingStatus;
  }, [requestBackgroundAccess]);

  const stopBackgroundTracking = useCallback(async () => {
    await stopBackgroundLocationTracking();
    setState((prev) => ({ ...prev, backgroundTrackingActive: false }));
  }, []);

  const checkGeofence = useCallback(
    (config: GeofenceConfig): GeofenceResult | null => {
      if (state.latitude === null || state.longitude === null) {
        return null;
      }

      const distance = calculateDistance(state.latitude, state.longitude, config.centerLat, config.centerLng);
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
    refreshPermissions,
    requestLocationAccess,
    requestBackgroundAccess,
    openAppSettings,
    openLocationSettings,
    startBackgroundTracking,
    stopBackgroundTracking,
    checkGeofence,
  };
}
