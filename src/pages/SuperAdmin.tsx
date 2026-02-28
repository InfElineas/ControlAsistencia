import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  AlertTriangle,
  Database,
  FileWarning,
  KeyRound,
  Play,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { getHighestRole } from '@/lib/roles';

type AuditLog = {
  id: string;
  action: string;
  table_name: string | null;
  created_at: string;
};

type AppConfig = {
  id: string;
  key: string;
  value: unknown;
};

type ManagedUser = {
  user_id: string;
  full_name: string;
  email: string;
  role: string;
};

type Stats = {
  totalUsers: number;
  totalDepartments: number;
  totalAttendanceMarks: number;
  totalVacationRequests: number;
};

type SqlConsoleResult = {
  type: 'select' | 'command';
  row_count: number;
  rows: Record<string, unknown>[];
};

const INITIAL_SQL = `select
  action,
  table_name,
  created_at
from public.audit_log
order by created_at desc
limit 20;`;

const EMPTY_STATS: Stats = {
  totalUsers: 0,
  totalDepartments: 0,
  totalAttendanceMarks: 0,
  totalVacationRequests: 0,
};

export default function SuperAdmin() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [accountActionUserId, setAccountActionUserId] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery] = useState(INITIAL_SQL);
  const [runningSql, setRunningSql] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqlConsoleResult | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: logData, error: logError },
        { data: configData, error: configError },
        { data: profileData, error: profileError, count: totalUsers },
        { data: roleData, error: rolesError },
        { count: totalDepartments, error: departmentsError },
        { count: totalAttendanceMarks, error: attendanceError },
        { count: totalVacationRequests, error: vacationsError },
      ] = await Promise.all([
        supabase.from('audit_log').select('id, action, table_name, created_at').order('created_at', { ascending: false }).limit(80),
        supabase.from('app_config').select('id, key, value').order('key', { ascending: true }),
        supabase.from('profiles').select('user_id, full_name, email', { count: 'exact' }).order('full_name', { ascending: true }),
        supabase.from('user_roles').select('user_id, role'),
        supabase.from('departments').select('id', { count: 'exact', head: true }),
        supabase.from('attendance_marks').select('id', { count: 'exact', head: true }),
        supabase.from('vacation_requests').select('id', { count: 'exact', head: true }),
      ]);

      if (logError) throw logError;
      if (configError) throw configError;
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      if (departmentsError) throw departmentsError;
      if (attendanceError) throw attendanceError;
      if (vacationsError) throw vacationsError;

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

      const cfg = (configData ?? []) as AppConfig[];
      setLogs((logData ?? []) as AuditLog[]);
      setConfigs(cfg);
      setUsers(usersData);
      setStats({
        totalUsers: totalUsers ?? 0,
        totalDepartments: totalDepartments ?? 0,
        totalAttendanceMarks: totalAttendanceMarks ?? 0,
        totalVacationRequests: totalVacationRequests ?? 0,
      });
      setDraftValues(
        cfg.reduce<Record<string, string>>((acc, item) => {
          acc[item.key] = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
          return acc;
        }, {})
      );
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error',
        description: 'No fue posible cargar la consola de superadmin.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const errorLogs = useMemo(
    () => logs.filter((item) => item.action.toLowerCase().includes('error') || item.action.toLowerCase().includes('failed')),
    [logs]
  );

  const sqlColumns = useMemo(() => {
    if (!sqlResult || !sqlResult.rows.length) return [];
    return Object.keys(sqlResult.rows[0]);
  }, [sqlResult]);

  const saveConfig = async (key: string) => {
    try {
      const value = draftValues[key] ?? '';
      let parsedValue: unknown = value;

      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      const { error } = await supabase
        .from('app_config')
        .update({ value: parsedValue })
        .eq('key', key);

      if (error) throw error;
      toast({ title: 'Configuración guardada', description: `Clave actualizada: ${key}` });
      await loadData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: `No se pudo guardar ${key}.`, variant: 'destructive' });
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

      toast({
        title: 'Consulta ejecutada',
        description: `Filas afectadas/devueltas: ${result.row_count}`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error SQL',
        description: 'No se pudo ejecutar la consulta. Revisa sintaxis y permisos.',
        variant: 'destructive',
      });
    } finally {
      setRunningSql(false);
    }
  };

  const resetUserPassword = async (targetUserId: string) => {
    const newPassword = (passwordDrafts[targetUserId] ?? '').trim();

    if (newPassword.length < 8) {
      toast({
        title: 'Contraseña inválida',
        description: 'La nueva contraseña debe tener al menos 8 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setAccountActionUserId(targetUserId);
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: {
          user_id: targetUserId,
          new_password: newPassword,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setPasswordDrafts((prev) => ({ ...prev, [targetUserId]: '' }));
      toast({ title: 'Contraseña actualizada', description: 'Se restableció la contraseña del usuario.' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'No se pudo restablecer la contraseña.', variant: 'destructive' });
    } finally {
      setAccountActionUserId(null);
    }
  };

  const deleteUser = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast({
        title: 'Operación bloqueada',
        description: 'No puedes eliminar tu propio usuario desde esta consola.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setAccountActionUserId(targetUserId);
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: {
          user_id: targetUserId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Usuario eliminado', description: 'Cuenta eliminada correctamente.' });
      await loadData();
    } catch (error) {
      console.error(error);
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
          <h1 className="text-2xl font-bold tracking-tight">Consola Superadmin</h1>
          <p className="text-sm text-muted-foreground">Control total del sistema: estadísticas, SQL, cuentas y auditoría.</p>
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Eventos auditados</p>
              <p className="text-xl font-semibold">{logs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Errores recientes</p>
              <p className="text-xl font-semibold">{errorLogs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Usuarios</p>
              <p className="text-xl font-semibold">{stats.totalUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Departamentos</p>
              <p className="text-xl font-semibold">{stats.totalDepartments}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Marcajes / Vacaciones</p>
              <p className="text-xl font-semibold">{stats.totalAttendanceMarks} / {stats.totalVacationRequests}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4" /> SQL Console
              </CardTitle>
              <CardDescription>Ejecuta consultas SQL como superadmin (similar al SQL Editor).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={sqlQuery}
                onChange={(event) => setSqlQuery(event.target.value)}
                className="min-h-[180px] font-mono text-xs"
              />
              <div className="flex justify-end">
                <Button onClick={runSqlQuery} disabled={runningSql}>
                  <Play className="h-4 w-4 mr-2" />
                  {runningSql ? 'Ejecutando...' : 'Ejecutar SQL'}
                </Button>
              </div>

              {sqlResult && (
                <div className="space-y-2">
                  <Badge variant="outline">{sqlResult.type} · {sqlResult.row_count} filas</Badge>
                  <div className="max-h-[260px] overflow-auto border rounded-md">
                    {sqlResult.rows.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            {sqlColumns.map((column) => (
                              <TableHead key={column}>{column}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sqlResult.rows.slice(0, 100).map((row, index) => (
                            <TableRow key={index}>
                              {sqlColumns.map((column) => (
                                <TableCell key={`${index}-${column}`} className="text-xs align-top whitespace-pre-wrap">
                                  {typeof row[column] === 'object'
                                    ? JSON.stringify(row[column])
                                    : String(row[column] ?? '')}
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
                  <CardTitle className="text-base">Logs recientes</CardTitle>
                  <CardDescription>Eventos de auditoría.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={loadData}>
                  <RefreshCcw className="h-4 w-4 mr-1" /> Recargar
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[280px] overflow-auto">
                {loading ? (
                  <p className="text-xs text-muted-foreground">Cargando...</p>
                ) : logs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin datos de auditoría.</p>
                ) : (
                  logs.map((item) => (
                    <div key={item.id} className="border rounded-md p-2">
                      <p className="text-sm font-medium">{item.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.table_name || 'N/A'} · {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Errores detectados</CardTitle>
                <CardDescription>Acciones que contienen error/fail.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[200px] overflow-auto">
                {errorLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin errores recientes.</p>
                ) : (
                  errorLogs.map((item) => (
                    <div key={item.id} className="border rounded-md p-2 bg-amber-50/40 dark:bg-amber-950/20">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        {item.action}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Gestión total de cuentas
            </CardTitle>
            <CardDescription>Reset de contraseña y eliminación de usuarios desde la plataforma.</CardDescription>
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

                <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                  <Input
                    type="password"
                    value={passwordDrafts[managedUser.user_id] ?? ''}
                    onChange={(event) =>
                      setPasswordDrafts((prev) => ({
                        ...prev,
                        [managedUser.user_id]: event.target.value,
                      }))
                    }
                    placeholder="Nueva contraseña (mínimo 8 caracteres)"
                    className="h-8"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resetUserPassword(managedUser.user_id)}
                    disabled={accountActionUserId === managedUser.user_id}
                  >
                    <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset
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

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="h-4 w-4" /> Ajustes rápidos
            </CardTitle>
            <CardDescription>Configuraciones compactas (si quieres más detalle, usa Configuración).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
              {configs.map((config) => (
                <div key={config.id} className="border rounded-md p-2 space-y-1">
                  <Label className="text-xs font-semibold leading-tight block">{config.key}</Label>
                  <Input
                    className="h-8 text-xs"
                    value={draftValues[config.key] ?? ''}
                    onChange={(event) => setDraftValues((prev) => ({ ...prev, [config.key]: event.target.value }))}
                  />
                  <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => saveConfig(config.key)}>
                    Guardar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
