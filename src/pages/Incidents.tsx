import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { EmployeeIncidentsPage } from '@/pages/employee/EmployeeIncidentsPage';
import { IncidentsManagementPage } from '@/pages/management/IncidentsManagementPage';

export default function Incidents() {
  const { role } = useAuth();
  const isManager = role === 'department_head' || role === 'global_manager' || role === 'superadmin';

  return (
    <AppLayout>
      {isManager ? <IncidentsManagementPage /> : <EmployeeIncidentsPage />}
    </AppLayout>
  );
}
