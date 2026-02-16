import { useEffect, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { mapGenericActionError } from '@/lib/error-messages';

interface DepartmentItem {
  id: string;
  name: string;
  rest_groups_enabled: boolean;
}

export default function DepartmentsManagement() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const fetchDepartments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('departments')
      .select('id, name, rest_groups_enabled')
      .order('name', { ascending: true });

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudieron cargar los departamentos.'));
      setLoading(false);
      return;
    }

    setDepartments((data || []) as DepartmentItem[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  const handleCreateDepartment = async () => {
    const normalizedName = newDepartmentName.trim();
    if (!normalizedName) {
      toast.error('Indica el nombre del nuevo departamento.');
      return;
    }

    setCreating(true);
    const { error } = await supabase
      .from('departments')
      .insert({
        name: normalizedName,
        rest_groups_enabled: false,
      });

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo crear el departamento.'));
      setCreating(false);
      return;
    }

    setNewDepartmentName('');
    toast.success('Departamento creado correctamente.');
    await fetchDepartments();
    setCreating(false);
  };

  const handleUpdateDepartment = async (departmentId: string, payload: Partial<DepartmentItem>) => {
    setSavingId(departmentId);
    const { error } = await supabase
      .from('departments')
      .update(payload)
      .eq('id', departmentId);

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo actualizar el departamento.'));
      setSavingId(null);
      return;
    }

    toast.success('Departamento actualizado.');
    await fetchDepartments();
    setSavingId(null);
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    setSavingId(departmentId);
    const { error } = await supabase
      .from('departments')
      .delete()
      .eq('id', departmentId);

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo eliminar el departamento. Verifica que no tenga usuarios asociados.'));
      setSavingId(null);
      return;
    }

    toast.success('Departamento eliminado.');
    await fetchDepartments();
    setSavingId(null);
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Departamentos</h1>
          <p className="text-muted-foreground">
            Crea, edita o elimina departamentos y activa grupos de descanso según necesidad.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nuevo departamento
            </CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Input
              value={newDepartmentName}
              onChange={(event) => setNewDepartmentName(event.target.value)}
              placeholder="Ej: Producción"
            />
            <Button onClick={handleCreateDepartment} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Gestión de departamentos
            </CardTitle>
            <CardDescription>
              Si activas grupos de descanso, la asignación se hará por grupos en la pantalla de descansos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {departments.map((department) => (
                  <div key={department.id} className="rounded-lg border p-4 space-y-3">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] items-center">
                      <div className="space-y-2">
                        <Label htmlFor={`dept-${department.id}`}>Nombre</Label>
                        <Input
                          id={`dept-${department.id}`}
                          value={department.name}
                          onChange={(event) => {
                            const name = event.target.value;
                            setDepartments((previous) =>
                              previous.map((item) =>
                                item.id === department.id ? { ...item, name } : item
                              )
                            );
                          }}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-6">
                        <Switch
                          checked={department.rest_groups_enabled}
                          onCheckedChange={(checked) =>
                            setDepartments((previous) =>
                              previous.map((item) =>
                                item.id === department.id ? { ...item, rest_groups_enabled: checked } : item
                              )
                            )
                          }
                        />
                        <span className="text-sm">Grupos descanso</span>
                      </div>

                      <div className="flex gap-2 pt-6">
                        <Button
                          variant="outline"
                          onClick={() => handleUpdateDepartment(department.id, {
                            name: department.name.trim(),
                            rest_groups_enabled: department.rest_groups_enabled,
                          })}
                          disabled={savingId === department.id}
                        >
                          Guardar
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteDepartment(department.id)}
                          disabled={savingId === department.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
