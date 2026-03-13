ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_report_runs_status_finished_at
  ON public.report_runs(status, finished_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_runs_created_at_desc
  ON public.report_runs(created_at DESC);

INSERT INTO public.app_config (key, value, description)
SELECT 'report_slo_p95_minutes', '10'::jsonb, 'SLO: p95 de generación mensual en minutos'
WHERE NOT EXISTS (SELECT 1 FROM public.app_config WHERE key = 'report_slo_p95_minutes');

INSERT INTO public.app_config (key, value, description)
SELECT 'report_slo_error_rate_pct', '1'::jsonb, 'SLO: tasa máxima de error en exportaciones (%)'
WHERE NOT EXISTS (SELECT 1 FROM public.app_config WHERE key = 'report_slo_error_rate_pct');

INSERT INTO public.app_config (key, value, description)
SELECT 'report_slo_availability_pct', '99.5'::jsonb, 'SLO: disponibilidad mínima del pipeline (%)'
WHERE NOT EXISTS (SELECT 1 FROM public.app_config WHERE key = 'report_slo_availability_pct');

CREATE OR REPLACE FUNCTION public.get_report_runs_operational_kpis(
  _from TIMESTAMPTZ DEFAULT (now() - interval '30 days')
)
RETURNS TABLE(
  total_runs BIGINT,
  completed_runs BIGINT,
  failed_runs BIGINT,
  error_rate_pct NUMERIC,
  availability_pct NUMERIC,
  p95_duration_ms NUMERIC,
  avg_duration_ms NUMERIC,
  rows_processed BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT *
    FROM public.report_runs
    WHERE created_at >= _from
      AND (
        requested_by = auth.uid()
        OR has_role(auth.uid(), 'global_manager')
        OR has_role(auth.uid(), 'superadmin')
      )
  )
  SELECT
    COUNT(*) AS total_runs,
    COUNT(*) FILTER (WHERE status = 'completed') AS completed_runs,
    COUNT(*) FILTER (WHERE status = 'failed') AS failed_runs,
    ROUND((COUNT(*) FILTER (WHERE status = 'failed')::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100, 2) AS error_rate_pct,
    ROUND((COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*)::numeric, 0)) * 100, 2) AS availability_pct,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS p95_duration_ms,
    ROUND(AVG(duration_ms)::numeric, 2) AS avg_duration_ms,
    COALESCE(SUM(row_count), 0)::bigint AS rows_processed
  FROM scoped;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_runs_operational_kpis(TIMESTAMPTZ) TO authenticated;
