
-- 1. Add columns to posted_content
ALTER TABLE public.posted_content
  ADD COLUMN youtube_video_id text,
  ADD COLUMN source_content_id uuid;

-- 2. Create trigger function to sync youtube_video_id
CREATE OR REPLACE FUNCTION public.sync_youtube_video_id_to_posted()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.youtube_video_id IS NOT NULL
     AND (OLD.youtube_video_id IS DISTINCT FROM NEW.youtube_video_id)
  THEN
    UPDATE posted_content
       SET youtube_video_id = NEW.youtube_video_id
     WHERE source_content_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Create trigger on social_content
CREATE TRIGGER trg_sync_youtube_video_id
  AFTER UPDATE ON public.social_content
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_youtube_video_id_to_posted();
