import { Link, useLocation } from 'react-router-dom';
import { Clock3, CalendarDays, TriangleAlert, User, LogOut, Calendar } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmployeeShellProps {
  children: React.ReactNode;
}

const tabs = [
  { href: '/attendance', label: 'Marcar', icon: Clock3 },
  { href: '/history', label: 'Mi semana', icon: CalendarDays },
  { href: '/incidents', label: 'Incidencias', icon: TriangleAlert },
  { href: '/profile', label: 'Perfil', icon: User },
];

export function EmployeeShell({ children }: EmployeeShellProps) {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const todayLabel = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date());

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 px-4 pt-4">
        <div className="mx-auto max-w-md overflow-hidden rounded-3xl bg-gradient-to-r from-[#133A7C] via-[#1E4D92] to-[#2A9BB3] px-4 py-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-white/80">Control de Asistencia ELINEAS</p>
              <h1 className="text-sm font-semibold">Hola, {profile?.full_name?.split(' ')[0] || 'Empleado'}</h1>
              <p className="text-xs text-white/80 capitalize">Empleado</p>
            </div>
            <Button variant="outline" size="sm" onClick={signOut} className="h-8 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
              <LogOut className="mr-1 h-3.5 w-3.5" />
              Salir
            </Button>
          </div>
          <p className="mt-3 inline-flex items-center gap-1 text-xs text-white/85">
            <Calendar className="h-3.5 w-3.5" />
            {todayLabel}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-4">{children}</main>

      <nav className="fixed bottom-3 left-0 right-0 z-30 px-4">
        <div className="mx-auto grid max-w-md grid-cols-4 rounded-3xl border bg-card/95 shadow-lg backdrop-blur">
          {tabs.map((tab) => {
            const isActive = location.pathname === tab.href;
            return (
              <Link
                key={tab.href}
                to={tab.href}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <span className={cn('rounded-full p-1.5', isActive && 'bg-primary/10')}>
                  <tab.icon className={cn('h-4.5 w-4.5', isActive && 'text-primary')} />
                </span>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
