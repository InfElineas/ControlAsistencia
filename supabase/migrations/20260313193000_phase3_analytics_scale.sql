CREATE TABLE IF NOT EXISTS public.attendance_rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL UNIQUE,
  description TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_rule_versions_single_active
  ON public.attendance_rule_versions(is_active)
  WHERE is_active;

INSERT INTO public.attendance_rule_versions (version, description, config, is_active, activated_at)
SELECT
  'v1.0.0',
  'Reglas base de estado diario, tardanza por horario de departamento y geofence de primera entrada',
  jsonb_build_object(
    'daily_status_function', 'compute_daily_attendance_status',
    'report_rpc', 'get_attendance_report_monthly'
  ),
  true,
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.attendance_rule_versions WHERE version = 'v1.0.0'
);

ALTER TABLE public.report_runs
  ADD COLUMN IF NOT EXISTS rule_version_id UUID REFERENCES public.attendance_rule_versions(id);

UPDATE public.report_runs rr
SET rule_version_id = arv.id
FROM public.attendance_rule_versions arv
WHERE arv.is_active = true
  AND rr.rule_version_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_active_attendance_rule_version_id()
RETURNS UUID
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM public.attendance_rule_versions
  WHERE is_active = true
  ORDER BY activated_at DESC NULLS LAST, created_at DESC
  LIMIT 1
$$;

CREATE TABLE IF NOT EXISTS public.attendance_daily_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENTE', 'TARDE', 'AUSENTE', 'DESCANSO', 'NO_LABORABLE')),
  in_timestamp TIMESTAMPTZ,
  out_timestamp TIMESTAMPTZ,
  late_minutes INTEGER NOT NULL DEFAULT 0,
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  in_marks_count INTEGER NOT NULL DEFAULT 0,
  out_marks_count INTEGER NOT NULL DEFAULT 0,
  outside_geofence_count INTEGER NOT NULL DEFAULT 0,
  absence_justification TEXT,
  source_reason TEXT NOT NULL DEFAULT 'scheduled',
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rule_version_id UUID REFERENCES public.attendance_rule_versions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_facts_date_department
  ON public.attendance_daily_facts(date, department_id);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_facts_user_date
  ON public.attendance_daily_facts(user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_facts_status_date
  ON public.attendance_daily_facts(status, date DESC);

ALTER TABLE public.attendance_daily_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own attendance daily facts" ON public.attendance_daily_facts;
CREATE POLICY "Users can view own attendance daily facts"
ON public.attendance_daily_facts
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), department_id)
);

CREATE OR REPLACE FUNCTION public.set_attendance_daily_facts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_daily_facts_set_updated_at ON public.attendance_daily_facts;
CREATE TRIGGER attendance_daily_facts_set_updated_at
BEFORE UPDATE ON public.attendance_daily_facts
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_daily_facts_updated_at();

CREATE OR REPLACE FUNCTION public.refresh_attendance_daily_facts(
  _target_date DATE DEFAULT (CURRENT_DATE - INTERVAL '1 day')::date,
  _user_id UUID DEFAULT NULL,
  _reason TEXT DEFAULT 'scheduled'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule_version_id UUID := public.get_active_attendance_rule_version_id();
  v_rows INTEGER := 0;
BEGIN
  WITH employees AS (
    SELECT
      p.user_id,
      p.department_id,
      d.is_paused AS department_paused,
      ds.checkin_end_time,
      ds.timezone
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.department_schedules ds ON ds.department_id = p.department_id
    WHERE _user_id IS NULL OR p.user_id = _user_id
  ),
  marks AS (
    SELECT
      am.user_id,
      COUNT(*) FILTER (WHERE am.mark_type = 'IN') AS in_marks_count,
      COUNT(*) FILTER (WHERE am.mark_type = 'OUT') AS out_marks_count,
      COUNT(*) FILTER (WHERE am.mark_type = 'IN' AND COALESCE(am.inside_geofence, false) = false) AS outside_geofence_count,
      MIN(am.timestamp) FILTER (WHERE am.mark_type = 'IN') AS in_timestamp,
      MAX(am.timestamp) FILTER (WHERE am.mark_type = 'OUT') AS out_timestamp
    FROM public.attendance_marks am
    WHERE am.timestamp >= _target_date::timestamp
      AND am.timestamp < (_target_date + 1)::timestamp
      AND (_user_id IS NULL OR am.user_id = _user_id)
    GROUP BY am.user_id
  ),
  rows_to_upsert AS (
    SELECT
      e.user_id,
      e.department_id,
      _target_date AS date,
      public.compute_daily_attendance_status(m.in_timestamp, e.checkin_end_time, e.timezone, e.department_paused) AS status,
      m.in_timestamp,
      m.out_timestamp,
      CASE
        WHEN m.in_timestamp IS NULL OR e.checkin_end_time IS NULL THEN 0
        ELSE GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (((m.in_timestamp AT TIME ZONE COALESCE(NULLIF(e.timezone, ''), 'UTC'))::time - e.checkin_end_time)) / 60))
        )::INTEGER
      END AS late_minutes,
      CASE
        WHEN m.in_timestamp IS NULL OR m.out_timestamp IS NULL THEN 0
        ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (m.out_timestamp - m.in_timestamp)) / 60))::INTEGER
      END AS worked_minutes,
      COALESCE(m.in_marks_count, 0) AS in_marks_count,
      COALESCE(m.out_marks_count, 0) AS out_marks_count,
      COALESCE(m.outside_geofence_count, 0) AS outside_geofence_count,
      CASE
        WHEN m.in_timestamp IS NOT NULL OR COALESCE(e.department_paused, FALSE) THEN '-'
        ELSE COALESCE(
          (
            SELECT CASE WHEN aar.is_justified THEN 'JUSTIFICADA' ELSE 'NO_JUSTIFICADA' END
            FROM public.attendance_absence_reviews aar
            WHERE aar.user_id = e.user_id
              AND aar.date = _target_date
            LIMIT 1
          ),
          'PENDIENTE'
        )
      END AS absence_justification,
      _reason AS source_reason,
      now() AS source_updated_at,
      v_rule_version_id AS rule_version_id
    FROM employees e
    LEFT JOIN marks m ON m.user_id = e.user_id
  ),
  upserted AS (
    INSERT INTO public.attendance_daily_facts (
      user_id,
      department_id,
      date,
      status,
      in_timestamp,
      out_timestamp,
      late_minutes,
      worked_minutes,
      in_marks_count,
      out_marks_count,
      outside_geofence_count,
      absence_justification,
      source_reason,
      source_updated_at,
      rule_version_id
    )
    SELECT
      user_id,
      department_id,
      date,
      status,
      in_timestamp,
      out_timestamp,
      late_minutes,
      worked_minutes,
      in_marks_count,
      out_marks_count,
      outside_geofence_count,
      absence_justification,
      source_reason,
      source_updated_at,
      rule_version_id
    FROM rows_to_upsert
    ON CONFLICT (user_id, date)
    DO UPDATE SET
      department_id = EXCLUDED.department_id,
      status = EXCLUDED.status,
      in_timestamp = EXCLUDED.in_timestamp,
      out_timestamp = EXCLUDED.out_timestamp,
      late_minutes = EXCLUDED.late_minutes,
      worked_minutes = EXCLUDED.worked_minutes,
      in_marks_count = EXCLUDED.in_marks_count,
      out_marks_count = EXCLUDED.out_marks_count,
      outside_geofence_count = EXCLUDED.outside_geofence_count,
      absence_justification = EXCLUDED.absence_justification,
      source_reason = EXCLUDED.source_reason,
      source_updated_at = EXCLUDED.source_updated_at,
      rule_version_id = EXCLUDED.rule_version_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_rows FROM upserted;

  RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_attendance_daily_facts_for_range(
  _from DATE,
  _to DATE,
  _user_id UUID DEFAULT NULL,
  _reason TEXT DEFAULT 'manual_recalc'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE;
  v_total INTEGER := 0;
BEGIN
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RAISE EXCEPTION 'Rango inválido';
  END IF;

  v_date := _from;
  WHILE v_date <= _to LOOP
    v_total := v_total + public.refresh_attendance_daily_facts(v_date, _user_id, _reason);
    v_date := v_date + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_attendance_rule_version_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_attendance_daily_facts(DATE, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_attendance_daily_facts_for_range(DATE, DATE, UUID, TEXT) TO authenticated;
