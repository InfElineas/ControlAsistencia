CREATE INDEX IF NOT EXISTS idx_attendance_marks_timestamp_user
  ON public.attendance_marks(timestamp, user_id);

CREATE INDEX IF NOT EXISTS idx_attendance_marks_user_timestamp_mark_type
  ON public.attendance_marks(user_id, timestamp, mark_type);

CREATE INDEX IF NOT EXISTS idx_attendance_marks_in_partial
  ON public.attendance_marks(user_id, timestamp)
  WHERE mark_type = 'IN';

CREATE OR REPLACE FUNCTION public.compute_daily_attendance_status(
  _in_timestamp TIMESTAMPTZ,
  _checkin_end_time TIME,
  _timezone TEXT,
  _department_paused BOOLEAN
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_timezone TEXT := COALESCE(NULLIF(_timezone, ''), 'UTC');
BEGIN
  IF COALESCE(_department_paused, FALSE) THEN
    RETURN 'NO_LABORABLE';
  END IF;

  IF _in_timestamp IS NULL THEN
    RETURN 'AUSENTE';
  END IF;

  IF _checkin_end_time IS NULL THEN
    RETURN 'PRESENTE';
  END IF;

  IF ((_in_timestamp AT TIME ZONE v_timezone)::time > _checkin_end_time) THEN
    RETURN 'TARDE';
  END IF;

  RETURN 'PRESENTE';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_attendance_report_monthly(
  _from DATE,
  _to DATE,
  _department_id UUID DEFAULT NULL,
  _scope TEXT DEFAULT 'global',
  _include_heads BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  date DATE,
  user_id UUID,
  employee_name TEXT,
  employee_email TEXT,
  department TEXT,
  status TEXT,
  in_timestamp TIMESTAMPTZ,
  out_timestamp TIMESTAMPTZ,
  lateness_minutes INTEGER,
  absence_justification TEXT,
  inside_geofence BOOLEAN,
  distance_m DOUBLE PRECISION
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope TEXT := LOWER(COALESCE(_scope, 'global'));
  v_requester UUID := auth.uid();
BEGIN
  IF _from IS NULL OR _to IS NULL OR _from > _to THEN
    RAISE EXCEPTION 'Rango de fechas inválido';
  END IF;

  IF v_requester IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF v_scope = 'global' THEN
    IF NOT (has_role(v_requester, 'global_manager') OR has_role(v_requester, 'superadmin')) THEN
      RAISE EXCEPTION 'No autorizado para reportes globales';
    END IF;
  ELSIF v_scope = 'department' THEN
    IF _department_id IS NULL THEN
      RAISE EXCEPTION 'department_id es obligatorio para scope department';
    END IF;

    IF NOT (
      has_role(v_requester, 'global_manager')
      OR has_role(v_requester, 'superadmin')
      OR is_head_of_department(v_requester, _department_id)
    ) THEN
      RAISE EXCEPTION 'No autorizado para este departamento';
    END IF;
  ELSE
    RAISE EXCEPTION 'scope inválido: %', v_scope;
  END IF;

  RETURN QUERY
  WITH date_range AS (
    SELECT generate_series(_from, _to, interval '1 day')::date AS d
  ),
  employees AS (
    SELECT
      p.user_id,
      p.full_name,
      p.email,
      p.department_id,
      d.name AS department_name,
      d.is_paused AS department_paused,
      ds.checkin_end_time,
      ds.timezone,
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id AND ur.role = 'department_head'
      ) AS is_department_head,
      EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.user_id AND ur.role IN ('global_manager', 'superadmin')
      ) AS is_admin_role
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.department_schedules ds ON ds.department_id = p.department_id
    WHERE
      (v_scope = 'global' OR p.department_id = _department_id)
  ),
  scoped_employees AS (
    SELECT *
    FROM employees e
    WHERE
      NOT e.is_admin_role
      AND (_include_heads OR NOT e.is_department_head)
  ),
  daily_marks AS (
    SELECT
      am.user_id,
      (am.timestamp::date) AS mark_date,
      MIN(am.timestamp) FILTER (WHERE am.mark_type = 'IN') AS in_timestamp,
      MAX(am.timestamp) FILTER (WHERE am.mark_type = 'OUT') AS out_timestamp
    FROM public.attendance_marks am
    JOIN scoped_employees se ON se.user_id = am.user_id
    WHERE am.timestamp >= _from::timestamp
      AND am.timestamp < (_to + 1)::timestamp
    GROUP BY am.user_id, (am.timestamp::date)
  ),
  first_in_mark AS (
    SELECT DISTINCT ON (am.user_id, am.timestamp::date)
      am.user_id,
      (am.timestamp::date) AS mark_date,
      am.inside_geofence,
      am.distance_to_center
    FROM public.attendance_marks am
    JOIN scoped_employees se ON se.user_id = am.user_id
    WHERE am.mark_type = 'IN'
      AND am.timestamp >= _from::timestamp
      AND am.timestamp < (_to + 1)::timestamp
    ORDER BY am.user_id, (am.timestamp::date), am.timestamp ASC
  )
  SELECT
    dr.d AS date,
    se.user_id,
    se.full_name AS employee_name,
    se.email AS employee_email,
    COALESCE(se.department_name, 'Sin departamento') AS department,
    public.compute_daily_attendance_status(dm.in_timestamp, se.checkin_end_time, se.timezone, se.department_paused) AS status,
    dm.in_timestamp,
    dm.out_timestamp,
    CASE
      WHEN dm.in_timestamp IS NULL OR se.checkin_end_time IS NULL THEN NULL
      ELSE GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (((dm.in_timestamp AT TIME ZONE COALESCE(NULLIF(se.timezone, ''), 'UTC'))::time - se.checkin_end_time)) / 60)
      )::INTEGER
    END AS lateness_minutes,
    CASE
      WHEN dm.in_timestamp IS NOT NULL OR COALESCE(se.department_paused, FALSE) THEN '-'
      ELSE COALESCE(
        (
          SELECT CASE WHEN aar.is_justified THEN 'JUSTIFICADA' ELSE 'NO_JUSTIFICADA' END
          FROM public.attendance_absence_reviews aar
          WHERE aar.user_id = se.user_id
            AND aar.date = dr.d
          LIMIT 1
        ),
        'PENDIENTE'
      )
    END AS absence_justification,
    fim.inside_geofence,
    fim.distance_to_center AS distance_m
  FROM date_range dr
  CROSS JOIN scoped_employees se
  LEFT JOIN daily_marks dm ON dm.user_id = se.user_id AND dm.mark_date = dr.d
  LEFT JOIN first_in_mark fim ON fim.user_id = se.user_id AND fim.mark_date = dr.d
  ORDER BY dr.d, department, employee_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_attendance_report_monthly(DATE, DATE, UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_daily_attendance_status(TIMESTAMPTZ, TIME, TEXT, BOOLEAN) TO authenticated;
