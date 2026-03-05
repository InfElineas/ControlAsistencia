INSERT INTO public.app_config (key, value, description)
SELECT 'attendance_checkout_mode', '"schedule"'::jsonb, 'Modo de salida de asistencia: manual, schedule o geofence_exit'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'attendance_checkout_mode'
);

INSERT INTO public.app_config (key, value, description)
SELECT 'attendance_auto_checkout_time', '"18:30"'::jsonb, 'Hora de salida automática cuando el modo es schedule (HH:mm)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'attendance_auto_checkout_time'
);

INSERT INTO public.app_config (key, value, description)
SELECT 'attendance_geofence_exit_minutes', '3'::jsonb, 'Minutos continuos fuera de geofence para salida automática'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'attendance_geofence_exit_minutes'
);
