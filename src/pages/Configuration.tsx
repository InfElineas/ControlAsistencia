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
import { Loader2, MapPin, Clock, Settings, Save, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { mapGenericActionError } from '@/lib/error-messages';
import * as XLSX from 'xlsx';

type AttendanceImportSummary = {
  imported_marks: number;
  missing_emails: string[];
};

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
  const [importingHistory, setImportingHistory] = useState(false);
  const [importSummary, setImportSummary] = useState<AttendanceImportSummary | null>(null);
  const [workLocations, setWorkLocations] = useState<Array<{ id: string; name: string; center_lat: number; center_lng: number; radius_meters: number; accuracy_threshold: number; block_on_poor_accuracy: boolean; is_active: boolean }>>([]);
  const [newLocation, setNewLocation] = useState({ name: '', center_lat: 40.416775, center_lng: -3.70379, radius_meters: 100, accuracy_threshold: 50, block_on_poor_accuracy: true });

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



  useEffect(() => {
    const fetchWorkLocations = async () => {
      const { data } = await supabase
        .from('work_locations')
        .select('*')
        .order('name', { ascending: true });

      setWorkLocations((data || []) as Array<{ id: string; name: string; center_lat: number; center_lng: number; radius_meters: number; accuracy_threshold: number; block_on_poor_accuracy: boolean; is_active: boolean }>);
    };

    fetchWorkLocations();
  }, []);

  const handleCreateWorkLocation = async () => {
    if (!newLocation.name.trim()) {
      toast.error('Debes indicar un nombre para la ubicación.');
      return;
    }

    const { error } = await supabase.from('work_locations').insert({
      name: newLocation.name.trim(),
      center_lat: newLocation.center_lat,
      center_lng: newLocation.center_lng,
      radius_meters: newLocation.radius_meters,
      accuracy_threshold: newLocation.accuracy_threshold,
      block_on_poor_accuracy: newLocation.block_on_poor_accuracy,
      is_active: true,
    });

    if (error) {
      toast.error(mapGenericActionError(error, 'No se pudo crear la ubicación de trabajo.'));
      return;
    }

    const { data } = await supabase.from('work_locations').select('*').order('name', { ascending: true });
    setWorkLocations((data || []) as Array<{ id: string; name: string; center_lat: number; center_lng: number; radius_meters: number; accuracy_threshold: number; block_on_poor_accuracy: boolean; is_active: boolean }>);
    setNewLocation({ name: '', center_lat: 40.416775, center_lng: -3.70379, radius_meters: 100, accuracy_threshold: 50, block_on_poor_accuracy: true });
    toast.success('Ubicación creada correctamente.');
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

  const normalizeHeader = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_');

  const parseExcelDate = (value: unknown): string | null => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }

      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
      return null;
    }

    if (typeof value === 'number') {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      const year = parsed.y.toString().padStart(4, '0');
      const month = parsed.m.toString().padStart(2, '0');
      const day = parsed.d.toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    return null;
  };

  const handleImportAttendanceHistory = async (file: File) => {
    try {
      setImportingHistory(true);
      setImportSummary(null);

      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '' });

      const preparedRows = rawRows.flatMap((row) => {
        const normalized = Object.entries(row).reduce<Record<string, unknown>>((acc, [key, val]) => {
          acc[normalizeHeader(key)] = val;
          return acc;
        }, {});

        const emailValue = String(normalized.email ?? normalized.correo ?? '').trim().toLowerCase();
        const dateValue = parseExcelDate(normalized.fecha ?? normalized.date ?? normalized.fecha_trabajo ?? normalized.work_date ?? null);

        if (!emailValue || !dateValue) return [];

        return [{ email: emailValue, date: dateValue }];
      });

      if (preparedRows.length === 0) {
        throw new Error('No se encontraron filas válidas (requiere email/correo y fecha/date)');
      }

      const { data, error } = await supabase.functions.invoke('import-attendance-history', {
        body: {
          source_file_name: file.name,
          rows: preparedRows,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const missingEmails = Array.isArray(data?.missing_emails)
        ? data.missing_emails.map((item: unknown) => String(item))
        : [];

      setImportSummary({
        imported_marks: Number(data?.imported_marks ?? 0),
        missing_emails: missingEmails,
      });

      toast.success(`Histórico importado. Marcajes agregados: ${Number(data?.imported_marks ?? 0)}`);
    } catch (error) {
      console.error(error);
      toast.error('No se pudo importar el histórico. Verifica formato y permisos.');
    } finally {
      setImportingHistory(false);
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


                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Ubicaciones de trabajo</CardTitle>
                    <CardDescription>Configura múltiples ubicaciones para que el empleado seleccione al iniciar sesión.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      {workLocations.map((location) => (
                        <div key={location.id} className="rounded-lg border p-3 text-sm">
                          <p className="font-semibold">{location.name}</p>
                          <p className="text-muted-foreground">Lat {location.center_lat} · Lng {location.center_lng} · Radio {location.radius_meters}m</p>
                        </div>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Nombre de ubicación"
                        value={newLocation.name}
                        onChange={(e) => setNewLocation((p) => ({ ...p, name: e.target.value }))}
                      />
                      <Input
                        type="number"
                        step="0.000001"
                        placeholder="Latitud"
                        value={newLocation.center_lat}
                        onChange={(e) => setNewLocation((p) => ({ ...p, center_lat: parseFloat(e.target.value) }))}
                      />
                      <Input
                        type="number"
                        step="0.000001"
                        placeholder="Longitud"
                        value={newLocation.center_lng}
                        onChange={(e) => setNewLocation((p) => ({ ...p, center_lng: parseFloat(e.target.value) }))}
                      />
                      <Input
                        type="number"
                        placeholder="Radio (m)"
                        value={newLocation.radius_meters}
                        onChange={(e) => setNewLocation((p) => ({ ...p, radius_meters: parseInt(e.target.value) }))}
                      />
                    </div>

                    <Button variant="outline" className="w-full" onClick={handleCreateWorkLocation}>
                      Crear ubicación
                    </Button>
                  </CardContent>
                </Card>

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

                <Card className="border-dashed">
                  <CardHeader className="space-y-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileSpreadsheet className="h-4 w-4" />
                      Importar asistencia histórica (Excel)
                    </CardTitle>
                    <CardDescription>
                      Carga datos anteriores para recalcular métricas anuales y vacaciones acumuladas.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Formato recomendado (una fila por día trabajado):</p>
                      <p>Columnas obligatorias: <strong>email</strong> (o <strong>correo</strong>) y <strong>fecha</strong> (o <strong>date</strong>).</p>
                      <p>Fecha admitida: <strong>YYYY-MM-DD</strong> o fecha válida de Excel.</p>
                      <p>Columnas opcionales (se ignoran): nombre, departamento, estado, observaciones.</p>
                    </div>

                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      disabled={importingHistory}
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;

                        await handleImportAttendanceHistory(file);
                        event.currentTarget.value = '';
                      }}
                    />

                    {importingHistory && (
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Importando histórico...
                      </p>
                    )}

                    {importSummary && (
                      <div className="rounded-md border p-3 text-sm space-y-1">
                        <p><strong>Marcajes importados:</strong> {importSummary.imported_marks}</p>
                        <p><strong>Correos no encontrados:</strong> {importSummary.missing_emails.length}</p>
                        {importSummary.missing_emails.length > 0 && (
                          <p className="text-xs text-muted-foreground break-words">
                            {importSummary.missing_emails.slice(0, 20).join(', ')}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground flex items-start gap-2">
                      <Upload className="h-3.5 w-3.5 mt-0.5" />
                      <span>
                        Si tu Excel está en formato anual por columnas (ene-dic), primero conviértelo a filas
                        <strong> (email + fecha)</strong> para una importación compatible.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
