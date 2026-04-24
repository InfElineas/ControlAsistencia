CREATE OR REPLACE FUNCTION public.get_report_runs_operational_kpis_v2(
  _from TIMESTAMPTZ DEFAULT (now() - interval '30 days'),
  _scope TEXT DEFAULT NULL,
  _department_id UUID DEFAULT NULL
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
  WITH visible_runs AS (
    SELECT rr.*
    FROM public.report_runs rr
    WHERE rr.created_at >= _from
      AND (
        rr.requested_by = auth.uid()
        OR has_role(auth.uid(), 'global_manager')
        OR has_role(auth.uid(), 'superadmin')
        OR (
          rr.scope = 'department'
          AND rr.department_id IS NOT NULL
          AND is_head_of_department(rr.department_id, auth.uid())
        )
      )
      AND (_scope IS NULL OR rr.scope = _scope)
      AND (_department_id IS NULL OR rr.department_id = _department_id)
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
  FROM visible_runs;
$$;

GRANT EXECUTE ON FUNCTION public.get_report_runs_operational_kpis_v2(TIMESTAMPTZ, TEXT, UUID) TO authenticated;
