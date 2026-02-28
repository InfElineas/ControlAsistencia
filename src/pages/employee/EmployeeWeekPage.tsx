import { useMemo, useState } from 'react';
import { addDays, endOfWeek, format, startOfWeek, subWeeks } from 'date-fns';
import { es } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Mark { id: string; timestamp: string; mark_type: 'IN' | 'OUT'; }

export function EmployeeWeekPage() {
  const { user } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const start = useMemo(() => startOfWeek(subWeeks(new Date(), weekOffset), { weekStartsOn: 1 }), [weekOffset]);
  const end = useMemo(() => endOfWeek(start, { weekStartsOn: 1 }), [start]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['employee-week', user?.id, start.toISOString()],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_marks')
        .select('id, timestamp, mark_type')
        .eq('user_id', user!.id)
        .gte('timestamp', start.toISOString())
        .lte('timestamp', end.toISOString())
        .order('timestamp', { ascending: true });
      if (error) throw error;
      return (data || []) as Mark[];
    },
  });

  const days = useMemo(() => {
    const byDate = new Map<string, Mark[]>();
    (data || []).forEach((item) => {
      const key = item.timestamp.slice(0, 10);
      byDate.set(key, [...(byDate.get(key) || []), item]);
    });

    return Array.from({ length: 7 }).map((_, index) => {
      const date = addDays(start, index);
      const key = format(date, 'yyyy-MM-dd');
      const marks = byDate.get(key) || [];
      const inMark = marks.find((m) => m.mark_type === 'IN');
      const outMark = [...marks].reverse().find((m) => m.mark_type === 'OUT');
      const status = inMark && outMark ? '✅ completo' : marks.length ? '⚠️ incompleto' : '❌ incidencia';
      return { key, date, marks, inMark, outMark, status };
    });
  }, [data, start]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="outline" onClick={() => setWeekOffset((v) => v + 1)}>Semana anterior</Button>
        <p className="text-sm font-medium">{format(start, 'd MMM', { locale: es })} - {format(end, 'd MMM', { locale: es })}</p>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <p className="text-sm text-destructive">No fue posible cargar tu semana.</p>}

      {days.map((day) => (
        <Card key={day.key} className="cursor-pointer" onClick={() => setSelectedDate(day.key)}>
          <CardContent className="flex items-center justify-between p-4 text-sm">
            <div>
              <p className="font-semibold capitalize">{format(day.date, 'EEEE d', { locale: es })}</p>
              <p className="text-muted-foreground">Entrada: {day.inMark ? format(new Date(day.inMark.timestamp), 'HH:mm') : '--:--'} · Salida: {day.outMark ? format(new Date(day.outMark.timestamp), 'HH:mm') : '--:--'}</p>
            </div>
            <span>{day.status}</span>
          </CardContent>
        </Card>
      ))}

      {selectedDate && (
        <Card>
          <CardHeader><CardTitle className="text-base">Detalle {selectedDate}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(days.find((d) => d.key === selectedDate)?.marks || []).map((mark) => (
              <p key={mark.id}>{mark.mark_type === 'IN' ? 'Entrada' : 'Salida'} - {format(new Date(mark.timestamp), 'HH:mm:ss')}</p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
