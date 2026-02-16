import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Plus, Trash2, Building2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { mapGenericActionError } from '@/lib/error-messages';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DepartmentItem {
  id: string;
  name: string;
  rest_groups_enabled: boolean;
}

interface RestGroupItem {
  id: string;
  name: string;
  days_of_week: number[];
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Lunes', short: 'Lun' },
  { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' },
  { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' },
  { value: 6, label: 'Sábado', short: 'Sáb' },
];

export default function DepartmentsManagement() {
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [restGroups, setRestGroups] = useState<RestGroupItem[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDays, setNewGroupDays] = useState<number[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  const selectedDepartment = useMemo(
    () => departments.find((department) => department.id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );

  const fetchDepartments = useCallback(async () => {
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

    const rows = (data || []) as DepartmentItem[];
    setDepartments(rows);
    if (!selectedDepartmentId && rows.length > 0) {
      setSelectedDepartmentId(rows[0].id);
    }
    setLoading(false);
  }, [selectedDepartmentId]);

  const fetchRestGroups = useCallback(async (departmentId: string) => {
    setLoadingGroups(true);
    const { data, error } = await supabase
      .from('rest_groups')
      .select('id, name, days_of_week')
      .eq('department_id', departmentId)
      .order('name', { ascending: true });

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudieron cargar los grupos de descanso.'));
      setLoadingGroups(false);
      return;
    }

    setRestGroups((data || []) as RestGroupItem[]);
    setLoadingGroups(false);
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    if (!selectedDepartmentId || !selectedDepartment?.rest_groups_enabled) {
      setRestGroups([]);
      return;
    }
    fetchRestGroups(selectedDepartmentId);
  }, [selectedDepartmentId, selectedDepartment?.rest_groups_enabled, fetchRestGroups]);

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
    if (selectedDepartmentId === departmentId) {
      setSelectedDepartmentId('');
    }
    await fetchDepartments();
    setSavingId(null);
  };

  const toggleGroupDay = (day: number) => {
    setNewGroupDays((previous) =>
      previous.includes(day) ? previous.filter((value) => value !== day) : [...previous, day]
    );
  };

  const handleCreateRestGroup = async () => {
    if (!selectedDepartmentId) {
      toast.error('Selecciona un departamento.');
      return;
    }

    const normalizedName = newGroupName.trim();
    if (!normalizedName) {
      toast.error('Indica el nombre del grupo de descanso.');
      return;
    }

    if (newGroupDays.length === 0) {
      toast.error('Selecciona al menos un día de descanso para el grupo.');
      return;
    }

    setCreatingGroup(true);
    const { error } = await supabase
      .from('rest_groups')
      .insert({
        department_id: selectedDepartmentId,
        name: normalizedName,
        days_of_week: [...newGroupDays].sort((a, b) => a - b),
      });

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo crear el grupo de descanso.'));
      setCreatingGroup(false);
      return;
    }

    toast.success('Grupo de descanso creado.');
    setNewGroupName('');
    setNewGroupDays([]);
    await fetchRestGroups(selectedDepartmentId);
    setCreatingGroup(false);
  };

  const handleDeleteRestGroup = async (groupId: string) => {
    setDeletingGroupId(groupId);

    const { error } = await supabase
      .from('rest_groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo eliminar el grupo. Verifica si tiene asignaciones activas.'));
      setDeletingGroupId(null);
      return;
    }

    toast.success('Grupo eliminado correctamente.');
    if (selectedDepartmentId) {
      await fetchRestGroups(selectedDepartmentId);
    }
    setDeletingGroupId(null);
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Grupos de descanso
            </CardTitle>
            <CardDescription>
              Crea y elimina grupos para departamentos con modo de grupos activado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un departamento" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name} {department.rest_groups_enabled ? '· grupos activos' : '· grupos inactivos'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!selectedDepartment?.rest_groups_enabled ? (
              <p className="text-sm text-muted-foreground">
                Activa “Grupos descanso” en el departamento para crear y usar grupos.
              </p>
            ) : (
              <>
                <div className="space-y-3 rounded-lg border p-4">
                  <div className="space-y-2">
                    <Label htmlFor="newGroupName">Nombre del grupo</Label>
                    <Input
                      id="newGroupName"
                      value={newGroupName}
                      onChange={(event) => setNewGroupName(event.target.value)}
                      placeholder="Ej: Grupo Nocturno"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Días de descanso del grupo</Label>
                    <div className="grid grid-cols-7 gap-2">
                      {DAYS_OF_WEEK.map((day) => (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => toggleGroupDay(day.value)}
                          className={`rounded-md border px-2 py-2 text-xs font-medium transition-colors ${
                            newGroupDays.includes(day.value)
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                        >
                          {day.short}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button onClick={handleCreateRestGroup} disabled={creatingGroup}>
                    {creatingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear grupo'}
                  </Button>
                </div>

                <div className="space-y-2">
                  {loadingGroups ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : restGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay grupos creados para este departamento.</p>
                  ) : (
                    restGroups.map((group) => (
                      <div key={group.id} className="rounded-lg border p-3 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-medium">{group.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Descanso: {group.days_of_week.map((day) => DAYS_OF_WEEK.find((item) => item.value === day)?.label).join(', ')}
                          </p>
                        </div>
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteRestGroup(group.id)}
                          disabled={deletingGroupId === group.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
