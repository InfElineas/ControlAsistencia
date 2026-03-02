import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  Timer,
  TriangleAlert as AlertTriangleIcon,
  Users,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { useRestSchedule } from '@/hooks/useRestSchedule';
import { useUIMode } from '@/hooks/use-ui-mode';
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
  todayMarks: number;
}

export default function Index() {
  const navigate = useNavigate();
  const { user, profile, role, loading: authLoading } = useAuth();
  const { todayMarks, lastMark } = useAttendance();
  const { isRestDay, currentSchedule } = useRestSchedule();
  const { unreadCount } = useNotifications();
  const uiMode = useUIMode(role ?? null);

  const isGlobalManager = role === 'global_manager' || role === 'superadmin';

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
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [{ count: employees }, { count: departments }, incidentsResp, marksResp] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('departments').select('id', { count: 'exact', head: true }),
        supabase
          .from('attendance_incidents')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('attendance_marks')
          .select('id', { count: 'exact', head: true })
          .gte('timestamp', todayStart.toISOString()),
      ]);

      setAdminStats({
        employees: employees ?? 0,
        departments: departments ?? 0,
        pendingIncidents: incidentsResp.count ?? 0,
        todayMarks: marksResp.count ?? 0,
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

  const inMarks = todayMarks
    .filter((mark) => mark.mark_type === 'IN')
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const outMarks = todayMarks
    .filter((mark) => mark.mark_type === 'OUT')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const attendanceStatus = (() => {
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
  })();

  const primaryActionLabel = isGlobalManager
    ? 'Ir al panel global'
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
              <p className="text-white/70 text-sm mt-1 capitalize">{role?.replace('_', ' ')} · modo {uiMode}</p>
            </div>
            <div className="mt-4 flex items-center gap-2 text-white/80 text-sm">
              <Calendar className="h-4 w-4" />
              <span>{format(today, "EEEE, d 'de' MMMM yyyy", { locale: es })}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-4">
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
              <CardTitle className="text-sm text-muted-foreground">Marcajes de hoy</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Timer className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold leading-none">{todayMarks.length}</p>
                <p className="text-xs text-muted-foreground">registros</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Primera entrada</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold">{inMarks[0] ? format(new Date(inMarks[0].timestamp), 'HH:mm') : '--:--'}</p>
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
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Resumen del día</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Última salida</p>
              <p className="text-2xl font-bold">{outMarks[0] ? format(new Date(outMarks[0].timestamp), 'HH:mm') : '--:--'}</p>
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Horario de descanso</p>
              <p className="text-2xl font-bold">{isRest ? 'Sí' : 'No'}</p>
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <p className="text-xs text-muted-foreground">Incidencias pendientes</p>
              <p className="text-2xl font-bold">{isGlobalManager ? adminStats?.pendingIncidents ?? 0 : 'Revisar en Incidencias'}</p>
            </div>
          </CardContent>
        </Card>

        {isGlobalManager && (
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
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Trabajadores</p>
                    <p className="text-2xl font-bold">{adminStats?.employees ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Departamentos</p>
                    <p className="text-2xl font-bold">{adminStats?.departments ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Marcajes hoy</p>
                    <p className="text-2xl font-bold">{adminStats?.todayMarks ?? 0}</p>
                  </div>
                  <div className="rounded-xl bg-secondary p-4">
                    <p className="text-xs text-muted-foreground">Incidencias pendientes</p>
                    <p className="text-2xl font-bold">{adminStats?.pendingIncidents ?? 0}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {!isGlobalManager && todayMarks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Detalle de marcajes de hoy</CardTitle>
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
            <CardTitle>Acción recomendada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full md:w-auto" onClick={() => navigate(primaryActionRoute)}>
              {primaryActionLabel}
            </Button>
            <p className="text-xs text-muted-foreground">
              El resto de módulos se gestionan desde el menú lateral para mantener esta pantalla centrada en métricas.
            </p>
          </CardContent>
        </Card>

        {isGlobalManager && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alertas de gestión</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon className="h-4 w-4 text-warning" />
                Incidencias pendientes: <span className="font-semibold">{adminStats?.pendingIncidents ?? 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Personal registrado: <span className="font-semibold">{adminStats?.employees ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
