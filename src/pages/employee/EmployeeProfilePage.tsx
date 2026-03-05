import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartments } from '@/hooks/useDepartments';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { mapPasswordChangeError } from '@/lib/error-messages';

export function EmployeeProfilePage() {
  const { profile, role } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const { departments } = useDepartments();

  const department = useMemo(
    () => departments.find((item) => item.id === profile?.department_id)?.name || 'Sin departamento',
    [departments, profile?.department_id]
  );



  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden.');
      return;
    }

    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast.error(mapPasswordChangeError(error));
      setUpdatingPassword(false);
      return;
    }

    toast.success('Contraseña actualizada correctamente.');
    setNewPassword('');
    setConfirmPassword('');
    setUpdatingPassword(false);
  };

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
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4" />Seguridad</CardTitle>
          <CardDescription>Cambia tu contraseña personal.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="employee-new-password">Nueva contraseña</Label>
            <Input
              id="employee-new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="employee-confirm-password">Confirmar contraseña</Label>
            <Input
              id="employee-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Repite la nueva contraseña"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleChangePassword}
              disabled={updatingPassword || !newPassword || !confirmPassword}
            >
              {updatingPassword ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Actualizando...</>
              ) : (
                <><KeyRound className="h-4 w-4 mr-2" />Cambiar contraseña</>
              )}
            </Button>
          </div>
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
