-- Add phone number support to user profiles and signup trigger
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_dept_id UUID;
BEGIN
  -- Get first department as default
  SELECT id INTO default_dept_id FROM public.departments LIMIT 1;

  -- Create profile
  INSERT INTO public.profiles (user_id, email, full_name, department_id, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(
      (NEW.raw_user_meta_data->>'department_id')::UUID,
      default_dept_id
    ),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  );

  -- Create default role as employee
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');

  RETURN NEW;
END;
$$;
