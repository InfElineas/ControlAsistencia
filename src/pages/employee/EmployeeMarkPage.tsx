import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/mobile/StatusPill';
import { PrimaryActionButton } from '@/components/mobile/PrimaryActionButton';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useGeofenceConfig } from '@/hooks/useGeofenceConfig';
import { useAttendance } from '@/hooks/useAttendance';
import { useDepartmentSchedule } from '@/hooks/useDepartmentSchedule';
import { mapAttendanceError } from '@/lib/error-messages';
import { toast } from 'sonner';
import { useWorkLocations } from '@/hooks/useWorkLocations';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function EmployeeMarkPage() {
  const { config, loading: configLoading } = useGeofenceConfig();
  const { schedule, isWithinCheckinWindow, loading: scheduleLoading } = useDepartmentSchedule();
  const { latitude, longitude, accuracy, error: geoError, loading: geoLoading, getCurrentPosition, checkGeofence } = useGeolocation();
  const { todayMarks, canMarkIn, canMarkOut, loading, markAttendance } = useAttendance();
  const { locations, activeLocationId, setActiveLocation } = useWorkLocations();
  const [marking, setMarking] = useState(false);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    getCurrentPosition();
  }, [getCurrentPosition]);

  const geofence = useMemo(() => {
    if (!config || !latitude || !longitude) return null;
    return checkGeofence({
      centerLat: config.center_lat,
      centerLng: config.center_lng,
      radiusMeters: config.radius_meters,
      accuracyThreshold: config.accuracy_threshold,
    });
  }, [checkGeofence, config, latitude, longitude]);

  const hasIn = todayMarks.some((item) => item.mark_type === 'IN');
  const hasOut = todayMarks.some((item) => item.mark_type === 'OUT');
  const checkinState = isWithinCheckinWindow();

  const action = hasIn && hasOut ? 'done' : canMarkOut ? 'OUT' : 'IN';
  const label = action === 'IN' ? 'MARCAR ENTRADA' : action === 'OUT' ? 'MARCAR SALIDA' : 'JORNADA COMPLETA';

  const onMark = async () => {
    if (action === 'done') return;

    if (!activeLocationId) {
      toast.error('Selecciona una ubicación de trabajo para continuar');
      return;
    }

    if (action === 'IN' && !geofence?.isInside) {
      toast.error('Fuera de geofence', { description: 'Solicita un marcaje manual desde incidencias.' });
      return;
    }

    setMarking(true);
    const { error, message } = await markAttendance(action, {
      latitude,
      longitude,
      accuracy,
      distanceToCenter: geofence?.distance ?? null,
      insideGeofence: geofence?.isInside ?? false,
      workLocationId: activeLocationId,
    });

    if (error) {
      toast.error(mapAttendanceError(error), {
        description: error.includes('geofence')
          ? 'CTA: Solicitar marcaje manual'
          : error.includes('horario')
            ? 'CTA: Solicitar excepción'
            : undefined,
      });
    } else {
      toast.success(message || `${action === 'IN' ? 'Entrada' : 'Salida'} registrada ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
    }

    setMarking(false);
  };

  if (loading || configLoading || scheduleLoading) {
    return <Skeleton className="h-72 w-full rounded-2xl" />;
  }

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Marcar asistencia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-center text-4xl font-bold tabular-nums">{now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>
          <div className="space-y-2">
            <p className="text-sm font-medium">Ubicación de trabajo</p>
            <Select value={activeLocationId ?? ''} onValueChange={setActiveLocation}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una ubicación" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap gap-2">
            {!geoError && geofence?.isInside && <StatusPill tone="ok">Dentro ✅</StatusPill>}
            {!geoError && geofence && !geofence.isInside && <StatusPill tone="error">Fuera ❌</StatusPill>}
            {geoError && <StatusPill tone="warning">GPS apagado ⚠️</StatusPill>}
            {checkinState.allowed ? (
              <StatusPill tone="ok">A tiempo ✅</StatusPill>
            ) : (
              <StatusPill tone="warning">Tarde ⚠️</StatusPill>
            )}
          </div>
          <PrimaryActionButton label={label} onClick={onMark} disabled={action === 'done' || geoLoading || !activeLocationId} loading={marking} />
          {action === 'done' && <p className="text-center text-sm text-success">Ya registraste entrada y salida hoy.</p>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm"><Link to="/incidents">Crear incidencia</Link></Button>
        {!geoError && geofence && !geofence.isInside && (
          <Button variant="secondary" size="sm" onClick={getCurrentPosition} disabled={geoLoading}>
            {geoLoading ? 'Recalculando...' : 'Recalcular'}
          </Button>
        )}
        <Button asChild variant="secondary" size="sm"><Link to="/rest-schedule">Ver horario</Link></Button>
        <Button asChild variant="secondary" size="sm"><Link to="/history">Ver mis marcajes</Link></Button>
      </div>

      {schedule && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Ventana de entrada: {schedule.checkin_start_time.slice(0, 5)} - {schedule.checkin_end_time.slice(0, 5)}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
