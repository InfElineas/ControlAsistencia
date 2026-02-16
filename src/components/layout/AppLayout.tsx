import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Clock,
  Calendar,
  PlaneTakeoff,
  History,
  Settings,
  Users,
  UserCog,
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
  { href: '/attendance', label: 'Marcar', icon: Clock, excludeRoles: ['global_manager'] },
  { href: '/history', label: 'Mi Historial', icon: History, excludeRoles: ['global_manager'] },
  { href: '/rest-schedule', label: 'Descansos', icon: Calendar },
  { href: '/vacations', label: 'Vacaciones', icon: PlaneTakeoff, excludeRoles: ['global_manager'] },
  { href: '/department', label: 'Departamento', icon: Users, roles: ['department_head'] },
  { href: '/global', label: 'Panel Global', icon: Users, roles: ['global_manager'] },
  { href: '/users', label: 'Usuarios', icon: UserCog, roles: ['global_manager'] },
  { href: '/configuration', label: 'Configuración', icon: Settings, roles: ['global_manager'] },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { profile, role, signOut } = useAuth();
  const { departments } = useDepartments();
  const location = useLocation();

  const departmentName = departments.find((department) => department.id === profile?.department_id)?.name;

  const filteredNavItems = navItems.filter((item) => {
    // Check if user is excluded from this item
    if (item.excludeRoles && role && item.excludeRoles.includes(role)) {
      return false;
    }
    // Check if user has required role
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
              'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b z-50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo-control-asistencia.svg"
            alt="Control de Asistencia ELINEAS"
            className="h-8 w-8 rounded-md object-cover"
          />
          <span className="font-semibold text-sm leading-tight">Asistencia ELINEAS</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'lg:hidden fixed top-16 left-0 bottom-0 w-64 bg-card border-r z-50 transform transition-transform',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 space-y-2">
          <NavLinks />
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t">
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

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-64 bg-card border-r">
        <div className="p-5 border-b bg-muted/20">
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
        <div className="p-4 border-t">
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

      {/* Main Content */}
      <main className="lg:pl-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
