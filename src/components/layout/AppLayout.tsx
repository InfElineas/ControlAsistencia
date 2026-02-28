import { useAuth } from '@/contexts/AuthContext';
import { useUIMode } from '@/hooks/use-ui-mode';
import { AdminShell } from '@/components/layout/AdminShell';
import { EmployeeShell } from '@/components/layout/EmployeeShell';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const uiMode = useUIMode(role);

  if (uiMode === 'employee') {
    return <EmployeeShell>{children}</EmployeeShell>;
  }

  return <AdminShell>{children}</AdminShell>;
}
