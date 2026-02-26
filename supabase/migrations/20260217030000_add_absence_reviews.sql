CREATE TABLE public.attendance_absence_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  is_justified BOOLEAN NOT NULL,
  notes TEXT,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.attendance_absence_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can manage absence reviews"
ON public.attendance_absence_reviews
FOR ALL
USING (
  has_role(auth.uid(), 'global_manager')
  OR is_head_of_department(
    get_user_department(attendance_absence_reviews.user_id),
    auth.uid()
  )
)
WITH CHECK (
  has_role(auth.uid(), 'global_manager')
  OR is_head_of_department(
    get_user_department(attendance_absence_reviews.user_id),
    auth.uid()
  )
);

CREATE POLICY "Users can view own absence reviews"
ON public.attendance_absence_reviews
FOR SELECT
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'global_manager')
  OR is_head_of_department(
    get_user_department(attendance_absence_reviews.user_id),
    auth.uid()
  )
);

CREATE TRIGGER attendance_absence_reviews_set_updated_at
BEFORE UPDATE ON public.attendance_absence_reviews
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
