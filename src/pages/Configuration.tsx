import { useState, useEffect } from 'react';
import type { ComponentProps } from 'react';
import { useGeofenceConfig } from '@/hooks/useGeofenceConfig';
import { useDepartmentSchedules } from '@/hooks/useDepartmentSchedules';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { DepartmentScheduleCard } from '@/components/configuration/DepartmentScheduleCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, MapPin, Clock, Settings, Save } from 'lucide-react';
import { toast } from 'sonner';
import { mapGenericActionError } from '@/lib/error-messages';

export default function Configuration() {
  const { config, loading, updateConfig } = useGeofenceConfig();
  const { departmentsWithSchedules, loading: schedulesLoading, updateSchedule } = useDepartmentSchedules();
  
  const [geofenceForm, setGeofenceForm] = useState({
    center_lat: config?.center_lat || 40.416775,
    center_lng: config?.center_lng || -3.703790,
    radius_meters: config?.radius_meters || 100,
    accuracy_threshold: config?.accuracy_threshold || 50,
    block_on_poor_accuracy: config?.block_on_poor_accuracy ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [generalConfig, setGeneralConfig] = useState({
    includeHeadsInGlobalReports: false,
    lateToleranceMinutes: 15,
    vacationDaysPerWorkedDay: 0.0833333333,
  });
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Update form when config loads
  useEffect(() => {
    if (config) {
      setGeofenceForm({
        center_lat: config.center_lat,
        center_lng: config.center_lng,
        radius_meters: config.radius_meters,
        accuracy_threshold: config.accuracy_threshold,
        block_on_poor_accuracy: config.block_on_poor_accuracy,
      });
    }
  }, [config]);


  useEffect(() => {
    const fetchGeneralConfig = async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .in('key', ['include_heads_in_global_reports', 'late_tolerance_minutes', 'vacation_days_per_worked_day']);

      if (error) {
        toast.error(mapGenericActionError(error, 'No se pudo cargar la configuración general.'));
        return;
      }

      const includeHeads = data?.find((item) => item.key === 'include_heads_in_global_reports')?.value;
      const lateTolerance = data?.find((item) => item.key === 'late_tolerance_minutes')?.value;
      const vacationRate = data?.find((item) => item.key === 'vacation_days_per_worked_day')?.value;

      setGeneralConfig({
        includeHeadsInGlobalReports: typeof includeHeads === 'boolean' ? includeHeads : false,
        lateToleranceMinutes: typeof lateTolerance === 'number' ? lateTolerance : 15,
        vacationDaysPerWorkedDay: typeof vacationRate === 'number' ? vacationRate : 0.0833333333,
      });
    };

    fetchGeneralConfig();
  }, []);

  const handleSaveGeofence = async () => {
    setSaving(true);
    const { error } = await updateConfig(geofenceForm);
    
    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo completar la operación.'));
    } else {
      toast.success('Configuración de geofence guardada');
    }
    setSaving(false);
  };

  type ScheduleUpdateData = ComponentProps<typeof DepartmentScheduleCard>['onSave'] extends (departmentId: string, data: infer T) => Promise<{ error: string | null }> ? T : never;

  const handleSaveSchedule = async (departmentId: string, data: ScheduleUpdateData) => {
    const { error } = await updateSchedule(departmentId, data);
    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo completar la operación.'));
    } else {
      toast.success('Horario guardado correctamente');
    }
    return { error };
  };


  const handleSaveGeneral = async () => {
    setSavingGeneral(true);

    try {
      const updates = [
        supabase
          .from('app_config')
          .update({ value: generalConfig.includeHeadsInGlobalReports })
          .eq('key', 'include_heads_in_global_reports'),
        supabase
          .from('app_config')
          .update({ value: generalConfig.lateToleranceMinutes })
          .eq('key', 'late_tolerance_minutes'),
        supabase
          .from('app_config')
          .update({ value: generalConfig.vacationDaysPerWorkedDay })
          .eq('key', 'vacation_days_per_worked_day'),
      ];

      const results = await Promise.all(updates);
      const failed = results.find((result) => result.error);

      if (failed?.error) {
        toast.error(mapGenericActionError(failed.error, 'No se pudo guardar la configuración general.'));
        return;
      }

      toast.success('Configuración general guardada correctamente');
    } finally {
      setSavingGeneral(false);
    }
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
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Configuración</h1>
          <p className="text-muted-foreground">
            Gestiona la configuración del sistema de asistencia
          </p>
        </div>

        <Tabs defaultValue="schedules">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="schedules" className="gap-2">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Horarios</span>
            </TabsTrigger>
            <TabsTrigger value="geofence" className="gap-2">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Geofence</span>
            </TabsTrigger>
            <TabsTrigger value="general" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
          </TabsList>

          {/* Schedules Tab */}
          <TabsContent value="schedules">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Horarios por Departamento
                  </CardTitle>
                  <CardDescription>
                    Configura la ventana de entrada y salida para cada departamento
                  </CardDescription>
                </CardHeader>
              </Card>

              {schedulesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {departmentsWithSchedules.map((dept) => (
                    <DepartmentScheduleCard
                      key={dept.id}
                      departmentId={dept.id}
                      departmentName={dept.name}
                      schedule={dept.schedule}
                      onSave={handleSaveSchedule}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Geofence Tab */}
          <TabsContent value="geofence">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Configuración de Geofence
                </CardTitle>
                <CardDescription>
                  Define la zona permitida para marcar asistencia
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lat">Latitud del centro</Label>
                    <Input
                      id="lat"
                      type="number"
                      step="0.000001"
                      value={geofenceForm.center_lat}
                      onChange={(e) =>
                        setGeofenceForm((p) => ({
                          ...p,
                          center_lat: parseFloat(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lng">Longitud del centro</Label>
                    <Input
                      id="lng"
                      type="number"
                      step="0.000001"
                      value={geofenceForm.center_lng}
                      onChange={(e) =>
                        setGeofenceForm((p) => ({
                          ...p,
                          center_lng: parseFloat(e.target.value),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="radius">Radio permitido (metros)</Label>
                    <Input
                      id="radius"
                      type="number"
                      value={geofenceForm.radius_meters}
                      onChange={(e) =>
                        setGeofenceForm((p) => ({
                          ...p,
                          radius_meters: parseInt(e.target.value),
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Los empleados deben estar dentro de este radio para marcar
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accuracy">Umbral de precisión GPS (metros)</Label>
                    <Input
                      id="accuracy"
                      type="number"
                      value={geofenceForm.accuracy_threshold}
                      onChange={(e) =>
                        setGeofenceForm((p) => ({
                          ...p,
                          accuracy_threshold: parseInt(e.target.value),
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Precisión mínima aceptable del GPS
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
                  <div>
                    <p className="font-medium">Bloquear con precisión baja</p>
                    <p className="text-sm text-muted-foreground">
                      Impide marcar si la precisión GPS es mayor al umbral
                    </p>
                  </div>
                  <Switch
                    checked={geofenceForm.block_on_poor_accuracy}
                    onCheckedChange={(checked) =>
                      setGeofenceForm((p) => ({
                        ...p,
                        block_on_poor_accuracy: checked,
                      }))
                    }
                  />
                </div>

                <Button onClick={handleSaveGeofence} disabled={saving} className="w-full">
                  {saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar configuración
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* General Tab */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Configuración General
                </CardTitle>
                <CardDescription>
                  Ajustes globales del sistema
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg bg-secondary">
                  <div>
                    <p className="font-medium">Incluir jefes en reportes globales</p>
                    <p className="text-sm text-muted-foreground">
                      Por defecto, los jefes de departamento NO aparecen en reportes globales
                    </p>
                  </div>
                  <Switch
                    checked={generalConfig.includeHeadsInGlobalReports}
                    onCheckedChange={(checked) =>
                      setGeneralConfig((prev) => ({ ...prev, includeHeadsInGlobalReports: checked }))
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tolerancia de tardanza (minutos)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={generalConfig.lateToleranceMinutes}
                    onChange={(e) =>
                      setGeneralConfig((prev) => ({
                        ...prev,
                        lateToleranceMinutes: Number.parseInt(e.target.value || '0', 10),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Minutos después de la hora de entrada que se consideran tardanza
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Acumulación de vacaciones por día trabajado</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.0001}
                    value={generalConfig.vacationDaysPerWorkedDay}
                    onChange={(e) =>
                      setGeneralConfig((prev) => ({
                        ...prev,
                        vacationDaysPerWorkedDay: Number.parseFloat(e.target.value || '0'),
                      }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Ejemplo: 0.0833 ≈ 1 día de vacaciones acumulado cada 12 días trabajados.
                  </p>
                </div>

                <Button className="w-full" onClick={handleSaveGeneral} disabled={savingGeneral}>
                  {savingGeneral ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Guardar configuración general
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
