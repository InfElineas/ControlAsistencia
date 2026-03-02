import { AdminShell } from '@/components/layout/AdminShell';
import { WorkLocationSelector } from '@/components/layout/WorkLocationSelector';

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WorkLocationSelector />
      <AdminShell>{children}</AdminShell>
    </>
  );
}
