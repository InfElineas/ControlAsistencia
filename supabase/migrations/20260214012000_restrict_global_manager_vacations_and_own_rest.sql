-- Restrict global manager from requesting personal vacations
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

  IF public.has_role(v_user_id, 'global_manager') THEN
    RAISE EXCEPTION 'Los gestores globales no pueden solicitar vacaciones personales';
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

-- Tighten insert policy too
DROP POLICY IF EXISTS "Users can insert own pending vacation requests" ON public.vacation_requests;

CREATE POLICY "Users can insert own pending vacation requests" ON public.vacation_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND NOT public.has_role(auth.uid(), 'global_manager')
  );

-- Global managers can configure rest schedules for others, but not for themselves
DROP POLICY IF EXISTS "Users and managers can manage rest schedule" ON public.user_rest_schedule;

CREATE POLICY "Users and managers can manage rest schedule" ON public.user_rest_schedule
  FOR ALL TO authenticated
  USING (
    (
      user_id = auth.uid()
      AND NOT public.has_role(auth.uid(), 'global_manager')
    )
    OR (
      public.has_role(auth.uid(), 'global_manager')
      AND user_id <> auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'department_head')
      AND user_id IN (
        SELECT p.user_id
        FROM public.profiles p
        WHERE p.department_id = public.get_user_department(auth.uid())
      )
    )
  )
  WITH CHECK (
    (
      user_id = auth.uid()
      AND NOT public.has_role(auth.uid(), 'global_manager')
    )
    OR (
      public.has_role(auth.uid(), 'global_manager')
      AND user_id <> auth.uid()
    )
    OR (
      public.has_role(auth.uid(), 'department_head')
      AND user_id IN (
        SELECT p.user_id
        FROM public.profiles p
        WHERE p.department_id = public.get_user_department(auth.uid())
      )
    )
  );
