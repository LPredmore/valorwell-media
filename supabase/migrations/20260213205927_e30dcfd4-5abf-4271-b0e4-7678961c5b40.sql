
-- Add scheduling columns to social_content
ALTER TABLE public.social_content
  ADD COLUMN scheduled_at timestamptz,
  ADD COLUMN posted_at timestamptz,
  ADD COLUMN scheduled_platforms text[];
