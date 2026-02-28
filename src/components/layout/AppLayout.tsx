import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  Calendar,
  PlaneTakeoff,
  History,
  Settings,
  Users,
  Building2,
  UserCog,
  ShieldCheck,
  User,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDepartments } from '@/hooks/useDepartments';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: AppRole[];
  excludeRoles?: AppRole[];
}

const navItems: NavItem[] = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard },
  { href: '/attendance', label: 'Marcar', icon: Clock, excludeRoles: ['global_manager', 'superadmin'] },
  { href: '/history', label: 'Mi Historial', icon: History, excludeRoles: ['global_manager', 'superadmin'] },
  { href: '/profile', label: 'Mi perfil', icon: User },
  { href: '/rest-schedule', label: 'Descansos', icon: Calendar },
  { href: '/vacations', label: 'Vacaciones', icon: PlaneTakeoff, excludeRoles: ['global_manager', 'superadmin'] },
  { href: '/department', label: 'Departamento', icon: Users, roles: ['department_head'] },
  { href: '/global', label: 'Panel Global', icon: Users, roles: ['global_manager', 'superadmin'] },
  { href: '/users', label: 'Usuarios', icon: UserCog, roles: ['global_manager', 'superadmin'] },
  { href: '/departments-admin', label: 'Departamentos', icon: Building2, roles: ['global_manager', 'superadmin'] },
  { href: '/configuration', label: 'Configuración', icon: Settings, roles: ['global_manager', 'superadmin'] },
  { href: '/superadmin', label: 'Superadmin', icon: ShieldCheck, roles: ['superadmin'] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, role, signOut } = useAuth();
  const { departments } = useDepartments();
  const location = useLocation();

  const departmentName = departments.find((department) => department.id === profile?.department_id)?.name;

  const filteredNavItems = navItems.filter((item) => {
    if (item.excludeRoles && role && item.excludeRoles.includes(role)) {
      return false;
    }
    if (item.roles && (!role || !item.roles.includes(role))) {
      return false;
    }
    return true;
  });

  const NavLinks = () => (
    <>
      {filteredNavItems.map((item) => {
        const isActive = location.pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setMobileMenuOpen(false)}
            className={cn(
              'group flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all duration-200',
              isActive
                ? 'border-primary/30 bg-primary text-primary-foreground shadow-sm'
                : 'border-transparent text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground'
            )}
          >
            <item.icon className="h-5 w-5 transition-transform group-hover:scale-105" />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card/95 backdrop-blur-md border-b z-50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo-control-asistencia.svg"
            alt="Control de Asistencia ELINEAS"
            className="h-8 w-8 rounded-md object-cover"
          />
          <span className="font-semibold text-sm leading-tight">Asistencia ELINEAS</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-background/70 backdrop-blur-sm z-40" onClick={() => setMobileMenuOpen(false)} />
      )}

      <aside
        className={cn(
          'lg:hidden fixed top-16 left-0 bottom-0 w-72 bg-card/95 backdrop-blur-md border-r z-50 transform transition-transform duration-200',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 space-y-2">
          <NavLinks />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-card/70">
          <div className="mb-3">
            <p className="font-medium text-sm">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{role?.replace('_', ' ')}</p>
            <p className="text-xs text-muted-foreground">Departamento: {departmentName || 'Sin departamento'}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-72 bg-card/95 backdrop-blur-md border-r">
        <div className="p-5 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <img
              src="/logo-control-asistencia.svg"
              alt="Control de Asistencia ELINEAS"
              className="h-12 w-12 rounded-lg object-cover shadow-sm"
            />
            <div className="min-w-0">
              <h1 className="font-bold text-base leading-tight">Control de Asistencia</h1>
              <p className="text-base leading-tight font-semibold text-primary">ELINEAS</p>
              <p className="text-xs text-muted-foreground">Plataforma de gestión de asistencia</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLinks />
        </nav>
        <div className="p-4 border-t bg-muted/20">
          <div className="mb-3">
            <p className="font-medium text-sm">{profile?.full_name}</p>
            <p className="text-xs text-muted-foreground capitalize">{role?.replace('_', ' ')}</p>
            <p className="text-xs text-muted-foreground">Departamento: {departmentName || 'Sin departamento'}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="lg:pl-72 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
