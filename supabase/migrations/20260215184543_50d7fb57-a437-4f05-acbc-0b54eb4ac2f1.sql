-- Enable RLS on posted_content (may already be enabled, safe to re-run)
ALTER TABLE public.posted_content ENABLE ROW LEVEL SECURITY;

-- Owner-based SELECT
CREATE POLICY "Users can select own posted content"
  ON public.posted_content
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admin SELECT
CREATE POLICY "Admins can select all posted content"
  ON public.posted_content
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));