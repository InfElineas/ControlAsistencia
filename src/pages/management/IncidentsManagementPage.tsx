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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { IncidentStatus, buildIncidentErrorMessage, formatIncidentStatus } from '@/lib/incidents';
import { useNotifications } from '@/contexts/NotificationsContext';

interface IncidentRow {
  id: string;
  user_id: string;
  incident_type: string;
  requested_at: string;
  status: IncidentStatus;
  reason: string | null;
  manager_notes: string | null;
  reviewed_at: string | null;
}

interface ProfileRow {
  user_id: string;
  full_name: string;
  email: string;
  department_id: string;
  departments: { name: string } | null;
}

function statusVariant(status: IncidentStatus) {
  if (status === 'approved') return 'default';
  if (status === 'rejected') return 'destructive';
  return 'secondary';
}

export function IncidentsManagementPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const { createNotification } = useNotifications();
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | IncidentStatus>('pending');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['incidents-management', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: incidents, error } = await supabase
        .from('attendance_incidents')
        .select('id, user_id, incident_type, requested_at, status, reason, manager_notes, reviewed_at, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = (incidents || []) as (IncidentRow & { created_at?: string })[];
      const uniqueUsers = [...new Set(rows.map((item) => item.user_id))];

      let profileMap = new Map<string, ProfileRow>();
      if (uniqueUsers.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, full_name, email, department_id, departments(name)')
          .in('user_id', uniqueUsers);

        if (profilesError) throw profilesError;
        if (profiles) {
          profileMap = new Map((profiles as ProfileRow[]).map((p) => [p.user_id, p]));
        }
      }

      return rows.map((item) => ({
        ...item,
        employee: profileMap.get(item.user_id) || null,
      }));
    },
  });

  const filteredData = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (data || [])
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => {
        if (!normalizedSearch) return true;
        const employeeName = item.employee?.full_name?.toLowerCase() || '';
        const email = item.employee?.email?.toLowerCase() || '';
        const department = item.employee?.departments?.name?.toLowerCase() || '';
        const type = item.incident_type.toLowerCase();
        return employeeName.includes(normalizedSearch) || email.includes(normalizedSearch) || department.includes(normalizedSearch) || type.includes(normalizedSearch);
      })
      .sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
      });
  }, [data, search, statusFilter]);

  const pendingCount = useMemo(() => (data || []).filter((item) => item.status === 'pending').length, [data]);

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, userId }: { id: string; status: 'approved' | 'rejected'; userId: string }) => {
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
      void createNotification({
        userId: variables.userId,
        title: variables.status === 'approved' ? 'Incidencia aprobada' : 'Incidencia rechazada',
        message: variables.status === 'approved' ? 'Tu solicitud fue aprobada por un gestor.' : 'Tu solicitud fue rechazada por un gestor.',
        type: variables.status === 'approved' ? 'success' : 'warning',
        link: '/incidents',
      });
      queryClient.invalidateQueries({ queryKey: ['incidents-management', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    },
    onError: (error) => toast.error(buildIncidentErrorMessage(error)),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Bandeja de incidencias</CardTitle>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Recargar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Rol revisor: <span className="font-medium text-foreground">{role?.replace('_', ' ')}</span> · Pendientes: <span className="font-semibold text-foreground">{pendingCount}</span>
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | IncidentStatus)}>
              <SelectTrigger>
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="approved">Aprobadas</SelectItem>
                <SelectItem value="rejected">Rechazadas</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Buscar empleado/correo/depto/tipo" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isLoading && <Skeleton className="h-40 w-full" />}
      {isError && <p className="text-sm text-destructive">{buildIncidentErrorMessage(error)}</p>}

      {!isLoading && !isError && filteredData.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">No hay incidencias para el filtro actual.</CardContent>
        </Card>
      )}

      {filteredData.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold capitalize">{item.incident_type}</p>
                <p className="text-sm text-muted-foreground">
                  {item.employee?.full_name || 'Empleado'} · {item.employee?.email || 'sin email'} · {item.employee?.departments?.name || 'Sin departamento'}
                </p>
              </div>
              <Badge variant={statusVariant(item.status)}>{formatIncidentStatus(item.status)}</Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              Solicitud: {format(new Date(item.requested_at), 'dd/MM/yyyy HH:mm', { locale: es })}
            </p>

            {item.reason && <p className="text-sm">Motivo: {item.reason}</p>}

            <Textarea
              placeholder="Notas de revisión (opcional)"
              value={notesById[item.id] ?? item.manager_notes ?? ''}
              onChange={(event) => setNotesById((prev) => ({ ...prev, [item.id]: event.target.value }))}
              disabled={item.status !== 'pending'}
              maxLength={300}
            />

            {item.status === 'pending' ? (
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => reviewMutation.mutate({ id: item.id, status: 'approved', userId: item.user_id })}
                  disabled={reviewMutation.isPending}
                >
                  Aprobar
                </Button>
                <Button
                  className="flex-1"
                  variant="destructive"
                  onClick={() => reviewMutation.mutate({ id: item.id, status: 'rejected', userId: item.user_id })}
                  disabled={reviewMutation.isPending}
                >
                  Rechazar
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Revisada {item.reviewed_at ? format(new Date(item.reviewed_at), 'dd/MM/yyyy HH:mm', { locale: es }) : ''}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
