import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, MapPin, Crosshair, ShieldAlert } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useGeofenceConfig } from '@/hooks/useGeofenceConfig';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

function formatCoordinate(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(6);
}

export default function GpsDiagnostics() {
  const {
    latitude,
    longitude,
    accuracy,
    error,
    loading,
    getCurrentPosition,
    checkGeofence,
  } = useGeolocation();
  const { config, loading: configLoading } = useGeofenceConfig();
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [gpsEnabled, setGpsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    getCurrentPosition();
  }, [getCurrentPosition]);

  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      setLastUpdatedAt(new Date());
      setGpsEnabled(true);
    }
  }, [latitude, longitude]);

  useEffect(() => {
    if (!error) return;
    setGpsEnabled(false);
  }, [error]);

  const geofenceResult = useMemo(() => {
    if (!config) return null;
    return checkGeofence({
      centerLat: config.center_lat,
      centerLng: config.center_lng,
      radiusMeters: config.radius_meters,
      accuracyThreshold: config.accuracy_threshold,
    });
  }, [checkGeofence, config]);

  const openMapsUrl =
    latitude !== null && longitude !== null
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : null;

  const requestEnableGps = async () => {
    const appPlugin = window.Capacitor?.Plugins?.App as { openSettings?: () => Promise<void> } | undefined;

    try {
      if (appPlugin?.openSettings) {
        await appPlugin.openSettings();
      }
      getCurrentPosition();
    } catch {
      getCurrentPosition();
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Mi ubicación GPS actual
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta pantalla muestra la ubicación que reporta el GPS del dispositivo. Si estás fuera de zona,
              puedes recalcular para mejorar la precisión.
            </p>

            <div className="flex items-center gap-2 rounded-xl border p-3">
              <Checkbox
                id="gps-enabled"
                checked={Boolean(gpsEnabled)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    void requestEnableGps();
                    return;
                  }
                  setGpsEnabled(false);
                }}
              />
              <Label htmlFor="gps-enabled" className="text-sm">
                GPS activado
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Si está desactivado, marca la casilla para intentar abrir los ajustes del dispositivo desde la app.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Latitud</p>
                <p className="font-semibold">{formatCoordinate(latitude)}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Longitud</p>
                <p className="font-semibold">{formatCoordinate(longitude)}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Precisión</p>
                <p className="font-semibold">{accuracy !== null ? `± ${Math.round(accuracy)} m` : '—'}</p>
              </div>
              <div className="rounded-xl border p-3">
                <p className="text-xs text-muted-foreground">Última actualización</p>
                <p className="font-semibold">
                  {lastUpdatedAt ? lastUpdatedAt.toLocaleTimeString('es-PE') : '—'}
                </p>
              </div>
            </div>

            {geofenceResult && (
              <div className="rounded-xl border p-3">
                <p className="text-sm font-medium">Estado de zona</p>
                <p className="text-sm text-muted-foreground">
                  Distancia al centro: <strong>{geofenceResult.distance} m</strong> · Radio permitido:{' '}
                  <strong>{config?.radius_meters ?? 0} m</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Resultado: {geofenceResult.isInside ? 'Dentro de la zona' : 'Fuera de la zona'} · Precisión:{' '}
                  {geofenceResult.accuracyOk ? 'Aceptable' : 'Baja'}
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={getCurrentPosition} disabled={loading || configLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                {loading ? 'Recalculando...' : 'Recalcular ubicación'}
              </Button>
              {openMapsUrl && (
                <Button variant="outline" asChild>
                  <a href={openMapsUrl} target="_blank" rel="noreferrer">
                    <Crosshair className="mr-2 h-4 w-4" />
                    Ver en mapa
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
