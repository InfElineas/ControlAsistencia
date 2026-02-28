-- Add superadmin role and make user deletions resilient to FK references
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
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
      AND (
        ur.role = _role
        OR (_role = 'global_manager' AND ur.role = 'superadmin')
        OR (_role = 'department_head' AND ur.role = 'superadmin')
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'superadmin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_global_manager(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'global_manager');
$$;

ALTER TABLE public.geofence_config DROP CONSTRAINT IF EXISTS geofence_config_updated_by_fkey;
ALTER TABLE public.geofence_config
  ADD CONSTRAINT geofence_config_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.vacation_requests DROP CONSTRAINT IF EXISTS vacation_requests_reviewed_by_fkey;
ALTER TABLE public.vacation_requests
  ADD CONSTRAINT vacation_requests_reviewed_by_fkey
  FOREIGN KEY (reviewed_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

ALTER TABLE public.attendance_absence_reviews ALTER COLUMN reviewed_by DROP NOT NULL;
ALTER TABLE public.attendance_absence_reviews DROP CONSTRAINT IF EXISTS attendance_absence_reviews_reviewed_by_fkey;
ALTER TABLE public.attendance_absence_reviews
  ADD CONSTRAINT attendance_absence_reviews_reviewed_by_fkey
  FOREIGN KEY (reviewed_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'superadmin') THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT user_id, 'superadmin'
    FROM public.user_roles
    WHERE role = 'global_manager'
    ORDER BY user_id
    LIMIT 1
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
