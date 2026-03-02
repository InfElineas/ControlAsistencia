CREATE TABLE public.attendance_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  incident_type TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  manager_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.attendance_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own incidents"
ON public.attendance_incidents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own incidents"
ON public.attendance_incidents
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(get_user_department(attendance_incidents.user_id), auth.uid())
);

CREATE POLICY "Managers can update incidents"
ON public.attendance_incidents
FOR UPDATE
USING (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(get_user_department(attendance_incidents.user_id), auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(get_user_department(attendance_incidents.user_id), auth.uid())
);

CREATE TRIGGER attendance_incidents_set_updated_at
BEFORE UPDATE ON public.attendance_incidents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
