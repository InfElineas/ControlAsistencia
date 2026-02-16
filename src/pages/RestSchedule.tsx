import { useEffect, useState } from 'react';
import { useRestSchedule } from '@/hooks/useRestSchedule';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Calendar, Plus, Check } from 'lucide-react';
import { toast } from 'sonner';
import { mapGenericActionError } from '@/lib/error-messages';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

export default function RestSchedule() {
  const { user, role } = useAuth();
  const isGlobalManager = role === 'global_manager';
  const [workerOptions, setWorkerOptions] = useState<WorkerOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loadingWorkers, setLoadingWorkers] = useState(false);

  const { schedules, currentSchedule, loading, addSchedule, validateRestDaysSeparation } = useRestSchedule(
    isGlobalManager ? selectedUserId : null
  );
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isGlobalManager) return;

    const fetchWorkers = async () => {
      setLoadingWorkers(true);
      const [{ data: profilesData, error: profilesError }, { data: roleData, error: rolesError }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, email')
          .order('full_name', { ascending: true }),
        supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'global_manager'),
      ]);

      if (profilesError || rolesError) {
        toast.error(
          mapGenericActionError(
            profilesError ?? rolesError,
            'No se pudo cargar la lista de trabajadores.'
          )
        );
        setLoadingWorkers(false);
        return;
      }

      const workers = (profilesData ?? []) as WorkerOption[];
      const globalManagerIds = new Set((roleData ?? []).map((item) => item.user_id));
      const filteredWorkers = workers.filter(
        (worker) => worker.user_id !== user?.id && !globalManagerIds.has(worker.user_id)
      );
      setWorkerOptions(filteredWorkers);

      if (!selectedUserId && filteredWorkers.length > 0) {
        setSelectedUserId(filteredWorkers[0].user_id);
      }
      setLoadingWorkers(false);
    };

    fetchWorkers();
  }, [isGlobalManager, selectedUserId, user?.id]);

  const handleDayToggle = (day: number) => {
    const newDays = selectedDays.includes(day) 
      ? selectedDays.filter((d) => d !== day) 
      : [...selectedDays, day];
    
    setSelectedDays(newDays);
    
    // Validate separation in real-time
    if (newDays.length > 1) {
      const validation = validateRestDaysSeparation(newDays);
      setValidationError(validation.valid ? null : validation.error || null);
    } else {
      setValidationError(null);
    }
  };

  const handleSave = async () => {
    if (isGlobalManager && !selectedUserId) {
      toast.error('Selecciona un trabajador para configurar sus días de descanso');
      return;
    }

    if (selectedDays.length === 0) {
      toast.error('Selecciona al menos un día de descanso');
      return;
    }

    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    const { error } = await addSchedule(selectedDays, effectiveFrom, notes || undefined);
    
    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo completar la operación.'));
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
      <AppLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">{isGlobalManager ? 'Descansos del personal' : 'Mis Días de Descanso'}</h1>
          <p className="text-muted-foreground">
            {isGlobalManager
              ? 'Configura días de descanso y planificación semanal para trabajadores'
              : 'Configura qué días de la semana no trabajas'}
          </p>
        </div>

        {isGlobalManager && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Seleccionar trabajador</CardTitle>
              <CardDescription>
                Como administrador global no necesitas configurar tu propio plan: aquí gestionas la planificación de otros.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={selectedUserId ?? ''} onValueChange={setSelectedUserId} disabled={loadingWorkers}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un trabajador" />
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
        )}

        {/* Current Schedule */}
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
              <div className="flex flex-wrap gap-2">
                {currentSchedule.days_of_week.length === 0 ? (
                  <span className="text-muted-foreground">Sin días de descanso configurados</span>
                ) : (
                  currentSchedule.days_of_week.map((day) => (
                    <span
                      key={day}
                      className="px-3 py-1 rounded-full bg-success/20 text-success font-medium text-sm"
                    >
                      {DAYS_OF_WEEK.find((d) => d.value === day)?.fullLabel}
                    </span>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* New Schedule Form */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              <CardTitle className="text-lg">Nueva Configuración</CardTitle>
            </div>
            <CardDescription>
              Selecciona los días que descansarás cada semana
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Day Selector */}
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
                    {selectedDays.includes(day.value) && (
                      <Check className="h-4 w-4 mt-1" />
                    )}
                  </button>
                ))}
              </div>
              {validationError && (
                <p className="text-sm text-destructive mt-2">{validationError}</p>
              )}
            </div>

            {/* Effective From */}
            <div className="space-y-2">
              <Label htmlFor="effectiveFrom">Vigente desde</Label>
              <Input
                id="effectiveFrom"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notas (opcional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Horario de verano"
              />
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
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

        {/* History */}
        {schedules.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Historial</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {schedules.slice(1).map((schedule) => (
                  <div
                    key={schedule.id}
                    className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm text-muted-foreground">
                        Desde {format(new Date(schedule.effective_from), "d MMM yyyy", { locale: es })}
                      </p>
                      <p className="text-sm">
                        {schedule.days_of_week
                          .map((d) => DAYS_OF_WEEK.find((day) => day.value === d)?.label)
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
    </AppLayout>
  );
}
