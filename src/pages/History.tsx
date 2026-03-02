import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { useUIMode } from '@/hooks/use-ui-mode';
import { EmployeeWeekPage } from '@/pages/employee/EmployeeWeekPage';
import { es } from 'date-fns/locale';

interface AttendanceRecord {
  id: string;
  mark_type: 'IN' | 'OUT';
  timestamp: string;
  inside_geofence: boolean;
  distance_to_center: number | null;
}

export default function History() {
  const { user, role } = useAuth();
  const uiMode = useUIMode(role);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [markedDates, setMarkedDates] = useState<Date[]>([]);

  const fetchRecords = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('attendance_marks')
      .select('*')
      .eq('user_id', user.id)
      .gte('timestamp', startOfDay.toISOString())
      .lte('timestamp', endOfDay.toISOString())
      .order('timestamp', { ascending: true });

    if (!error && data) {
      setRecords(data as AttendanceRecord[]);
    }
    setLoading(false);
  }, [selectedDate, user]);

  const fetchMarkedDates = useCallback(async () => {
    if (!user) return;

    const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
    const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

    const { data } = await supabase
      .from('attendance_marks')
      .select('timestamp')
      .eq('user_id', user.id)
      .gte('timestamp', startOfMonth.toISOString())
      .lte('timestamp', endOfMonth.toISOString());

    if (data) {
      const dates = [...new Set(data.map((r) => r.timestamp.split('T')[0]))].map(
        (d) => new Date(d)
      );
      setMarkedDates(dates);
    }
  }, [selectedDate, user]);

  useEffect(() => {
    if (user) {
      fetchRecords();
      fetchMarkedDates();
    }
  }, [user, fetchRecords, fetchMarkedDates]);

  const getDayStatus = (): 'PRESENTE' | 'AUSENTE' | null => {
    if (records.length === 0) return null;
    const hasIn = records.some((r) => r.mark_type === 'IN');
    return hasIn ? 'PRESENTE' : 'AUSENTE';
  };

  const getWorkHours = (): string => {
    const inMark = records.find((r) => r.mark_type === 'IN');
    const outMark = records.filter((r) => r.mark_type === 'OUT').pop();

    if (!inMark || !outMark) return '-';

    const inTime = new Date(inMark.timestamp);
    const outTime = new Date(outMark.timestamp);
    const diff = outTime.getTime() - inTime.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  };

  if (uiMode === 'employee') {
    return (
      <AppLayout>
        <EmployeeWeekPage />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Mi Historial</h1>
          <p className="text-muted-foreground">Revisa tu registro de asistencia</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
          {/* Calendar */}
          <Card>
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                locale={es}
                modifiers={{ marked: markedDates }}
                modifiersStyles={{
                  marked: { backgroundColor: 'hsl(var(--success) / 0.2)' },
                }}
                className="rounded-md"
              />
            </CardContent>
          </Card>

          {/* Day Details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {format(selectedDate, "EEEE, d 'de' MMMM", { locale: es })}
              </CardTitle>
              {getDayStatus() && <StatusBadge status={getDayStatus()!} />}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Sin registros para esta fecha</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-lg bg-secondary">
                      <p className="text-sm text-muted-foreground">Tiempo trabajado</p>
                      <p className="text-xl font-bold">{getWorkHours()}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-secondary">
                      <p className="text-sm text-muted-foreground">Marcajes</p>
                      <p className="text-xl font-bold">{records.length}</p>
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">Detalle</h4>
                    {records.map((record, index) => (
                      <div
                        key={record.id}
                        className="flex items-center gap-4 p-3 rounded-lg bg-secondary/50"
                      >
                        <div className="flex-shrink-0">
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              record.mark_type === 'IN'
                                ? 'bg-success/20 text-success'
                                : 'bg-primary/20 text-primary'
                            }`}
                          >
                            {record.mark_type === 'IN' ? 'Entrada' : 'Salida'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">
                            {format(new Date(record.timestamp), 'HH:mm:ss')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <MapPin className="h-4 w-4" />
                          <span
                            className={
                              record.inside_geofence ? 'text-success' : 'text-destructive'
                            }
                          >
                            {record.inside_geofence ? 'Dentro' : 'Fuera'}
                            {record.distance_to_center && ` (${record.distance_to_center}m)`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
