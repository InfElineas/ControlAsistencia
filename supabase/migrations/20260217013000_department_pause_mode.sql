-- Allow global managers to pause specific departments (temporary sales/operations interruption)
ALTER TABLE public.departments
ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Seed metadata for currently paused departments can be managed via UI later.
