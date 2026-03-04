INSERT INTO public.app_config (key, value, description)
SELECT 'global_timezone', '"America/Lima"'::jsonb, 'Zona horaria global para todo el sistema de asistencia'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'global_timezone'
);

UPDATE public.department_schedules
SET timezone = COALESCE(
  (SELECT value #>> '{}' FROM public.app_config WHERE key = 'global_timezone' LIMIT 1),
  timezone
);
