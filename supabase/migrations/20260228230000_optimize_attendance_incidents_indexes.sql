CREATE INDEX IF NOT EXISTS idx_attendance_incidents_user_created_at
  ON public.attendance_incidents(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_incidents_status_created_at
  ON public.attendance_incidents(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_attendance_incidents_requested_at
  ON public.attendance_incidents(requested_at DESC);
