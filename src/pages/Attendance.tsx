import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGeolocation } from '@/hooks/useGeolocation';
import { useGeofenceConfig } from '@/hooks/useGeofenceConfig';
import { useAttendance } from '@/hooks/useAttendance';
import { useRestSchedule } from '@/hooks/useRestSchedule';
import { useGlobalManagerCheck } from '@/hooks/useGlobalManagerCheck';
import { useDepartmentSchedule } from '@/hooks/useDepartmentSchedule';
import { AppLayout } from '@/components/layout/AppLayout';
import { GeofenceIndicator } from '@/components/attendance/GeofenceIndicator';
import { AttendanceButton } from '@/components/attendance/AttendanceButton';
import { TodayMarks } from '@/components/attendance/TodayMarks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Calendar, ShieldX, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { mapAttendanceError } from '@/lib/error-messages';
import { useUIMode } from '@/hooks/use-ui-mode';
import { EmployeeMarkPage } from '@/pages/employee/EmployeeMarkPage';

export default function Attendance() {
  const { profile, role } = useAuth();
  const { isRestDay } = useRestSchedule();
  const { config, loading: configLoading } = useGeofenceConfig();
  const { isGlobalManager, loading: gmLoading } = useGlobalManagerCheck();
  const {
    schedule,
    isWithinCheckinWindow,
    getCurrentTimeLabel,
    loading: scheduleLoading,
  } = useDepartmentSchedule();
  const {
    latitude,
    longitude,
    accuracy,
    error: geoError,
    loading: geoLoading,
    getCurrentPosition,
    checkGeofence,
  } = useGeolocation();
  const {
    todayMarks,
    canMarkIn,
    canMarkOut,
    loading: attendanceLoading,
    markAttendance,
  } = useAttendance();

  const uiMode = useUIMode(role);
  const [marking, setMarking] = useState(false);
  const [geofenceResult, setGeofenceResult] = useState<{
    isInside: boolean;
    distance: number;
    accuracyOk: boolean;
  } | null>(null);

  // Check geofence when location updates
  useEffect(() => {
    if (config && latitude && longitude) {
      const result = checkGeofence({
        centerLat: config.center_lat,
        centerLng: config.center_lng,
        radiusMeters: config.radius_meters,
        accuracyThreshold: config.accuracy_threshold,
      });
      setGeofenceResult(result);
    }
  }, [config, latitude, longitude, accuracy, checkGeofence]);

  // Get location on mount
  useEffect(() => {
    getCurrentPosition();
  }, [getCurrentPosition]);

  const today = new Date();
  const isRest = isRestDay(today);
  const checkinCheck = isWithinCheckinWindow();
  
  const canMarkInAction = !isGlobalManager && !isRest && Boolean(geofenceResult?.isInside) && canMarkIn;
  const canMarkOutAction = !isGlobalManager && !isRest && canMarkOut;

  const handleMark = async (type: 'IN' | 'OUT') => {
    if (isGlobalManager) {
      toast.error('No autorizado para registrar asistencia o descansos');
      return;
    }

    if (type === 'IN' && !geofenceResult?.isInside) {
      toast.error('No puedes marcar fuera de la zona permitida');
      return;
    }

    if (isRest) {
      toast.error('Hoy es tu día de descanso');
      return;
    }

    setMarking(true);
    const { error, message } = await markAttendance(type, {
      latitude,
      longitude,
      accuracy,
      distanceToCenter: geofenceResult?.distance ?? null,
      insideGeofence: geofenceResult?.isInside ?? false,
    });

    if (error) {
      toast.error(mapAttendanceError(error));
    } else {
      toast.success(message || `${type === 'IN' ? 'Entrada' : 'Salida'} registrada correctamente`);
    }
    setMarking(false);
  };

  const isLoading = configLoading || gmLoading || scheduleLoading;

  if (uiMode === 'employee') {
    return (
      <AppLayout>
        <EmployeeMarkPage />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto space-y-6 animate-fade-in">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Marcar Asistencia</h1>
          <p className="text-muted-foreground mt-1">
            {today.toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
        </div>

        {/* Global Manager Warning */}
        {isGlobalManager && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <ShieldX className="h-6 w-6 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Acceso restringido</p>
              <p className="text-sm text-muted-foreground">
                Los gestores globales no pueden registrar asistencia o descansos
              </p>
            </div>
          </div>
        )}

        {/* Schedule Info */}
        {!isGlobalManager && schedule && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
            <Clock className="h-5 w-5 text-primary" />
            <div>
              <p className="font-medium text-primary">Horario de entrada</p>
              <p className="text-sm text-muted-foreground">
                Entrada: {schedule.checkin_start_time.slice(0, 5)} - {schedule.checkin_end_time.slice(0, 5)}
              </p>
              <p className="text-xs text-muted-foreground">Hora actual: {getCurrentTimeLabel()}</p>
            </div>
          </div>
        )}

        {/* No Schedule Warning */}
        {!isGlobalManager && !isLoading && !schedule && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
            <AlertCircle className="h-6 w-6 text-warning" />
            <div>
              <p className="font-medium text-warning">Sin horario configurado</p>
              <p className="text-sm text-muted-foreground">
                Tu departamento no tiene un horario asignado. Contacta al administrador.
              </p>
            </div>
          </div>
        )}

        {/* Rest Day Warning */}
        {isRest && !isGlobalManager && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-neutral/10 border border-neutral/20">
            <Calendar className="h-6 w-6 text-neutral" />
            <div>
              <p className="font-medium text-neutral">Día de descanso</p>
              <p className="text-sm text-muted-foreground">
                No es necesario marcar asistencia hoy
              </p>
            </div>
          </div>
        )}

        {/* Geofence Status - only show for non-GMs */}
        {!isGlobalManager && (
          <GeofenceIndicator
            isInside={geofenceResult?.isInside ?? null}
            distance={geofenceResult?.distance ?? null}
            accuracy={accuracy ? Math.round(accuracy) : null}
            loading={geoLoading || configLoading}
            error={geoError}
            onRefresh={getCurrentPosition}
          />
        )}

        {/* Warning if outside - only show for non-GMs */}
        {!isGlobalManager && geofenceResult && !geofenceResult.isInside && !isRest && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">
              Debes estar dentro de la zona para marcar asistencia
            </p>
          </div>
        )}

        {/* Schedule Warning for Check-in */}
        {!isGlobalManager && canMarkIn && !checkinCheck.allowed && !isRest && schedule && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20">
            <Clock className="h-5 w-5 text-warning" />
            <p className="text-sm text-warning">
              {checkinCheck.message}
            </p>
          </div>
        )}

        {/* Attendance Buttons - only show for non-GMs */}
        {!isGlobalManager && !isRest && (
          <div className="flex flex-col items-center gap-4">
            {canMarkIn && (
              <AttendanceButton
                type="IN"
                disabled={!canMarkInAction}
                loading={marking}
                onClick={() => handleMark('IN')}
              />
            )}
            {canMarkOut && (
              <AttendanceButton
                type="OUT"
                disabled={!canMarkOutAction}
                loading={marking}
                onClick={() => handleMark('OUT')}
              />
            )}
          </div>
        )}

        {/* Today's Marks */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Registro de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <TodayMarks marks={todayMarks} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
