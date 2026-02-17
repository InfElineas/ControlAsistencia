-- Vacation requests and accrual model
CREATE TABLE public.vacation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  requested_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vacation_requests_date_range CHECK (start_date <= end_date),
  CONSTRAINT vacation_requests_days_positive CHECK (requested_days > 0)
);

CREATE INDEX idx_vacation_requests_user_range
  ON public.vacation_requests(user_id, start_date, end_date);

CREATE INDEX idx_vacation_requests_dept_status
  ON public.vacation_requests(department_id, status, start_date);

CREATE INDEX idx_vacation_requests_pending
  ON public.vacation_requests(start_date)
  WHERE status = 'pending';

ALTER TABLE public.vacation_requests ENABLE ROW LEVEL SECURITY;

-- Configurable accrual rate: vacation days earned per worked day (default: 1/12)
INSERT INTO public.app_config (key, value, description)
VALUES (
  'vacation_days_per_worked_day',
  '0.0833333333',
  'Vacation days accrued per worked day (e.g., 0.0833 = ~1 day per 12 worked days)'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_vacation_accrual_rate()
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT NULLIF(value #>> '{}', '')::numeric
      FROM public.app_config
      WHERE key = 'vacation_days_per_worked_day'
      LIMIT 1
    ),
    0.0833333333
  )
$$;

CREATE OR REPLACE FUNCTION public.get_vacation_balance(_user_id UUID, _year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS TABLE(
  worked_days INTEGER,
  accrual_rate NUMERIC,
  earned_days NUMERIC,
  approved_days INTEGER,
  pending_days INTEGER,
  available_days NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worked_days INTEGER;
  v_rate NUMERIC;
  v_approved_days INTEGER;
  v_pending_days INTEGER;
  v_earned_days NUMERIC;
  v_available NUMERIC;
BEGIN
  SELECT COUNT(DISTINCT (am.timestamp AT TIME ZONE 'UTC')::date)
    INTO v_worked_days
  FROM public.attendance_marks am
  WHERE am.user_id = _user_id
    AND am.blocked = false
    AND am.mark_type = 'IN'
    AND EXTRACT(YEAR FROM (am.timestamp AT TIME ZONE 'UTC')::date)::INTEGER = _year;

  SELECT public.get_vacation_accrual_rate() INTO v_rate;

  SELECT COALESCE(SUM(vr.requested_days), 0)
    INTO v_approved_days
  FROM public.vacation_requests vr
  WHERE vr.user_id = _user_id
    AND vr.status = 'approved'
    AND EXTRACT(YEAR FROM vr.start_date)::INTEGER = _year;

  SELECT COALESCE(SUM(vr.requested_days), 0)
    INTO v_pending_days
  FROM public.vacation_requests vr
  WHERE vr.user_id = _user_id
    AND vr.status = 'pending'
    AND EXTRACT(YEAR FROM vr.start_date)::INTEGER = _year;

  v_earned_days := COALESCE(v_worked_days, 0) * COALESCE(v_rate, 0);
  v_available := v_earned_days - COALESCE(v_approved_days, 0) - COALESCE(v_pending_days, 0);

  RETURN QUERY
  SELECT
    COALESCE(v_worked_days, 0),
    COALESCE(v_rate, 0),
    ROUND(v_earned_days, 2),
    COALESCE(v_approved_days, 0),
    COALESCE(v_pending_days, 0),
    ROUND(v_available, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_vacation(_start_date DATE, _end_date DATE, _reason TEXT DEFAULT NULL)
RETURNS public.vacation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_department_id UUID;
  v_requested_days INTEGER;
  v_balance RECORD;
  v_new_request public.vacation_requests;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF _start_date IS NULL OR _end_date IS NULL THEN
    RAISE EXCEPTION 'Debes indicar una fecha de inicio y fin';
  END IF;

  IF _start_date > _end_date THEN
    RAISE EXCEPTION 'El rango de fechas es inválido';
  END IF;

  v_requested_days := (_end_date - _start_date) + 1;

  IF EXISTS (
    SELECT 1
    FROM public.vacation_requests vr
    WHERE vr.user_id = v_user_id
      AND vr.status IN ('pending', 'approved')
      AND daterange(vr.start_date, vr.end_date, '[]') && daterange(_start_date, _end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'Ya existe una solicitud de vacaciones pendiente o aprobada en ese rango';
  END IF;

  SELECT p.department_id INTO v_department_id
  FROM public.profiles p
  WHERE p.user_id = v_user_id;

  IF v_department_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró el departamento del usuario';
  END IF;

  SELECT * INTO v_balance
  FROM public.get_vacation_balance(v_user_id, EXTRACT(YEAR FROM _start_date)::INTEGER);

  IF COALESCE(v_balance.available_days, 0) < v_requested_days THEN
    RAISE EXCEPTION 'Saldo insuficiente de vacaciones para este período';
  END IF;

  INSERT INTO public.vacation_requests (
    user_id,
    department_id,
    start_date,
    end_date,
    requested_days,
    status,
    reason
  )
  VALUES (
    v_user_id,
    v_department_id,
    _start_date,
    _end_date,
    v_requested_days,
    'pending',
    _reason
  )
  RETURNING * INTO v_new_request;

  RETURN v_new_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_vacation_request(_request_id UUID)
RETURNS public.vacation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.vacation_requests;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_request
  FROM public.vacation_requests
  WHERE id = _request_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo puedes cancelar solicitudes pendientes';
  END IF;

  UPDATE public.vacation_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = _request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_vacation_request(_request_id UUID, _decision TEXT, _review_comment TEXT DEFAULT NULL)
RETURNS public.vacation_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.vacation_requests;
  v_is_global BOOLEAN;
  v_is_head BOOLEAN;
  v_user_department UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF _decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisión inválida';
  END IF;

  SELECT * INTO v_request
  FROM public.vacation_requests
  WHERE id = _request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden revisar solicitudes pendientes';
  END IF;

  SELECT public.has_role(v_user_id, 'global_manager') INTO v_is_global;
  SELECT public.has_role(v_user_id, 'department_head') INTO v_is_head;
  SELECT public.get_user_department(v_user_id) INTO v_user_department;

  IF NOT v_is_global AND NOT (v_is_head AND v_user_department = v_request.department_id) THEN
    RAISE EXCEPTION 'No tienes permisos para revisar esta solicitud';
  END IF;

  UPDATE public.vacation_requests
  SET
    status = _decision,
    reviewed_by = v_user_id,
    reviewed_at = now(),
    review_comment = _review_comment,
    updated_at = now()
  WHERE id = _request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

CREATE TRIGGER update_vacation_requests_updated_at
  BEFORE UPDATE ON public.vacation_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE POLICY "Users can view own vacation requests" ON public.vacation_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own pending vacation requests" ON public.vacation_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Users can cancel own pending vacations" ON public.vacation_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Heads and managers can view vacation requests" ON public.vacation_requests
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'global_manager') OR
    (
      public.has_role(auth.uid(), 'department_head')
      AND department_id = public.get_user_department(auth.uid())
    )
  );

CREATE POLICY "Heads and managers can review vacation requests" ON public.vacation_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'global_manager') OR
    (
      public.has_role(auth.uid(), 'department_head')
      AND department_id = public.get_user_department(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'global_manager') OR
    (
      public.has_role(auth.uid(), 'department_head')
      AND department_id = public.get_user_department(auth.uid())
    )
  );
