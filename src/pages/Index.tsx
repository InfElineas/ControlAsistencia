import { useEffect, type ElementType } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowRight,
  Building2,
  Calendar,
  CheckCircle,
  Clock,
  Loader2,
  PlaneTakeoff,
  Settings,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAttendance } from '@/hooks/useAttendance';
import { useRestSchedule } from '@/hooks/useRestSchedule';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface QuickAccessItem {
  label: string;
  description: string;
  icon: ElementType;
  route: string;
}

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

export default function Index() {
  const navigate = useNavigate();
  const { user, profile, role, loading: authLoading } = useAuth();
  const { todayMarks, lastMark } = useAttendance();
  const { isRestDay, currentSchedule } = useRestSchedule();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [authLoading, navigate, user]);

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
  const isGlobalManager = role === 'global_manager';
  const isDepartmentHead = role === 'department_head';

  const quickAccess: QuickAccessItem[] = [];
  if (!isGlobalManager) {
    quickAccess.push({
      label: 'Vacaciones',
      description: 'Solicitudes y saldo acumulado',
      icon: PlaneTakeoff,
      route: '/vacations',
    });
  }

  if (isGlobalManager) {
    quickAccess.push(
      {
        label: 'Descansos del personal',
        description: 'Configura descansos para trabajadores',
        icon: Calendar,
        route: '/rest-schedule',
      },
      {
        label: 'Panel global',
        description: 'Métricas y consolidado general',
        icon: Users,
        route: '/global',
      },
      {
        label: 'Usuarios',
        description: 'Gestión de cuentas y permisos',
        icon: UserCog,
        route: '/users',
      },
      {
        label: 'Configuración',
        description: 'Reglas y parámetros del sistema',
        icon: Settings,
        route: '/configuration',
      }
    );
  } else if (isDepartmentHead) {
    quickAccess.push({
      label: 'Mi departamento',
      description: 'Supervisión del equipo',
      icon: Building2,
      route: '/department',
    });
  }

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

        {!isGlobalManager && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="sm:col-span-2 lg:col-span-1 h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Estado de hoy</CardTitle>
              </CardHeader>
              <CardContent>
                {isRest && (
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-neutral/20">
                      <Calendar className="h-6 w-6 text-neutral" />
                    </div>
                    <div>
                      <p className="font-semibold text-neutral">Día de descanso</p>
                      <p className="text-sm text-muted-foreground">No es necesario marcar hoy</p>
                    </div>
                  </div>
                )}

                {!isRest && hasMarkedIn && (
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-success/20">
                      <CheckCircle className="h-6 w-6 text-success" />
                    </div>
                    <div>
                      <p className="font-semibold text-success">
                        {hasMarkedOut ? 'Jornada completada' : 'Entrada registrada'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {lastMark ? `Último marcaje: ${format(new Date(lastMark.timestamp), 'HH:mm')}` : 'Sin marcajes'}
                      </p>
                    </div>
                  </div>
                )}

                {!isRest && !hasMarkedIn && (
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-xl bg-warning/20">
                      <XCircle className="h-6 w-6 text-warning" />
                    </div>
                    <div>
                      <p className="font-semibold text-warning">Sin marcar</p>
                      <p className="text-sm text-muted-foreground">Recuerda marcar tu entrada</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {!isRest && (
              <Card className="group h-full cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate('/attendance')}>
                <CardContent className="p-6 h-full flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-primary/10">
                      <Clock className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">Marcar Asistencia</p>
                      <p className="text-sm text-muted-foreground">
                        {hasMarkedIn && !hasMarkedOut ? 'Registrar salida' : 'Registrar entrada'}
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary" />
                </CardContent>
              </Card>
            )}

            <Card className="group h-full cursor-pointer transition-all hover:shadow-lg" onClick={() => navigate('/rest-schedule')}>
              <CardContent className="p-6 h-full flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-accent/10">
                    <Calendar className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold">Mis Descansos</p>
                    <p className="text-sm text-muted-foreground">
                      {currentSchedule?.days_of_week.length
                        ? `${currentSchedule.days_of_week.length} días/semana`
                        : 'Sin configurar'}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-accent" />
              </CardContent>
            </Card>
          </div>
        )}

        {!isGlobalManager && todayMarks.length > 0 && (
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

        {quickAccess.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Accesos rápidos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {quickAccess.map((item) => (
                  <button
                    key={item.route}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="group w-full rounded-xl border p-4 text-left transition-all hover:border-primary/40 hover:bg-primary/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2">
                        <item.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                      </div>
                      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-primary" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
