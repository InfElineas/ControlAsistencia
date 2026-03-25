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
  TriangleAlert,
  Bell,
  LogOut,
  ChevronDown,
  FolderKanban,
  Briefcase,
} from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useDepartments } from '@/hooks/useDepartments';
import { NotificationBell } from '@/components/layout/NotificationBell';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  roles?: AppRole[];
  excludeRoles?: AppRole[];
}

interface NavGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}


const SidebarBrand = memo(function SidebarBrand() {
  return (
    <div className="flex items-start justify-between gap-3">
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
      <NotificationBell />
    </div>
  );
});

const SIDEBAR_SCROLL_KEY = 'admin-shell-sidebar-scroll';
const navItems: NavItem[] = [
  { href: '/', label: 'Inicio', icon: LayoutDashboard },
  { href: '/attendance', label: 'Marcar', icon: Clock, excludeRoles: ['global_manager', 'superadmin'] },
  { href: '/history', label: 'Mi Historial', icon: History, excludeRoles: ['global_manager', 'superadmin'] },
  { href: '/incidents', label: 'Incidencias', icon: TriangleAlert },
  { href: '/profile', label: 'Mi perfil', icon: User },
  { href: '/notifications', label: 'Notificaciones', icon: Bell },
  { href: '/rest-schedule', label: 'Descansos', icon: Calendar },
  { href: '/vacations', label: 'Vacaciones', icon: PlaneTakeoff, excludeRoles: ['global_manager', 'superadmin'] },
  { href: '/department', label: 'Departamento', icon: Users, roles: ['department_head'] },
  { href: '/global', label: 'Panel Global', icon: Users, roles: ['global_manager', 'superadmin'] },
  { href: '/users', label: 'Usuarios', icon: UserCog, roles: ['global_manager', 'superadmin'] },
  { href: '/departments-admin', label: 'Departamentos', icon: Building2, roles: ['global_manager', 'superadmin'] },
  { href: '/configuration', label: 'Configuración', icon: Settings, roles: ['global_manager', 'superadmin'] },
  { href: '/superadmin', label: 'Superadmin', icon: ShieldCheck, roles: ['superadmin'] },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    attendance: true,
    management: true,
  });
  const { profile, role, signOut } = useAuth();
  const desktopNavRef = useRef<HTMLElement | null>(null);
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

  const groupedItems: NavGroup[] = [
    {
      key: 'attendance',
      label: 'Asistencia',
      icon: Briefcase,
      items: filteredNavItems.filter((item) =>
        ['/attendance', '/history', '/incidents', '/rest-schedule', '/vacations'].includes(item.href)
      ),
    },
    {
      key: 'management',
      label: 'Gestión',
      icon: FolderKanban,
      items: filteredNavItems.filter((item) =>
        ['/department', '/global', '/users', '/departments-admin', '/configuration', '/superadmin'].includes(item.href)
      ),
    },
  ].filter((group) => group.items.length > 0);

  const topLevelItems = filteredNavItems.filter((item) =>
    ['/', '/profile', '/notifications'].includes(item.href)
  );

  const mobileNavItems = (() => {
    if (role === 'employee') {
      return filteredNavItems.filter((item) =>
        ['/', '/profile', '/incidents', '/rest-schedule'].includes(item.href)
      );
    }

    if (role === 'department_head') {
      return filteredNavItems.filter((item) =>
        ['/', '/department', '/incidents', '/profile'].includes(item.href)
      );
    }

    return filteredNavItems.filter((item) =>
      ['/', '/global', '/users', '/profile'].includes(item.href)
    );
  })();

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((current) => ({ ...current, [groupKey]: !current[groupKey] }));
  };


  useEffect(() => {
    const desktopSaved = window.sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (desktopSaved && desktopNavRef.current) {
      desktopNavRef.current.scrollTop = Number(desktopSaved);
    }
  }, []);

  useEffect(() => {
    const desktop = desktopNavRef.current;
    if (!desktop) return;

    const onScroll = () => window.sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(desktop.scrollTop));
    desktop.addEventListener('scroll', onScroll);

    return () => desktop.removeEventListener('scroll', onScroll);
  }, []);

  const NavLinkItem = ({ item, nested = false }: { item: NavItem; nested?: boolean }) => {
        const isActive = location.pathname === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            className={cn(
              'group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm'
                : nested
                  ? 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
            )}
          >
            <item.icon className="h-5 w-5 transition-transform group-hover:scale-105" />
            <span className="text-sm font-medium">{item.label}</span>
          </Link>
        );
  };

  const NavLinks = () => (
    <>
      {topLevelItems.map((item) => (
        <NavLinkItem key={item.href} item={item} />
      ))}

      {groupedItems.map((group) => {
        const isExpanded = openGroups[group.key] ?? true;
        const isGroupActive = group.items.some((item) => item.href === location.pathname);

        return (
          <div key={group.key} className="rounded-xl bg-transparent">
            <button
              type="button"
              onClick={() => toggleGroup(group.key)}
              className={cn(
                'w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border-none',
                isGroupActive ? 'text-primary' : 'text-foreground/90 hover:bg-secondary/40'
              )}
            >
              <span className="inline-flex items-center gap-2">
                <group.icon className="h-4 w-4" />
                {group.label}
              </span>
              <ChevronDown className={cn('h-4 w-4 transition-transform', isExpanded && 'rotate-180')} />
            </button>

            {isExpanded && (
              <div className="px-2 pb-2 space-y-1">
                {group.items.map((item) => (
                  <NavLinkItem key={item.href} item={item} nested />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 p-3">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between rounded-2xl border bg-card/95 px-3 shadow-sm backdrop-blur-md">
          <div className="flex items-center gap-3">
            <img
              src="/logo-control-asistencia.svg"
              alt="Control de Asistencia ELINEAS"
              className="h-8 w-8 rounded-md object-cover"
            />
            <span className="font-semibold text-sm leading-tight">Asistencia ELINEAS</span>
          </div>
          <span className="text-xs text-muted-foreground">Panel</span>
        </div>
      </header>

      <div className="lg:hidden fixed bottom-3 left-0 right-0 z-50 px-4">
        <div className="mx-auto grid max-w-md grid-cols-4 rounded-2xl border bg-card/95 p-1.5 shadow-lg backdrop-blur-md">
          {mobileNavItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                <span className="leading-none text-center">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="lg:hidden fixed bottom-3 left-0 right-0 z-50 px-4">
        <div className="mx-auto flex max-w-sm items-center justify-center gap-3 rounded-2xl border bg-card/95 p-2 shadow-lg backdrop-blur-md">
          <NotificationBell className="h-10 w-10" />
          <Button
            variant={mobileMenuOpen ? "secondary" : "default"}
            size="sm"
            className="h-10 rounded-xl px-4"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-4 w-4 mr-2" /> : <Menu className="h-4 w-4 mr-2" />}
            Menú
          </Button>
        </div>
      </div>

      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:left-0 lg:top-0 lg:bottom-0 lg:w-72 bg-card/95 backdrop-blur-md border-r overflow-hidden">
        <div className="p-5 border-b bg-muted/30">
          <SidebarBrand />
        </div>
        <nav ref={desktopNavRef} className="flex-1 p-4 space-y-2 overflow-y-auto">
          <NavLinks />
        </nav>
        <div className="p-4 border-t bg-muted/20 shrink-0">
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

      <main className="lg:pl-72 pt-20 pb-20 lg:pb-0 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
      </main>
    </div>
  );
}
