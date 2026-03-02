import { FormEvent, useMemo, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  INCIDENT_TYPES,
  IncidentStatus,
  IncidentType,
  buildIncidentErrorMessage,
  formatIncidentStatus,
  isSchemaNotReadyError,
} from '@/lib/incidents';

interface Incident {
  id: string;
  incident_type: IncidentType;
  requested_at: string;
  status: IncidentStatus;
  reason: string | null;
  manager_notes: string | null;
  reviewed_at: string | null;
}

export function EmployeeIncidentsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<IncidentType>('olvidé marcar');
  const [requestedAt, setRequestedAt] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [reason, setReason] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['incidents', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attendance_incidents')
        .select('id, incident_type, requested_at, status, reason, manager_notes, reviewed_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Incident[];
    },
    retry: false,
  });

  const schemaNotReady = useMemo(() => isSchemaNotReadyError(error), [error]);

  const filteredData = useMemo(
    () => (statusFilter === 'all' ? data || [] : (data || []).filter((item) => item.status === statusFilter)),
    [data, statusFilter]
  );

  const pendingCount = (data || []).filter((item) => item.status === 'pending').length;

  const mutation = useMutation({
    mutationFn: async () => {
      const normalizedReason = reason.trim();
      if ((type === 'olvidé marcar' || type === 'tardanza' || type === 'salida temprana') && !normalizedReason) {
        throw new Error('Debes indicar un motivo para este tipo de incidencia.');
      }

      const { error } = await supabase.from('attendance_incidents').insert({
        user_id: user!.id,
        incident_type: type,
        requested_at: new Date(requestedAt).toISOString(),
        reason: normalizedReason || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Incidencia enviada');
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['incidents', user?.id] });
    },
    onError: (error) => toast.error(buildIncidentErrorMessage(error)),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="space-y-4">
      {schemaNotReady && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="pt-6 text-sm">
            <p className="font-semibold text-warning">Incidencias requiere migración de base de datos</p>
            <p className="mt-1 text-muted-foreground">
              Ejecuta las migraciones pendientes (incluidas <code>20260228194000_add_attendance_incidents.sql</code> y <code>20260228202000_add_incident_review_fields.sql</code>) y recarga esta pantalla.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nueva incidencia</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <Select value={type} onValueChange={(value) => setType(value as IncidentType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="datetime-local" value={requestedAt} onChange={(e) => setRequestedAt(e.target.value)} required />
            <Textarea
              placeholder="Motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/300</p>
            <Button className="w-full" disabled={mutation.isPending || schemaNotReady}>
              {mutation.isPending ? 'Guardando...' : 'Nueva incidencia'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Mis incidencias</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Pendientes: {pendingCount}</Badge>
              <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isLoading}>
                Recargar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | IncidentStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Filtrar estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="approved">Aprobadas</SelectItem>
              <SelectItem value="rejected">Rechazadas</SelectItem>
            </SelectContent>
          </Select>

          {isLoading && <Skeleton className="h-20 w-full" />}
          {isError && <p className="text-sm text-destructive">{buildIncidentErrorMessage(error)}</p>}
          {!isLoading && !isError && filteredData.length === 0 && (
            <p className="text-sm text-muted-foreground">No tienes incidencias en este filtro.</p>
          )}

          {filteredData.map((item) => (
            <div key={item.id} className="rounded-xl border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold capitalize">{item.incident_type}</p>
                <Badge variant={item.status === 'approved' ? 'default' : item.status === 'rejected' ? 'destructive' : 'secondary'}>
                  {formatIncidentStatus(item.status)}
                </Badge>
              </div>
              <p className="text-muted-foreground">{format(new Date(item.requested_at), 'dd/MM/yyyy HH:mm')}</p>
              {item.reason && <p className="mt-1">Motivo: {item.reason}</p>}
              {item.manager_notes && <p className="mt-1 text-muted-foreground">Respuesta gestor: {item.manager_notes}</p>}
              {item.reviewed_at && <p className="mt-1 text-xs text-muted-foreground">Revisada: {format(new Date(item.reviewed_at), 'dd/MM/yyyy HH:mm')}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
