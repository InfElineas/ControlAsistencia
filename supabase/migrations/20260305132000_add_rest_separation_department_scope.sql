INSERT INTO public.app_config (key, value, description)
SELECT 'rest_days_min_separation_departments', '[]'::jsonb, 'Departamentos donde aplica separación mínima de descansos. Vacío = todos.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'rest_days_min_separation_departments'
);
