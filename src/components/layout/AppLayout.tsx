import { AdminShell } from '@/components/layout/AdminShell';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
