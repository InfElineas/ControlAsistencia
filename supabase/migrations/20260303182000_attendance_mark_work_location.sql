ALTER TABLE public.attendance_marks
ADD COLUMN IF NOT EXISTS work_location_id UUID REFERENCES public.work_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_marks_work_location_id
  ON public.attendance_marks(work_location_id);
