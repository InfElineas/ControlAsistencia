CREATE TABLE IF NOT EXISTS public.user_department_responsibilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, department_id)
);

ALTER TABLE public.user_department_responsibilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own managed departments" ON public.user_department_responsibilities;
CREATE POLICY "Users can view own managed departments"
ON public.user_department_responsibilities
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'global_manager')
  OR public.has_role(auth.uid(), 'superadmin')
);

DROP POLICY IF EXISTS "Managers can insert managed departments" ON public.user_department_responsibilities;
CREATE POLICY "Managers can insert managed departments"
ON public.user_department_responsibilities
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'global_manager')
  OR public.has_role(auth.uid(), 'superadmin')
);

DROP POLICY IF EXISTS "Managers can delete managed departments" ON public.user_department_responsibilities;
CREATE POLICY "Managers can delete managed departments"
ON public.user_department_responsibilities
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'global_manager')
  OR public.has_role(auth.uid(), 'superadmin')
);
