-- Permitir que gestores globales y superadmin inserten claves de configuración
DROP POLICY IF EXISTS "Managers can update app config" ON public.app_config;

CREATE POLICY "Managers can update app config"
ON public.app_config
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'global_manager')
  OR public.has_role(auth.uid(), 'superadmin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'global_manager')
  OR public.has_role(auth.uid(), 'superadmin')
);

CREATE POLICY "Managers can insert app config"
ON public.app_config
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'global_manager')
  OR public.has_role(auth.uid(), 'superadmin')
);

INSERT INTO public.app_config (key, value, description)
SELECT 'rest_days_min_separation', '4'::jsonb, 'Separación mínima configurable entre días de descanso semanales'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'rest_days_min_separation'
);
