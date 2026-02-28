import { Link, useLocation } from 'react-router-dom';
import { Clock3, CalendarDays, TriangleAlert, User, LogOut } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Control de Asistencia ELINEAS</p>
            <h1 className="text-sm font-semibold">Hola, {profile?.full_name?.split(' ')[0] || 'Empleado'}</h1>
          </div>
          <Button variant="outline" size="sm" onClick={signOut} className="h-9">
            <LogOut className="mr-2 h-4 w-4" />
            Salir
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-4 py-4">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t bg-card/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
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
                <tab.icon className={cn('h-5 w-5', isActive && 'text-primary')} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
