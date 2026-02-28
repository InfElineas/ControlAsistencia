import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartments } from '@/hooks/useDepartments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export function EmployeeProfilePage() {
  const { profile, role } = useAuth();
  const { departments } = useDepartments();

  const department = useMemo(
    () => departments.find((item) => item.id === profile?.department_id)?.name || 'Sin departamento',
    [departments, profile?.department_id]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Datos básicos</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="text-muted-foreground">Nombre:</span> {profile?.full_name || '-'}</p>
          <p><span className="text-muted-foreground">Email:</span> {profile?.email || '-'}</p>
          <p><span className="text-muted-foreground">Departamento:</span> {department}</p>
          <p><span className="text-muted-foreground">Rol:</span> {role?.replace('_', ' ') || '-'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Preferencias</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between text-sm">
          <p>Recordatorio de salida</p>
          <Switch checked disabled />
        </CardContent>
      </Card>
    </div>
  );
}
