import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, Download } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';

type ReportScope = 'global' | 'department';

interface ReportRunItem {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  period_start: string;
  period_end: string;
  created_at: string;
  row_count: number | null;
  artifact_bucket: string | null;
  artifact_path: string | null;
  error: string | null;
}

interface ReportRunsCardProps {
  scope: ReportScope;
  departmentId?: string | null;
  title?: string;
}

interface ReportRunKpis {
  total_runs: number | null;
  completed_runs: number | null;
  failed_runs: number | null;
  error_rate_pct: number | null;
  availability_pct: number | null;
  p95_duration_ms: number | null;
  avg_duration_ms: number | null;
  rows_processed: number | null;
}

export function ReportRunsCard({ scope, departmentId = null, title = 'Reportes generados' }: ReportRunsCardProps) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReportRunItem[]>([]);
  const [kpis, setKpis] = useState<ReportRunKpis | null>(null);

  const fetchRuns = async () => {
    setLoading(true);

    const { data: kpiData } = await supabase.rpc('get_report_runs_operational_kpis', {
      _from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (Array.isArray(kpiData) && kpiData[0]) {
      setKpis(kpiData[0] as ReportRunKpis);
    }

    let query = supabase
      .from('report_runs' as never)
      .select('id, status, period_start, period_end, created_at, row_count, artifact_bucket, artifact_path, error')
      .eq('scope', scope)
      .order('created_at', { ascending: false })
      .limit(8);

    if (scope === 'department' && departmentId) {
      query = query.eq('department_id', departmentId);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('No se pudieron cargar los reportes previos');
      setItems([]);
    } else {
      setItems((data || []) as unknown as ReportRunItem[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchRuns();
  }, [scope, departmentId]);

  const handleDownload = async (item: ReportRunItem) => {
    if (!item.artifact_bucket || !item.artifact_path) {
      toast.error('Este reporte aún no tiene archivo disponible');
      return;
    }

    const { data, error } = await supabase.storage
      .from(item.artifact_bucket)
      .createSignedUrl(item.artifact_path, 60);

    if (error || !data?.signedUrl) {
      toast.error('No se pudo abrir el archivo del reporte');
      return;
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button variant="outline" size="sm" onClick={fetchRuns} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent>
        {kpis && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mb-4">
            <div className="rounded-md border p-2">
              <p className="text-[11px] text-muted-foreground">Error rate (30d)</p>
              <p className="font-semibold">{kpis.error_rate_pct ?? 0}%</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-[11px] text-muted-foreground">Disponibilidad (30d)</p>
              <p className="font-semibold">{kpis.availability_pct ?? 0}%</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-[11px] text-muted-foreground">p95 duración</p>
              <p className="font-semibold">{kpis.p95_duration_ms ? `${Math.round(kpis.p95_duration_ms / 1000)}s` : '-'}</p>
            </div>
            <div className="rounded-md border p-2">
              <p className="text-[11px] text-muted-foreground">Filas procesadas</p>
              <p className="font-semibold">{kpis.rows_processed ?? 0}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay ejecuciones registradas.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {format(new Date(item.created_at), "d 'de' MMM yyyy, HH:mm", { locale: es })}
                  </p>
                  <span className="text-xs text-muted-foreground">{item.status}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Periodo: {item.period_start} → {item.period_end} · Filas: {item.row_count ?? '-'}
                </p>
                {item.error && <p className="text-xs text-destructive">{item.error}</p>}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownload(item)}
                  disabled={item.status !== 'completed' || !item.artifact_path}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Reutilizar archivo
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
