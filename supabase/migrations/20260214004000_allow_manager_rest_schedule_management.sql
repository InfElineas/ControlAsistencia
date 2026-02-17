-- Allow global managers (and department heads for their department) to manage rest schedules
DROP POLICY IF EXISTS "Users can manage own rest schedule" ON public.user_rest_schedule;

CREATE POLICY "Users and managers can manage rest schedule" ON public.user_rest_schedule
  FOR ALL TO authenticated
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
  )
  WITH CHECK (
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
