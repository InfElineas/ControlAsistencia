-- Step 1: Add enum value in its own migration transaction scope
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'superadmin';
