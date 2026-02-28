import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AlertTriangle, Database, FileWarning, RefreshCcw, Settings, ShieldCheck } from 'lucide-react';

type AuditLog = {
  id: string;
  action: string;
  table_name: string | null;
  created_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

type AppConfig = {
  id: string;
  key: string;
  value: unknown;
  description: string | null;
};

export default function SuperAdmin() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [configs, setConfigs] = useState<AppConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [{ data: logData, error: logError }, { data: configData, error: configError }] = await Promise.all([
        supabase.from('audit_log').select('id, action, table_name, created_at, old_data, new_data').order('created_at', { ascending: false }).limit(100),
        supabase.from('app_config').select('id, key, value, description').order('key', { ascending: true }),
      ]);

      if (logError) throw logError;
      if (configError) throw configError;

      const cfg = (configData ?? []) as AppConfig[];
      setLogs((logData ?? []) as AuditLog[]);
      setConfigs(cfg);
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

  const saveConfig = async (key: string) => {
    try {
      setSavingKey(key);
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

      toast({ title: 'Configuración actualizada', description: `Se actualizó la clave ${key}.` });
      await loadData();
    } catch (error) {
      console.error(error);
      toast({
        title: 'Error al actualizar',
        description: `No se pudo actualizar la clave ${key}.`,
        variant: 'destructive',
      });
    } finally {
      setSavingKey(null);
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consola Superadmin</h1>
          <p className="text-muted-foreground">Auditoría avanzada, monitoreo de incidentes y configuración global.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Eventos auditados</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-2xl font-bold">{logs.length}</span>
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Incidentes detectados</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-2xl font-bold">{errorLogs.length}</span>
              <FileWarning className="h-5 w-5 text-amber-500" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Claves de configuración</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-2xl font-bold">{configs.length}</span>
              <Settings className="h-5 w-5 text-muted-foreground" />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Logs del sitio / base de datos</CardTitle>
              <CardDescription>Últimos eventos registrados en audit_log.</CardDescription>
            </div>
            <Button variant="outline" onClick={loadData}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Recargar
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[340px] overflow-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay logs disponibles.</p>
            ) : (
              logs.map((item) => (
                <div key={item.id} className="rounded-lg border p-3">
                  <p className="font-medium text-sm">{item.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.table_name || 'N/A'} · {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reportes de errores</CardTitle>
            <CardDescription>Eventos con acción relacionada a error/fallo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[240px] overflow-auto">
            {errorLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin errores recientes en audit_log.</p>
            ) : (
              errorLogs.map((item) => (
                <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50/30 p-3 dark:border-amber-900 dark:bg-amber-950/20">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    {item.action}
                  </p>
                  <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuraciones globales</CardTitle>
            <CardDescription>Edita valores de app_config (JSON o texto).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {configs.map((config) => (
              <div key={config.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  {config.key}
                </div>
                {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
                <Label htmlFor={config.key} className="text-xs">Valor</Label>
                <Input
                  id={config.key}
                  value={draftValues[config.key] ?? ''}
                  onChange={(event) => setDraftValues((prev) => ({ ...prev, [config.key]: event.target.value }))}
                />
                <Button size="sm" onClick={() => saveConfig(config.key)} disabled={savingKey === config.key}>
                  Guardar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
