import { useState, useEffect, useCallback } from 'react';
import { isNativeRuntime } from '@/lib/mobile-runtime';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  loading: boolean;
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

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3; // Earth's radius in meters
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
    loading: false,
  });

  const getCurrentPosition = useCallback(() => {
    const nativeGeolocation = window.Capacitor?.Plugins?.Geolocation;

    if (isNativeRuntime() && nativeGeolocation?.getCurrentPosition) {
      setState(prev => ({ ...prev, loading: true, error: null }));
      nativeGeolocation
        .getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
        .then((position) => {
          setState({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            error: null,
            loading: false,
          });
        })
        .catch(() => {
          setState(prev => ({
            ...prev,
            error: 'No se pudo obtener ubicación nativa del dispositivo',
            loading: false,
          }));
        });
      return;
    }

    if (!navigator.geolocation) {
      setState(prev => ({
        ...prev,
        error: 'Geolocalización no disponible en este dispositivo',
        loading: false,
      }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          error: null,
          loading: false,
        });
      },
      (error) => {
        let errorMessage = 'Error al obtener ubicación';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Permiso de ubicación denegado. Por favor, habilita la ubicación.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Ubicación no disponible';
            break;
          case error.TIMEOUT:
            errorMessage = 'Tiempo de espera agotado';
            break;
        }
        setState(prev => ({
          ...prev,
          error: errorMessage,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
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
    checkGeofence,
  };
}
