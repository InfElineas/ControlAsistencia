-- Allow department heads to read data across all departments they manage
-- (primary department + user_department_responsibilities).

-- Profiles visibility
DROP POLICY IF EXISTS "Users can view profiles" ON public.profiles;
CREATE POLICY "Users can view profiles"
ON public.profiles
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'global_manager'::app_role)
  OR has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    has_role(auth.uid(), 'department_head'::app_role)
    AND is_head_of_department(auth.uid(), department_id)
  )
);

-- Attendance marks visibility
DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance_marks;
CREATE POLICY "Users can view own attendance"
ON public.attendance_marks
FOR SELECT
USING (
  user_id = auth.uid()
  OR has_role(auth.uid(), 'global_manager'::app_role)
  OR has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    has_role(auth.uid(), 'department_head'::app_role)
    AND is_head_of_department(auth.uid(), get_user_department(attendance_marks.user_id))
  )
);
