CREATE TABLE IF NOT EXISTS public.work_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  accuracy_threshold INTEGER NOT NULL DEFAULT 50,
  block_on_poor_accuracy BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.work_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view work locations"
ON public.work_locations
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Managers can manage work locations"
ON public.work_locations
FOR ALL
USING (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
)
WITH CHECK (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
);

CREATE TRIGGER work_locations_set_updated_at
BEFORE UPDATE ON public.work_locations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
