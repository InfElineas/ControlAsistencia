import { useEffect, useMemo, useState } from 'react';
import { useRestSchedule } from '@/hooks/useRestSchedule';
import { useManagedDepartments } from '@/hooks/useManagedDepartments';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Calendar, Plus, Check, Users } from 'lucide-react';
import { toast } from 'sonner';
import { mapGenericActionError, mapRestScheduleError } from '@/lib/error-messages';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface WorkerOption {
  user_id: string;
  full_name: string;
  email: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom', fullLabel: 'Domingo' },
  { value: 1, label: 'Lun', fullLabel: 'Lunes' },
  { value: 2, label: 'Mar', fullLabel: 'Martes' },
  { value: 3, label: 'Mié', fullLabel: 'Miércoles' },
  { value: 4, label: 'Jue', fullLabel: 'Jueves' },
  { value: 5, label: 'Vie', fullLabel: 'Viernes' },
  { value: 6, label: 'Sáb', fullLabel: 'Sábado' },
];

function getWeekStartISO() {
  const now = new Date();
  const currentDay = now.getDay();
  const mondayDistance = currentDay === 0 ? 6 : currentDay - 1;
  const weekStartDate = new Date(now);
  weekStartDate.setDate(now.getDate() - mondayDistance);
  return weekStartDate.toISOString().split('T')[0];
}

interface ScheduleSectionProps {
  title: string;
  description: string;
  schedules: Array<{ id: string; days_of_week: number[]; effective_from: string }>;
  currentSchedule: { id: string; days_of_week: number[]; effective_from: string } | null;
  loading: boolean;
  groupMode: { enabled: boolean; departmentName: string | null };
  restGroups: Array<{ id: string; name: string; days_of_week: number[] }>;
  currentGroupId: string | null;
  canUsePersonalSchedule?: boolean;
  departmentPaused?: boolean;
  addSchedule: (daysOfWeek: number[], effectiveFrom: string, notes?: string) => Promise<{ error: string | null }>;
  assignGroup: (groupId: string, effectiveFrom: string, notes?: string) => Promise<{ error: string | null }>;
  validateRestDaysSeparation: (daysOfWeek: number[]) => { valid: boolean; error?: string };
}

function RestScheduleSection({
  title,
  description,
  schedules,
  currentSchedule,
  loading,
  groupMode,
  restGroups,
  currentGroupId,
  canUsePersonalSchedule,
  departmentPaused,
  addSchedule,
  assignGroup,
  validateRestDaysSeparation,
}: ScheduleSectionProps) {
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState(getWeekStartISO());
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectedGroupName = useMemo(
    () => restGroups.find((group) => group.id === currentGroupId)?.name,
    [restGroups, currentGroupId]
  );

  useEffect(() => {
    if (groupMode.enabled && restGroups.length > 0) {
      setSelectedGroupId((current) => current || restGroups[0].id);
    }
  }, [groupMode.enabled, restGroups]);

  const handleDayToggle = (day: number) => {
    const newDays = selectedDays.includes(day)
      ? selectedDays.filter((value) => value !== day)
      : [...selectedDays, day];

    setSelectedDays(newDays);

    if (newDays.length > 1) {
      const validation = validateRestDaysSeparation(newDays);
      setValidationError(validation.valid ? null : validation.error || null);
    } else {
      setValidationError(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);

    if (groupMode.enabled) {
      if (!selectedGroupId) {
        toast.error('Selecciona un grupo de descanso');
        setSaving(false);
        return;
      }

      const { error } = await assignGroup(selectedGroupId, effectiveFrom, notes || undefined);
      if (error) {
        toast.error(mapRestScheduleError(error, 'No se pudo asignar el grupo de descanso.'));
      } else {
        toast.success('Grupo de descanso asignado correctamente');
        setNotes('');
      }
      setSaving(false);
      return;
    }

    if (selectedDays.length === 0) {
      toast.error('Selecciona al menos un día de descanso');
      setSaving(false);
      return;
    }

    if (validationError) {
      toast.error(validationError);
      setSaving(false);
      return;
    }

    const { error } = await addSchedule(selectedDays, effectiveFrom, notes || undefined);

    if (error) {
      toast.error(mapRestScheduleError(error, 'No se pudo completar la operación.'));
    } else {
      toast.success('Días de descanso guardados correctamente');
      setSelectedDays([]);
      setNotes('');
      setValidationError(null);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-muted-foreground">{description}</p>
      </div>

      {groupMode.enabled && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Modo grupos de descanso
            </CardTitle>
            <CardDescription>
              Este trabajador pertenece a un departamento con descansos por grupos ({groupMode.departmentName}).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {departmentPaused && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader>
            <CardTitle className="text-lg">Modo departamental activo</CardTitle>
            <CardDescription>
              En este momento no puedes registrar descansos para este departamento.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {canUsePersonalSchedule && (
        <Card className="border-success/30 bg-success/5">
          <CardHeader>
            <CardTitle className="text-lg">Descanso personal del jefe de departamento</CardTitle>
            <CardDescription>
              Aunque tu departamento use grupos de descanso, aquí puedes configurar tus días personales semanalmente.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {currentSchedule && (
        <Card className="border-success/30 bg-success/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-success" />
              <CardTitle className="text-lg">Configuración Activa</CardTitle>
            </div>
            <CardDescription>
              Vigente desde {format(new Date(currentSchedule.effective_from), "d 'de' MMMM, yyyy", { locale: es })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {groupMode.enabled && selectedGroupName && (
              <p className="text-sm font-medium text-success mb-2">Grupo actual: {selectedGroupName}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {currentSchedule.days_of_week.length === 0 ? (
                <span className="text-muted-foreground">Sin días de descanso configurados</span>
              ) : (
                currentSchedule.days_of_week.map((day) => (
                  <span key={day} className="px-3 py-1 rounded-full bg-success/20 text-success font-medium text-sm">
                    {DAYS_OF_WEEK.find((item) => item.value === day)?.fullLabel}
                  </span>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            <CardTitle className="text-lg">Nueva Configuración</CardTitle>
          </div>
          <CardDescription>
            {groupMode.enabled ? 'Asigna un grupo de descanso' : 'Selecciona los días de descanso semanales'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {groupMode.enabled ? (
            <div className="space-y-2">
              <Label>Grupo de descanso</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un grupo" />
                </SelectTrigger>
                <SelectContent>
                  {restGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name} · {group.days_of_week.map((day) => DAYS_OF_WEEK.find((item) => item.value === day)?.label).join(', ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-3">
              <Label>Días de descanso</Label>
              <div className="grid grid-cols-7 gap-2">
                {DAYS_OF_WEEK.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => handleDayToggle(day.value)}
                    className={`flex flex-col items-center p-3 rounded-lg border-2 transition-all ${
                      selectedDays.includes(day.value)
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:border-muted-foreground'
                    }`}
                  >
                    <span className="text-xs font-medium">{day.label}</span>
                    {selectedDays.includes(day.value) && <Check className="h-4 w-4 mt-1" />}
                  </button>
                ))}
              </div>
              {validationError && <p className="text-sm text-destructive mt-2">{validationError}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="effectiveFrom">Vigente desde</Label>
            <Input
              id="effectiveFrom"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Ej: Cobertura temporada alta"
            />
          </div>

          <Button onClick={handleSave} disabled={saving || Boolean(departmentPaused)} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Guardar configuración
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {!groupMode.enabled && schedules.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Historial</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {schedules.slice(1).map((schedule) => (
                <div key={schedule.id} className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Desde {format(new Date(schedule.effective_from), 'd MMM yyyy', { locale: es })}
                    </p>
                    <p className="text-sm">
                      {schedule.days_of_week
                        .map((day) => DAYS_OF_WEEK.find((item) => item.value === day)?.label)
                        .join(', ') || 'Sin descansos'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function RestSchedule() {
  const { user, role, profile } = useAuth();
  const isDepartmentHead = role === 'department_head';
  const isGlobalManager = role === 'global_manager' || role === 'superadmin';

  const [workerOptions, setWorkerOptions] = useState<WorkerOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loadingWorkers, setLoadingWorkers] = useState(false);
  const { departments: managedDepartments } = useManagedDepartments(user?.id, profile?.department_id);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');

  const personalSchedule = useRestSchedule();
  const departmentSchedule = useRestSchedule(isDepartmentHead ? selectedUserId : null);

  useEffect(() => {
    if (!isDepartmentHead) return;
    if (managedDepartments.length === 0) {
      setSelectedDepartmentId('');
      return;
    }

    setSelectedDepartmentId((current) =>
      current && managedDepartments.some((department) => department.id === current)
        ? current
        : managedDepartments[0].id
    );
  }, [isDepartmentHead, managedDepartments]);


  useEffect(() => {
    setSelectedUserId(null);
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (!isDepartmentHead || !selectedDepartmentId) return;

    const fetchDepartmentWorkers = async () => {
      setLoadingWorkers(true);
      const [{ data: profilesData, error: profilesError }, { data: roleData, error: rolesError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .eq('department_id', selectedDepartmentId)
          .order('full_name', { ascending: true }),
        supabase
          .from('user_roles')
          .select('user_id, role')
          .in('role', ['department_head', 'global_manager', 'superadmin']),
      ]);

      if (profilesError || rolesError) {
        toast.error(
          mapGenericActionError(
            profilesError ?? rolesError,
            'No se pudo cargar la lista de trabajadores del departamento.'
          )
        );
        setLoadingWorkers(false);
        return;
      }

      const blockedIds = new Set((roleData || []).map((item) => item.user_id));
      const workers = ((profilesData || []) as WorkerOption[]).filter(
        (worker) => worker.user_id !== user?.id && !blockedIds.has(worker.user_id)
      );

      setWorkerOptions(workers);
      if (workers.length > 0) {
        setSelectedUserId((current) =>
          current && workers.some((worker) => worker.user_id === current)
            ? current
            : workers[0].user_id
        );
      }
      setLoadingWorkers(false);
    };

    fetchDepartmentWorkers();
  }, [isDepartmentHead, selectedDepartmentId, selectedUserId, user?.id]);

  if (isGlobalManager) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Descansos del personal</CardTitle>
              <CardDescription>
                La configuración de descansos departamentales ahora la gestiona el jefe de departamento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Como gestor global, puedes revisar resultados en paneles de control, pero la asignación semanal recae en cada jefe de departamento.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
        {isDepartmentHead ? (
          <Tabs defaultValue="personal" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="personal">Mi descanso</TabsTrigger>
              <TabsTrigger value="department">Descansos del departamento</TabsTrigger>
            </TabsList>

            <TabsContent value="personal">
              <RestScheduleSection
                title="Mi descanso personal"
                description="Configura tus días de descanso independientes."
                schedules={personalSchedule.schedules}
                currentSchedule={personalSchedule.currentSchedule}
                loading={personalSchedule.loading}
                groupMode={personalSchedule.groupMode}
                restGroups={personalSchedule.restGroups}
                currentGroupId={personalSchedule.currentGroupId}
                canUsePersonalSchedule={personalSchedule.canUsePersonalSchedule}
                departmentPaused={personalSchedule.departmentPaused}
                addSchedule={personalSchedule.addSchedule}
                assignGroup={personalSchedule.assignGroup}
                validateRestDaysSeparation={personalSchedule.validateRestDaysSeparation}
              />
            </TabsContent>

            <TabsContent value="department" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Departamento a gestionar</CardTitle>
                  <CardDescription>Selecciona uno de los departamentos bajo tu responsabilidad.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId} disabled={managedDepartments.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={managedDepartments.length === 0 ? 'No tienes departamentos asignados' : 'Selecciona un departamento'} />
                    </SelectTrigger>
                    <SelectContent>
                      {managedDepartments.map((department) => (
                        <SelectItem key={department.id} value={department.id}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Seleccionar trabajador del departamento</CardTitle>
                  <CardDescription>Define descansos semanales para tu equipo.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Select value={selectedUserId ?? ''} onValueChange={setSelectedUserId} disabled={loadingWorkers || workerOptions.length === 0}>
                    <SelectTrigger>
                      <SelectValue placeholder={workerOptions.length === 0 ? 'Sin trabajadores disponibles' : 'Selecciona un trabajador'} />
                    </SelectTrigger>
                    <SelectContent>
                      {workerOptions.map((worker) => (
                        <SelectItem key={worker.user_id} value={worker.user_id}>
                          {worker.full_name} · {worker.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              {selectedDepartmentId && selectedUserId ? (
                <RestScheduleSection
                  title="Descansos del departamento"
                  description="Configura los descansos del trabajador seleccionado."
                  schedules={departmentSchedule.schedules}
                  currentSchedule={departmentSchedule.currentSchedule}
                  loading={departmentSchedule.loading}
                  groupMode={departmentSchedule.groupMode}
                  restGroups={departmentSchedule.restGroups}
                  currentGroupId={departmentSchedule.currentGroupId}
                  addSchedule={departmentSchedule.addSchedule}
                  assignGroup={departmentSchedule.assignGroup}
                  validateRestDaysSeparation={departmentSchedule.validateRestDaysSeparation}
                  departmentPaused={departmentSchedule.departmentPaused}
                />
              ) : (
                <Card>
                  <CardContent className="pt-6 text-sm text-muted-foreground">
                    No hay trabajadores elegibles en tu departamento para configurar descansos.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <RestScheduleSection
            title="Mis días de descanso"
            description="Configura qué días de la semana no trabajas."
            schedules={personalSchedule.schedules}
            currentSchedule={personalSchedule.currentSchedule}
            loading={personalSchedule.loading}
            groupMode={personalSchedule.groupMode}
            restGroups={personalSchedule.restGroups}
            currentGroupId={personalSchedule.currentGroupId}
            canUsePersonalSchedule={personalSchedule.canUsePersonalSchedule}
            departmentPaused={personalSchedule.departmentPaused}
            addSchedule={personalSchedule.addSchedule}
            assignGroup={personalSchedule.assignGroup}
            validateRestDaysSeparation={personalSchedule.validateRestDaysSeparation}
          />
        )}
      </div>
    </AppLayout>
  );
}
