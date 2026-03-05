CREATE OR REPLACE FUNCTION public.validate_attendance_mark(_user_id UUID, _mark_type TEXT)
RETURNS TABLE (
  allowed BOOLEAN,
  reason TEXT,
  department_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_department_id UUID;
  v_is_gm BOOLEAN;
  v_schedule RECORD;
  v_department_paused BOOLEAN;
BEGIN
  v_is_gm := is_global_manager(_user_id);

  IF v_is_gm THEN
    RETURN QUERY SELECT false, 'No autorizado para registrar asistencia o descansos.'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT p.department_id INTO v_department_id
  FROM public.profiles p
  WHERE p.user_id = _user_id;

  IF v_department_id IS NULL THEN
    RETURN QUERY SELECT false, 'Usuario sin departamento asignado.'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT d.is_paused INTO v_department_paused
  FROM public.departments d
  WHERE d.id = v_department_id;

  IF COALESCE(v_department_paused, false) THEN
    RETURN QUERY SELECT false, 'Tu departamento está en descanso. No puedes marcar asistencia en este momento.'::TEXT, v_department_id;
    RETURN;
  END IF;

  SELECT * INTO v_schedule
  FROM public.department_schedules ds
  WHERE ds.department_id = v_department_id;

  IF v_schedule IS NULL THEN
    RETURN QUERY SELECT false, 'Departamento sin horario configurado. Contacte al administrador.'::TEXT, v_department_id;
    RETURN;
  END IF;

  IF _mark_type NOT IN ('IN', 'OUT') THEN
    RETURN QUERY SELECT false, 'Tipo de marcaje inválido.'::TEXT, v_department_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::TEXT, v_department_id;
END;
$$;
