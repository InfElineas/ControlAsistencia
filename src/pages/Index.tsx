import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bell,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  TriangleAlert,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { useRestSchedule } from '@/hooks/useRestSchedule';
import { useNotifications } from '@/contexts/NotificationsContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function getMarkBadgeClass(markType: 'IN' | 'OUT'): string {
  return markType === 'IN' ? 'bg-success' : 'bg-primary';
}

function getMarkLabel(markType: 'IN' | 'OUT'): string {
  return markType === 'IN' ? 'Entrada' : 'Salida';
}

function getGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

interface AdminDashboardStats {
  employees: number;
  departments: number;
  pendingIncidents: number;
}

export default function Index() {
  const navigate = useNavigate();
  const { user, profile, role, loading: authLoading } = useAuth();
  const { todayMarks, lastMark } = useAttendance();
  const { isRestDay, currentSchedule } = useRestSchedule();
  const { unreadCount } = useNotifications();

  const isGlobalManager = role === 'global_manager' || role === 'superadmin';
  const isDepartmentHead = role === 'department_head';

  const [adminStats, setAdminStats] = useState<AdminDashboardStats | null>(null);
  const [loadingAdminStats, setLoadingAdminStats] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (!user?.id || isGlobalManager || currentSchedule) return;

    const now = new Date();
    const day = now.getDay();
    const mondayDistance = day === 0 ? 6 : day - 1;
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - mondayDistance);
    const weekKey = weekStartDate.toISOString().slice(0, 10);
    const reminderKey = `rest-reminder-${user.id}-${weekKey}`;

    if (localStorage.getItem(reminderKey)) return;

    toast.warning('Debes marcar tus días de descanso de esta semana en "Mis Descansos".');
    localStorage.setItem(reminderKey, '1');
  }, [currentSchedule, isGlobalManager, user?.id]);

  useEffect(() => {
    if (!isGlobalManager) {
      setAdminStats(null);
      return;
    }

    const fetchAdminStats = async () => {
      setLoadingAdminStats(true);

      const [{ count: employees }, { count: departments }, incidentsResp] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('departments').select('id', { count: 'exact', head: true }),
        supabase
          .from('attendance_incidents')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      setAdminStats({
        employees: employees ?? 0,
        departments: departments ?? 0,
        pendingIncidents: incidentsResp.count ?? 0,
      });

      setLoadingAdminStats(false);
    };

    void fetchAdminStats();
  }, [isGlobalManager]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const today = new Date();
  const isRest = isRestDay(today);
  const hasMarkedIn = todayMarks.some((mark) => mark.mark_type === 'IN');
  const hasMarkedOut = todayMarks.some((mark) => mark.mark_type === 'OUT');

  const attendanceStatus = useMemo(() => {
    if (isRest) {
      return {
        title: 'Día de descanso',
        description: 'No necesitas marcar asistencia hoy.',
        icon: CheckCircle,
        tone: 'text-neutral',
      };
    }

    if (!hasMarkedIn) {
      return {
        title: 'Pendiente marcar entrada',
        description: 'Aún no registras entrada hoy.',
        icon: XCircle,
        tone: 'text-warning',
      };
    }

    if (!hasMarkedOut) {
      return {
        title: 'En jornada',
        description: `Último marcaje: ${lastMark ? format(new Date(lastMark.timestamp), 'HH:mm') : 'Sin dato'}`,
        icon: Clock,
        tone: 'text-primary',
      };
    }

    return {
      title: 'Jornada completada',
      description: `Último marcaje: ${lastMark ? format(new Date(lastMark.timestamp), 'HH:mm') : 'Sin dato'}`,
      icon: CheckCircle,
      tone: 'text-success',
    };
  }, [hasMarkedIn, hasMarkedOut, isRest, lastMark]);

  const primaryActionLabel = isGlobalManager
    ? 'Ver panel global'
    : hasMarkedIn && !hasMarkedOut
      ? 'Registrar salida'
      : 'Registrar entrada';

  const primaryActionRoute = isGlobalManager ? '/global' : '/attendance';

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
        <Card className="overflow-hidden border-0 shadow-sm" style={{ background: 'var(--gradient-hero)' }}>
          <CardContent className="p-6">
            <div className="text-white">
              <p className="text-white/80">{getGreeting(today)}</p>
              <h1 className="text-2xl font-bold mt-1">{profile?.full_name}</h1>
              <p className="text-white/70 text-sm mt-1 capitalize">{role?.replace('_', ' ')}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-white/80 text-sm">
              <Calendar className="h-4 w-4" />
              <span>{format(today, "EEEE, d 'de' MMMM yyyy", { locale: es })}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Estado de hoy</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <attendanceStatus.icon className={cn('h-5 w-5', attendanceStatus.tone)} />
                <div>
                  <p className={cn('font-semibold', attendanceStatus.tone)}>{attendanceStatus.title}</p>
                  <p className="text-xs text-muted-foreground">{attendanceStatus.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Notificaciones</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold leading-none">{unreadCount}</p>
                <p className="text-xs text-muted-foreground">sin leer</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Acción principal</CardTitle>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => navigate(primaryActionRoute)}>
                {primaryActionLabel}
              </Button>
            </CardContent>
          </Card>
        </div>

        {isGlobalManager ? (
          <Card>
            <CardHeader>
              <CardTitle>Resumen ejecutivo</CardTitle>
            </CardHeader>
            <CardContent>
              {loadingAdminStats ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando métricas...
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Trabajadores registrados</p>
                    <p className="text-2xl font-bold">{adminStats?.employees ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Departamentos activos</p>
                    <p className="text-2xl font-bold">{adminStats?.departments ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Incidencias pendientes</p>
                    <p className="text-2xl font-bold">{adminStats?.pendingIncidents ?? 0}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {todayMarks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Marcajes de hoy</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {todayMarks.map((mark) => (
                      <div key={mark.id} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary">
                        <span className={cn('w-2 h-2 rounded-full', getMarkBadgeClass(mark.mark_type))} />
                        <span className="font-medium">{getMarkLabel(mark.mark_type)}</span>
                        <span className="text-muted-foreground">{format(new Date(mark.timestamp), 'HH:mm')}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Panel operativo</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" onClick={() => navigate('/incidents')}>
                  {role === 'employee' ? 'Ver mis incidencias' : 'Gestionar incidencias'}
                </Button>
                <Button variant="outline" onClick={() => navigate('/rest-schedule')}>
                  Gestionar descansos
                </Button>
                {!isGlobalManager && (
                  <Button variant="outline" onClick={() => navigate('/vacations')}>
                    Vacaciones
                  </Button>
                )}
                {isDepartmentHead && (
                  <Button variant="outline" onClick={() => navigate('/department')}>
                    Ver departamento
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {isGlobalManager && (
          <Card>
            <CardHeader>
              <CardTitle>Atajos de gestión</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="outline" onClick={() => navigate('/users')}>
                <Users className="h-4 w-4 mr-2" />
                Usuarios
              </Button>
              <Button variant="outline" onClick={() => navigate('/departments-admin')}>
                <Building2 className="h-4 w-4 mr-2" />
                Departamentos
              </Button>
              <Button variant="outline" onClick={() => navigate('/configuration')}>
                Configuración
              </Button>
              {role === 'superadmin' && (
                <Button variant="outline" onClick={() => navigate('/superadmin')}>
                  Consola superadmin
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
