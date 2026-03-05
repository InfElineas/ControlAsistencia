CREATE OR REPLACE FUNCTION public.is_head_of_department(_user_id UUID, _dept_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = 'department_head'
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = _user_id
            AND p.department_id = _dept_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_department_responsibilities r
          WHERE r.user_id = _user_id
            AND r.department_id = _dept_id
        )
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _dept_id
      AND ur.role = 'department_head'
      AND (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.user_id = _dept_id
            AND p.department_id = _user_id
        )
        OR EXISTS (
          SELECT 1 FROM public.user_department_responsibilities r
          WHERE r.user_id = _dept_id
            AND r.department_id = _user_id
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Users can create own incidents" ON public.attendance_incidents;
CREATE POLICY "Users and managers can create incidents"
ON public.attendance_incidents
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_incidents.user_id))
);

DROP POLICY IF EXISTS "Users can view own incidents" ON public.attendance_incidents;
CREATE POLICY "Users and managers can view incidents"
ON public.attendance_incidents
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_incidents.user_id))
);

DROP POLICY IF EXISTS "Managers can update incidents" ON public.attendance_incidents;
CREATE POLICY "Managers can update incidents"
ON public.attendance_incidents
FOR UPDATE
USING (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_incidents.user_id))
)
WITH CHECK (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_incidents.user_id))
);

DROP POLICY IF EXISTS "Managers can manage absence reviews" ON public.attendance_absence_reviews;
CREATE POLICY "Managers can manage absence reviews"
ON public.attendance_absence_reviews
FOR ALL
USING (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_absence_reviews.user_id))
)
WITH CHECK (
  has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_absence_reviews.user_id))
);

DROP POLICY IF EXISTS "Users can view own absence reviews" ON public.attendance_absence_reviews;
CREATE POLICY "Users can view own absence reviews"
ON public.attendance_absence_reviews
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'global_manager')
  OR has_role(auth.uid(), 'superadmin')
  OR is_head_of_department(auth.uid(), get_user_department(attendance_absence_reviews.user_id))
);
