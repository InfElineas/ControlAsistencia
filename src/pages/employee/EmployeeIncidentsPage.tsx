import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

const INCIDENT_TYPES = ['olvidé marcar', 'tardanza', 'salida temprana', 'gps', 'geofence'] as const;

type IncidentType = (typeof INCIDENT_TYPES)[number];

interface Incident {
  id: string;
  incident_type: IncidentType;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
}

export function EmployeeIncidentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<IncidentType>('olvidé marcar');
  const [requestedAt, setRequestedAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [reason, setReason] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['incidents', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_incidents')
        .select('id, incident_type, requested_at, status, reason')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Incident[];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('attendance_incidents').insert({
        user_id: user!.id,
        incident_type: type,
        requested_at: new Date(requestedAt).toISOString(),
        reason: reason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Incidencia enviada');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['incidents', user?.id] });
    },
    onError: () => toast.error('No fue posible crear la incidencia'),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Nueva incidencia</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Select value={type} onValueChange={(value) => setType(value as IncidentType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="datetime-local" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} required />
            <Textarea placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button className="w-full" disabled={mutation.isPending}>{mutation.isPending ? 'Guardando...' : 'Nueva incidencia'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Mis incidencias</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <Skeleton className="h-20 w-full" />}
          {isError && <p className="text-sm text-destructive">Error al cargar incidencias.</p>}
          {(data || []).map((item) => (
            <div key={item.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold capitalize">{item.incident_type}</p>
                <p className="text-xs uppercase text-muted-foreground">{item.status}</p>
              </div>
              <p className="text-muted-foreground">{format(new Date(item.requested_at), 'dd/MM/yyyy HH:mm')}</p>
              {item.reason && <p className="mt-1">{item.reason}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
