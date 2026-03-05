import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Database, FileSpreadsheet, Mail, Play, RefreshCcw, ShieldCheck, Trash2, Users, Wrench } from 'lucide-react';
import { getHighestRole } from '@/lib/roles';
import { resolveAuthRedirectUrl } from '@/lib/auth-redirect';
import * as XLSX from 'xlsx';

type AuditLog = {
  id: string;
  action: string;
  table_name: string | null;
  created_at: string;
  user_id: string | null;
  record_id: string | null;
  description: string | null;
  source_ip: string | null;
  metadata: Record<string, unknown>;
};

type ManagedUser = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
};

type Stats = {
  totalLogs: number;
  totalErrors: number;
  totalUsers: number;
  totalGlobalManagerChanges: number;
  uniqueIps: number;
};


type CheckoutMode = 'manual' | 'schedule' | 'geofence_exit';

type SqlConsoleResult = {
  type: 'select' | 'command';
  row_count: number;
  rows: Record<string, unknown>[];
};

const INITIAL_SQL = `select created_at, user_id, action, description, source_ip
from public.audit_log
order by created_at desc
limit 25;`;

const EMPTY_STATS: Stats = {
  totalLogs: 0,
  totalErrors: 0,
  totalUsers: 0,
  totalGlobalManagerChanges: 0,
  uniqueIps: 0,
};

export default function SuperAdmin() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [accountActionUserId, setAccountActionUserId] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery] = useState(INITIAL_SQL);
  const [runningSql, setRunningSql] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqlConsoleResult | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importingHistory, setImportingHistory] = useState(false);
  const [importSummary, setImportSummary] = useState<{ imported_marks: number; missing_emails: string[] } | null>(null);
  const [checkoutMode, setCheckoutMode] = useState<CheckoutMode>('schedule');
  const [autoCheckoutTime, setAutoCheckoutTime] = useState('18:30');
  const [geofenceExitMinutes, setGeofenceExitMinutes] = useState(3);
  const [restDaysMinSeparation, setRestDaysMinSeparation] = useState(4);
  const [savingCheckoutSettings, setSavingCheckoutSettings] = useState(false);

  const logSystemError = useCallback(async (action: string, details: string, metadata?: Record<string, unknown>) => {
    if (!user?.id) return;

    try {
      await supabase.from('audit_log').insert({
        user_id: user.id,
        action,
        table_name: 'system',
        description: details,
        metadata: metadata || {},
      });
    } catch (logError) {
      console.error('Failed to persist audit error log', logError);
    }
  }, [user?.id]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: logData, error: logError, count: totalLogs },
        { data: profileData, error: profileError, count: totalUsers },
        { data: roleData, error: rolesError },
        { data: appConfigData, error: appConfigError },
      ] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, action, table_name, created_at, user_id, record_id, description, source_ip, metadata', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('user_id, full_name, email', { count: 'exact' }).order('full_name', { ascending: true }),
        supabase.from('user_roles').select('user_id, role'),
        supabase
          .from('app_config')
          .select('key, value')
          .in('key', ['attendance_checkout_mode', 'attendance_auto_checkout_time', 'attendance_geofence_exit_minutes', 'rest_days_min_separation']),
      ]);

      if (logError) throw logError;
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      if (appConfigError) throw appConfigError;

      const castedLogs = (logData ?? []) as AuditLog[];
      const rolesByUser = (roleData ?? []).reduce<Record<string, string[]>>((acc, item) => {
        if (!acc[item.user_id]) acc[item.user_id] = [];
        acc[item.user_id].push(item.role);
        return acc;
      }, {});

      const usersData: ManagedUser[] = (profileData ?? []).map((profile) => ({
        user_id: profile.user_id,
        full_name: profile.full_name,
        email: profile.email,
        role: getHighestRole(rolesByUser[profile.user_id] ?? []),
      }));

      const errorCount = castedLogs.filter((item) => {
        const action = item.action.toLowerCase();
        return action.includes('error') || action.includes('failed');
      }).length;

      const globalManagerChanges = castedLogs.filter((item) => {
        const actorRole = String(item.metadata?.actor_role ?? '').toLowerCase();
        return actorRole === 'global_manager';
      }).length;

      const uniqueIps = new Set(castedLogs.map((item) => item.source_ip).filter(Boolean)).size;

      const modeValue = appConfigData?.find((item) => item.key === 'attendance_checkout_mode')?.value;
      const timeValue = appConfigData?.find((item) => item.key === 'attendance_auto_checkout_time')?.value;
      const minutesValue = appConfigData?.find((item) => item.key === 'attendance_geofence_exit_minutes')?.value;
      const restSeparationValue = appConfigData?.find((item) => item.key === 'rest_days_min_separation')?.value;

      if (modeValue === 'manual' || modeValue === 'schedule' || modeValue === 'geofence_exit') {
        setCheckoutMode(modeValue);
      }
      if (typeof timeValue === 'string' && /^\d{2}:\d{2}$/.test(timeValue)) {
        setAutoCheckoutTime(timeValue);
      }
      if (typeof minutesValue === 'number' && Number.isFinite(minutesValue)) {
        setGeofenceExitMinutes(Math.max(0, Math.round(minutesValue)));
      }
      if (typeof restSeparationValue === 'number' && Number.isFinite(restSeparationValue)) {
        setRestDaysMinSeparation(Math.max(1, Math.round(restSeparationValue)));
      }

      setLogs(castedLogs);
      setUsers(usersData);
      setStats({
        totalLogs: totalLogs ?? castedLogs.length,
        totalErrors: errorCount,
        totalUsers: totalUsers ?? usersData.length,
        totalGlobalManagerChanges: globalManagerChanges,
        uniqueIps,
      });
    } catch (error) {
      console.error(error);
      void logSystemError('superadmin_data_load_error', `Error al cargar panel técnico: ${error instanceof Error ? error.message : 'desconocido'}`);
      toast({
        title: 'Error',
        description: 'No fue posible cargar el panel técnico de superadmin.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [logSystemError, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const errorLogs = useMemo(() => logs.filter((item) => item.action.toLowerCase().includes('error') || item.action.toLowerCase().includes('failed')), [logs]);

  const globalManagerLogs = useMemo(
    () => logs.filter((item) => String(item.metadata?.actor_role ?? '').toLowerCase() === 'global_manager'),
    [logs]
  );

  const sqlColumns = useMemo(() => {
    if (!sqlResult || !sqlResult.rows.length) return [];
    return Object.keys(sqlResult.rows[0]);
  }, [sqlResult]);

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

  const importAttendanceHistory = async (file: File) => {
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
        throw new Error('No se encontraron filas válidas (requiere columnas email/correo y fecha/date)');
      }

      const { data, error } = await supabase.functions.invoke('import-attendance-history', {
        body: {
          source_file_name: file.name,
          rows: preparedRows,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setImportSummary({
        imported_marks: Number(data?.imported_marks ?? 0),
        missing_emails: (data?.missing_emails ?? []) as string[],
      });

      toast({
        title: 'Histórico importado',
        description: `Marcajes importados: ${data?.imported_marks ?? 0}`,
      });

      await loadData();
    } catch (error) {
      console.error(error);
      void logSystemError('import_attendance_history_error', `Error al importar histórico: ${error instanceof Error ? error.message : 'desconocido'}`, { file_name: file.name });
      toast({
        title: 'Error al importar',
        description: 'No se pudo importar el archivo Excel histórico.',
        variant: 'destructive',
      });
    } finally {
      setImportingHistory(false);
    }
  };

  const runSqlQuery = async () => {
    try {
      setRunningSql(true);
      const { data, error } = await supabase.rpc('execute_superadmin_sql', {
        _query: sqlQuery,
      });

      if (error) throw error;

      const result = data as SqlConsoleResult;
      setSqlResult(result);
      toast({ title: 'Consulta ejecutada', description: `Filas: ${result.row_count}` });
    } catch (error) {
      console.error(error);
      void logSystemError('sql_console_error', `Error SQL: ${error instanceof Error ? error.message : 'desconocido'}`, { query: sqlQuery });
      toast({
        title: 'Error SQL',
        description: 'No se pudo ejecutar la consulta. Revisa sintaxis y permisos.',
        variant: 'destructive',
      });
    } finally {
      setRunningSql(false);
    }
  };

  const sendPasswordResetEmail = async (targetUserEmail: string) => {
    try {
      setAccountActionUserId(targetUserEmail);

      const redirectTo = resolveAuthRedirectUrl(window.location.origin) || `${window.location.origin}/auth`;
      const { error } = await supabase.auth.resetPasswordForEmail(targetUserEmail, { redirectTo });

      if (error) throw error;

      toast({
        title: 'Correo enviado',
        description: 'Se envió un enlace seguro para restablecer la contraseña al usuario.',
      });
    } catch (error) {
      console.error(error);
      void logSystemError('password_reset_email_error', `No se pudo enviar email de restablecimiento: ${error instanceof Error ? error.message : 'desconocido'}`, {
        target_email: targetUserEmail,
      });
      toast({ title: 'Error', description: 'No se pudo enviar el email de restablecimiento.', variant: 'destructive' });
    } finally {
      setAccountActionUserId(null);
    }
  };


  const handleSaveCheckoutSettings = async () => {
    try {
      setSavingCheckoutSettings(true);

      const normalizedMinutes = Math.max(0, Math.round(geofenceExitMinutes));
      const normalizedTime = /^\d{2}:\d{2}$/.test(autoCheckoutTime) ? autoCheckoutTime : '18:30';

      const { error } = await supabase
        .from('app_config')
        .upsert([
          {
            key: 'attendance_checkout_mode',
            value: checkoutMode,
            description: 'Modo de salida de asistencia: manual, schedule o geofence_exit',
          },
          {
            key: 'attendance_auto_checkout_time',
            value: normalizedTime,
            description: 'Hora de salida automática cuando el modo es schedule (HH:mm)',
          },
          {
            key: 'attendance_geofence_exit_minutes',
            value: normalizedMinutes,
            description: 'Minutos continuos fuera de la zona para salida automática por geofence',
          },
          {
            key: 'rest_days_min_separation',
            value: Math.max(1, Math.round(restDaysMinSeparation)),
            description: 'Separación mínima entre días de descanso (parámetro global)',
          },
        ], { onConflict: 'key' });

      if (error) throw error;

      setGeofenceExitMinutes(normalizedMinutes);
      setAutoCheckoutTime(normalizedTime);

      toast({
        title: 'Configuración guardada',
        description: 'Se actualizó el modo de salida y los parámetros automáticos.',
      });
    } catch (error) {
      console.error(error);
      void logSystemError('checkout_settings_save_error', `No se pudo guardar configuración: ${error instanceof Error ? error.message : 'desconocido'}`, {
        checkout_mode: checkoutMode,
        auto_checkout_time: autoCheckoutTime,
        geofence_exit_minutes: geofenceExitMinutes,
        rest_days_min_separation: restDaysMinSeparation,
      });
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración de salida.',
        variant: 'destructive',
      });
    } finally {
      setSavingCheckoutSettings(false);
    }
  };

  const deleteUser = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast({ title: 'Operación bloqueada', description: 'No puedes eliminar tu propio usuario.', variant: 'destructive' });
      return;
    }

    try {
      setAccountActionUserId(targetUserId);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          user_id: targetUserId,
        },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Usuario eliminado', description: 'Cuenta eliminada correctamente.' });
      await loadData();
    } catch (error) {
      console.error(error);
      void logSystemError('delete_user_error', `No se pudo eliminar usuario: ${error instanceof Error ? error.message : 'desconocido'}`, { target_user_id: targetUserId });
      toast({ title: 'Error', description: 'No se pudo eliminar el usuario.', variant: 'destructive' });
    } finally {
      setAccountActionUserId(null);
    }
  };

  if (role !== 'superadmin') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Solo superadmins pueden acceder a esta consola.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-[1500px] mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Panel administrativo técnico</h1>
          <p className="text-sm text-muted-foreground">Visión global del sistema, seguridad y operación técnica.</p>
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Logs totales</p><p className="text-xl font-semibold">{stats.totalLogs}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Errores detectados</p><p className="text-xl font-semibold">{stats.totalErrors}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Usuarios</p><p className="text-xl font-semibold">{stats.totalUsers}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">IPs únicas</p><p className="text-xl font-semibold">{stats.uniqueIps}</p></CardContent></Card>
          <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Cambios por gestores</p><p className="text-xl font-semibold">{stats.totalGlobalManagerChanges}</p></CardContent></Card>
        </div>


        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Modo de salida configurable</CardTitle>
            <CardDescription>Define cómo se registra la salida para todo el sistema.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm font-medium">Modo de salida</p>
              <Select value={checkoutMode} onValueChange={(value: CheckoutMode) => setCheckoutMode(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual por usuario</SelectItem>
                  <SelectItem value="schedule">Automática por horario</SelectItem>
                  <SelectItem value="geofence_exit">Automática por salida de zona</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Hora de salida automática</p>
              <Input
                type="time"
                value={autoCheckoutTime}
                onChange={(event) => setAutoCheckoutTime(event.target.value)}
                disabled={checkoutMode !== 'schedule'}
              />
              <p className="text-xs text-muted-foreground">Aplica cuando el modo es automática por horario.</p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Minutos fuera de zona</p>
              <Input
                type="number"
                min={0}
                step={1}
                value={geofenceExitMinutes}
                onChange={(event) => setGeofenceExitMinutes(Number(event.target.value || 0))}
                disabled={checkoutMode !== 'geofence_exit'}
              />
              <p className="text-xs text-muted-foreground">Tiempo continuo fuera de geofence antes de marcar salida.</p>
            </div>


            <div className="space-y-2">
              <p className="text-sm font-medium">Separación mínima de descansos (días)</p>
              <Input
                type="number"
                min={1}
                step={1}
                value={restDaysMinSeparation}
                onChange={(event) => setRestDaysMinSeparation(Number(event.target.value || 1))}
              />
              <p className="text-xs text-muted-foreground">Parámetro global para validar descansos semanales.</p>
            </div>

            <div className="md:col-span-3 flex justify-end">
              <Button onClick={handleSaveCheckoutSettings} disabled={savingCheckoutSettings}>
                {savingCheckoutSettings ? 'Guardando...' : 'Guardar modo de salida'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><Database className="h-4 w-4" /> SQL Console del sistema</CardTitle>
              <CardDescription>Consulta recursos técnicos y ejecuta comandos como en SQL Editor.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea value={sqlQuery} onChange={(event) => setSqlQuery(event.target.value)} className="min-h-[180px] font-mono text-xs" />
              <div className="flex justify-end">
                <Button onClick={runSqlQuery} disabled={runningSql}><Play className="h-4 w-4 mr-2" />{runningSql ? 'Ejecutando...' : 'Ejecutar SQL'}</Button>
              </div>

              {sqlResult && (
                <div className="space-y-2">
                  <Badge variant="outline">{sqlResult.type} · {sqlResult.row_count} filas</Badge>
                  <div className="max-h-[280px] overflow-auto border rounded-md">
                    {sqlResult.rows.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {sqlColumns.map((column) => (<TableHead key={column}>{column}</TableHead>))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sqlResult.rows.slice(0, 120).map((row, index) => (
                            <TableRow key={index}>
                              {sqlColumns.map((column) => (
                                <TableCell key={`${index}-${column}`} className="text-xs align-top whitespace-pre-wrap">
                                  {typeof row[column] === 'object' ? JSON.stringify(row[column]) : String(row[column] ?? '')}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="p-3 text-xs text-muted-foreground">La consulta no devolvió filas.</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Errores del sistema</CardTitle>
                  <CardDescription>Todos los eventos de error/fail detectados.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadData}><RefreshCcw className="h-4 w-4 mr-1" />Recargar</Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[260px] overflow-auto">
                {loading ? (
                  <p className="text-xs text-muted-foreground">Cargando...</p>
                ) : errorLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin errores recientes.</p>
                ) : (
                  errorLogs.map((item) => (
                    <div key={item.id} className="border rounded-md p-2 bg-amber-50/40 dark:bg-amber-950/20">
                      <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />{item.action}</p>
                      <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()} · {item.description || 'Sin descripción'} · IP: {item.source_ip || 'N/A'}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" /> Cambios por gestores globales</CardTitle>
                <CardDescription>Acciones técnicas hechas por global_manager.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[220px] overflow-auto">
                {globalManagerLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin cambios registrados por gestores globales.</p>
                ) : (
                  globalManagerLogs.map((item) => (
                    <div key={item.id} className="border rounded-md p-2">
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-muted-foreground">User: {item.user_id || 'N/A'} · {item.description || 'Sin descripción'}</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Log global del sistema</CardTitle>
            <CardDescription>Todos los logs técnicos con usuario, descripción, IP y cambios.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[380px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Recurso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs">{new Date(item.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{item.user_id || 'N/A'}</TableCell>
                    <TableCell className="text-xs">{item.action}</TableCell>
                    <TableCell className="text-xs max-w-[280px] whitespace-pre-wrap">{item.description || 'Sin descripción'}</TableCell>
                    <TableCell className="text-xs">{item.source_ip || 'N/A'}</TableCell>
                    <TableCell className="text-xs">{item.table_name || 'N/A'} · {item.record_id || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> Importar histórico desde Excel</CardTitle>
            <CardDescription>
              Sube un Excel con columnas <strong>email/correo</strong> y <strong>fecha/date</strong> para cargar trabajo histórico y ajustar estadísticas/vacaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="max-w-md"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setImportFileName(file.name);
                  await importAttendanceHistory(file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
            {importingHistory && <p className="text-xs text-muted-foreground">Importando histórico...</p>}
            {importFileName && <p className="text-xs text-muted-foreground">Último archivo: {importFileName}</p>}
            {importSummary && (
              <div className="text-xs rounded-md border p-2 space-y-1">
                <p>Marcajes importados: <strong>{importSummary.imported_marks}</strong></p>
                <p>Correos no encontrados: <strong>{importSummary.missing_emails.length}</strong></p>
                {importSummary.missing_emails.length > 0 && (
                  <p className="text-muted-foreground break-all">{importSummary.missing_emails.slice(0, 12).join(', ')}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Gestión total de cuentas</CardTitle>
            <CardDescription>Envío de enlace de restablecimiento por correo y eliminación de usuarios.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[350px] overflow-auto">
            {users.map((managedUser) => (
              <div key={managedUser.user_id} className="rounded-md border p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium leading-tight">{managedUser.full_name}</p>
                    <p className="text-xs text-muted-foreground">{managedUser.email}</p>
                  </div>
                  <Badge variant="secondary" className="capitalize">{managedUser.role.replace('_', ' ')}</Badge>
                </div>

                <div className="grid gap-2 lg:grid-cols-[1fr_auto]">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendPasswordResetEmail(managedUser.email)}
                    disabled={accountActionUserId === managedUser.email}
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" /> Enviar correo de restablecimiento
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteUser(managedUser.user_id)}
                    disabled={accountActionUserId === managedUser.user_id || managedUser.user_id === user?.id}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
