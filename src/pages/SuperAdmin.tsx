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
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Database, KeyRound, Play, RefreshCcw, ShieldCheck, Trash2, Users, Wrench } from 'lucide-react';
import { getHighestRole } from '@/lib/roles';

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
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [accountActionUserId, setAccountActionUserId] = useState<string | null>(null);
  const [sqlQuery, setSqlQuery] = useState(INITIAL_SQL);
  const [runningSql, setRunningSql] = useState(false);
  const [sqlResult, setSqlResult] = useState<SqlConsoleResult | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        { data: logData, error: logError, count: totalLogs },
        { data: profileData, error: profileError, count: totalUsers },
        { data: roleData, error: rolesError },
      ] = await Promise.all([
        supabase
          .from('audit_log')
          .select('id, action, table_name, created_at, user_id, record_id, description, source_ip, metadata', { count: 'exact' })
          .order('created_at', { ascending: false })
          .limit(200),
        supabase.from('profiles').select('user_id, full_name, email', { count: 'exact' }).order('full_name', { ascending: true }),
        supabase.from('user_roles').select('user_id, role'),
      ]);

      if (logError) throw logError;
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;

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
      toast({
        title: 'Error',
        description: 'No fue posible cargar el panel técnico de superadmin.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      toast({ title: 'Contraseña inválida', description: 'Debe tener al menos 8 caracteres.', variant: 'destructive' });
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
      toast({ title: 'Contraseña actualizada', description: 'Reset realizado correctamente.' });
      await loadData();
    } catch (error) {
      console.error(error);
      toast({ title: 'Error', description: 'No se pudo resetear la contraseña.', variant: 'destructive' });
    } finally {
      setAccountActionUserId(null);
    }
  };

  const deleteUser = async (targetUserId: string) => {
    if (targetUserId === user?.id) {
      toast({ title: 'Operación bloqueada', description: 'No puedes eliminar tu propio usuario.', variant: 'destructive' });
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
                      <p className="text-xs text-muted-foreground">{item.description || 'Sin descripción'} · IP: {item.source_ip || 'N/A'}</p>
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
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" /> Gestión total de cuentas</CardTitle>
            <CardDescription>Reset de contraseña y eliminación de usuarios desde el panel técnico.</CardDescription>
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
                    onChange={(event) => setPasswordDrafts((prev) => ({ ...prev, [managedUser.user_id]: event.target.value }))}
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
      </div>
    </AppLayout>
  );
}
