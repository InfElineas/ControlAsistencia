-- Generalize departments management and add rest groups support
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS rest_groups_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.rest_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  days_of_week INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

CREATE TABLE IF NOT EXISTS public.rest_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.rest_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_rest_groups_department ON public.rest_groups(department_id);
CREATE INDEX IF NOT EXISTS idx_rest_group_members_user_effective ON public.rest_group_members(user_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_rest_group_members_group ON public.rest_group_members(group_id);

ALTER TABLE public.rest_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rest_group_members ENABLE ROW LEVEL SECURITY;

-- Department CRUD for global managers (read policy already exists)
CREATE POLICY "Global managers can manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'global_manager'))
  WITH CHECK (public.has_role(auth.uid(), 'global_manager'));

-- Rest groups policies
CREATE POLICY "Authenticated users can view rest groups" ON public.rest_groups
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Managers can manage rest groups" ON public.rest_groups
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'global_manager')
    OR (
      public.has_role(auth.uid(), 'department_head')
      AND department_id = public.get_user_department(auth.uid())
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'global_manager')
    OR (
      public.has_role(auth.uid(), 'department_head')
      AND department_id = public.get_user_department(auth.uid())
    )
  );

-- Rest group members policies
CREATE POLICY "Users can view group membership relevant to them" ON public.rest_group_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'global_manager')
    OR (
      public.has_role(auth.uid(), 'department_head')
      AND user_id IN (
        SELECT p.user_id
        FROM public.profiles p
        WHERE p.department_id = public.get_user_department(auth.uid())
      )
    )
  );

CREATE POLICY "Managers can manage rest group memberships" ON public.rest_group_members
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'global_manager')
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
    public.has_role(auth.uid(), 'global_manager')
    OR (
      public.has_role(auth.uid(), 'department_head')
      AND user_id IN (
        SELECT p.user_id
        FROM public.profiles p
        WHERE p.department_id = public.get_user_department(auth.uid())
      )
    )
  );

-- Seed: enable rest groups for Picker and Packer + Expedición
UPDATE public.departments
SET rest_groups_enabled = true
WHERE lower(name) IN ('picker and packer', 'expedición', 'expedicion');

INSERT INTO public.rest_groups (department_id, name, days_of_week)
SELECT d.id, g.name, g.days_of_week
FROM public.departments d
CROSS JOIN (
  VALUES
    ('Grupo A', ARRAY[0]::INTEGER[]),
    ('Grupo B', ARRAY[6]::INTEGER[])
) AS g(name, days_of_week)
WHERE lower(d.name) IN ('picker and packer', 'expedición', 'expedicion')
  AND NOT EXISTS (
    SELECT 1
    FROM public.rest_groups rg
    WHERE rg.department_id = d.id
      AND rg.name = g.name
  );
