import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, UserCircle2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartments } from '@/hooks/useDepartments';
import { toast } from 'sonner';
import { mapGenericActionError } from '@/lib/error-messages';

interface ProfileFormState {
  fullName: string;
  phone: string;
  email: string;
  departmentId: string;
}

export default function Profile() {
  const { profile, user, loading: authLoading, updateProfile } = useAuth();
  const { departments, loading: departmentsLoading } = useDepartments();

  const [form, setForm] = useState<ProfileFormState>({
    fullName: '',
    phone: '',
    email: '',
    departmentId: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) {
      return;
    }

    setForm({
      fullName: profile.full_name ?? '',
      phone: profile.phone ?? '',
      email: user?.email ?? profile.email ?? '',
      departmentId: profile.department_id ?? '',
    });
  }, [profile, user?.email]);

  const canSave = useMemo(() => {
    return Boolean(
      form.fullName.trim() &&
      form.phone.trim() &&
      form.email.trim() &&
      form.departmentId
    );
  }, [form]);

  const handleSave = async () => {
    if (!canSave) {
      toast.error('Completa todos los campos antes de guardar.');
      return;
    }

    setSaving(true);
    const result = await updateProfile({
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      department_id: form.departmentId,
    });

    if (result.error) {
      toast.error(mapGenericActionError(result.error, 'No se pudo actualizar el perfil.'));
      setSaving(false);
      return;
    }

    toast.success('Perfil actualizado correctamente.');

    if (result.emailConfirmationRequired) {
      toast.info('Revisa tu correo para confirmar el nuevo email antes de iniciar sesión nuevamente.');
    }

    setSaving(false);
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Mi perfil</h1>
          <p className="text-muted-foreground">
            Actualiza tu información personal y de contacto.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle2 className="h-5 w-5" />
              Datos del usuario
            </CardTitle>
            <CardDescription>
              Estos datos se usan para identificarte dentro de la plataforma.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="fullName">Nombre completo</Label>
                <Input
                  id="fullName"
                  value={form.fullName}
                  onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Nombre y apellidos"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Ej: 600123456"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="tu@correo.com"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="department">Departamento</Label>
                {departmentsLoading ? (
                  <div className="flex h-10 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
                    Cargando departamentos...
                  </div>
                ) : (
                  <Select
                    value={form.departmentId}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, departmentId: value }))}
                  >
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Selecciona un departamento" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="button" onClick={handleSave} disabled={saving || !canSave}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Guardar cambios
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
