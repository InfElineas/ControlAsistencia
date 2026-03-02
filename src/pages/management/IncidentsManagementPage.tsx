import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface IncidentRow {
  id: string;
  user_id: string;
  incident_type: string;
  requested_at: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string | null;
  manager_notes: string | null;
  reviewed_at: string | null;
}

interface ProfileRow {
  user_id: string;
  full_name: string;
  email: string;
}

function statusVariant(status: IncidentRow['status']) {
  if (status === 'approved') return 'default';
  if (status === 'rejected') return 'destructive';
  return 'secondary';
}

export function IncidentsManagementPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['incidents-management', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: incidents, error } = await supabase
        .from('attendance_incidents')
        .select('id, user_id, incident_type, requested_at, status, reason, manager_notes, reviewed_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (incidents || []) as IncidentRow[];
      const uniqueUsers = [...new Set(rows.map((item) => item.user_id))];

      let profileMap = new Map<string, ProfileRow>();
      if (uniqueUsers.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .in('user_id', uniqueUsers);

        if (!profilesError && profiles) {
          profileMap = new Map((profiles as ProfileRow[]).map((p) => [p.user_id, p]));
        }
      }

      return rows.map((item) => ({
        ...item,
        employee: profileMap.get(item.user_id) || null,
      }));
    },
  });

  const pendingCount = useMemo(() => (data || []).filter((item) => item.status === 'pending').length, [data]);

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'approved' | 'rejected' }) => {
      const notes = (notesById[id] || '').trim();
      const { error } = await supabase
        .from('attendance_incidents')
        .update({
          status,
          manager_notes: notes || null,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'approved' ? 'Incidencia aprobada' : 'Incidencia rechazada');
      queryClient.invalidateQueries({ queryKey: ['incidents-management', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: () => toast.error('No fue posible actualizar la incidencia'),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Bandeja de incidencias</CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Rol revisor: <span className="font-medium text-foreground">{role?.replace('_', ' ')}</span> · Pendientes: <span className="font-semibold text-foreground">{pendingCount}</span>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <p className="text-sm text-destructive">No fue posible cargar las incidencias para revisión.</p>}

      {(data || []).map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold capitalize">{item.incident_type}</p>
                <p className="text-sm text-muted-foreground">
                  {item.employee?.full_name || 'Empleado'} · {item.employee?.email || 'sin email'}
                </p>
              </div>
              <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Solicitud: {format(new Date(item.requested_at), "dd/MM/yyyy HH:mm", { locale: es })}
            </p>

            {item.reason && <p className="text-sm">Motivo: {item.reason}</p>}

            <Textarea
              placeholder="Notas de revisión (opcional)"
              value={notesById[item.id] ?? item.manager_notes ?? ''}
              onChange={(event) => setNotesById((prev) => ({ ...prev, [item.id]: event.target.value }))}
              disabled={item.status !== 'pending'}
            />

            {item.status === 'pending' ? (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => reviewMutation.mutate({ id: item.id, status: 'approved' })}
                  disabled={reviewMutation.isPending}
                >
                  Aprobar
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={() => reviewMutation.mutate({ id: item.id, status: 'rejected' })}
                  disabled={reviewMutation.isPending}
                >
                  Rechazar
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Revisada {item.reviewed_at ? format(new Date(item.reviewed_at), "dd/MM/yyyy HH:mm", { locale: es }) : ''}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
