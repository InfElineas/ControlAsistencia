CREATE TABLE IF NOT EXISTS public.report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'department')),
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  rules_version TEXT NOT NULL DEFAULT 'v1',
  rules_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')) DEFAULT 'queued',
  row_count INTEGER,
  checksum TEXT,
  artifact_bucket TEXT,
  artifact_path TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_runs_requested_by_created_at
  ON public.report_runs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_runs_scope_period
  ON public.report_runs(scope, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_report_runs_status_created_at
  ON public.report_runs(status, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_report_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS report_runs_set_updated_at ON public.report_runs;
CREATE TRIGGER report_runs_set_updated_at
BEFORE UPDATE ON public.report_runs
FOR EACH ROW
EXECUTE FUNCTION public.set_report_runs_updated_at();

ALTER TABLE public.report_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own report runs" ON public.report_runs;
CREATE POLICY "Users can view own report runs"
ON public.report_runs
FOR SELECT
USING (
  requested_by = auth.uid()
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR (
    scope = 'department'
    AND department_id IS NOT NULL
    AND is_head_of_department(auth.uid(), department_id)
  )
);

DROP POLICY IF EXISTS "Users can insert own report runs" ON public.report_runs;
CREATE POLICY "Users can insert own report runs"
ON public.report_runs
FOR INSERT
WITH CHECK (requested_by = auth.uid());

DROP POLICY IF EXISTS "Users can update own report runs" ON public.report_runs;
CREATE POLICY "Users can update own report runs"
ON public.report_runs
FOR UPDATE
USING (
  requested_by = auth.uid()
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
)
WITH CHECK (
  requested_by = auth.uid()
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'monthly-reports',
  'monthly-reports',
  false,
  52428800,
  ARRAY['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']::text[]
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'monthly-reports'
);
