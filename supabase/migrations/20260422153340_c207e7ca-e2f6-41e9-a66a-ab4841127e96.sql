
-- ============================================================
-- PHASE 1a: WIPE EXISTING DATA
-- ============================================================
DELETE FROM public.posted_content;
DELETE FROM public.social_content;
DELETE FROM public.content_ideas;
DELETE FROM public.user_content_instructions;
DELETE FROM public.youtube_connections;
DELETE FROM public.user_roles;
DELETE FROM public.profiles;
DELETE FROM auth.users;

-- ============================================================
-- PHASE 1b: DROP DEPENDENT POLICIES
-- ============================================================
DROP POLICY IF EXISTS "Public can view published long content" ON public.posted_content;

-- ============================================================
-- PHASE 1c: DROP LEGACY TRIGGERS, FUNCTIONS, TABLE
-- ============================================================
DROP TRIGGER IF EXISTS set_youtube_upload_at_and_queue ON public.social_content;
DROP TRIGGER IF EXISTS trg_set_youtube_upload_at_and_queue ON public.social_content;
DROP TRIGGER IF EXISTS sync_youtube_video_id_to_posted ON public.social_content;
DROP TRIGGER IF EXISTS trg_sync_youtube_video_id_to_posted ON public.social_content;
DROP TRIGGER IF EXISTS enforce_youtube_schedule_requirements ON public.social_content;
DROP TRIGGER IF EXISTS trg_enforce_youtube_schedule_requirements ON public.social_content;

DROP FUNCTION IF EXISTS public.set_youtube_upload_at_and_queue() CASCADE;
DROP FUNCTION IF EXISTS public.sync_youtube_video_id_to_posted() CASCADE;
DROP FUNCTION IF EXISTS public.reset_stuck_youtube_uploads(integer) CASCADE;
DROP FUNCTION IF EXISTS public.enforce_youtube_schedule_requirements() CASCADE;

DROP TABLE IF EXISTS public.youtube_connections CASCADE;

-- ============================================================
-- PHASE 1d: DROP LEGACY COLUMNS
-- ============================================================
ALTER TABLE public.social_content
  DROP COLUMN IF EXISTS youtube_status,
  DROP COLUMN IF EXISTS youtube_uploaded_at,
  DROP COLUMN IF EXISTS youtube_error_detail,
  DROP COLUMN IF EXISTS youtube_video_id,
  DROP COLUMN IF EXISTS youtube_comment,
  DROP COLUMN IF EXISTS youtube_comment_status,
  DROP COLUMN IF EXISTS youtube_comment_id,
  DROP COLUMN IF EXISTS youtube_comment_posted_at,
  DROP COLUMN IF EXISTS youtube_comment_error_detail,
  DROP COLUMN IF EXISTS upload_at;

ALTER TABLE public.posted_content
  DROP COLUMN IF EXISTS youtube_video_id,
  DROP COLUMN IF EXISTS youtube_comment,
  DROP COLUMN IF EXISTS youtube_comment_status,
  DROP COLUMN IF EXISTS youtube_comment_id,
  DROP COLUMN IF EXISTS youtube_comment_posted_at,
  DROP COLUMN IF EXISTS youtube_comment_error_detail,
  DROP COLUMN IF EXISTS tiktok_status,
  DROP COLUMN IF EXISTS tiktok_error,
  DROP COLUMN IF EXISTS tiktok_job_id;

-- ============================================================
-- PHASE 1e: ADD NEW COLUMNS
-- ============================================================
ALTER TABLE public.social_content
  ADD COLUMN IF NOT EXISTS upload_post_request_id text,
  ADD COLUMN IF NOT EXISTS upload_post_status text,
  ADD COLUMN IF NOT EXISTS upload_post_results jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.posted_content
  ADD COLUMN IF NOT EXISTS upload_post_request_id text,
  ADD COLUMN IF NOT EXISTS upload_post_status text,
  ADD COLUMN IF NOT EXISTS upload_post_results jsonb DEFAULT '{}'::jsonb;

-- ============================================================
-- PHASE 1f: CREATE upload_post_profiles TABLE
-- ============================================================
CREATE TABLE public.upload_post_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  connected_platforms jsonb NOT NULL DEFAULT '{}'::jsonb,
  provisioning_status text NOT NULL DEFAULT 'pending',
  provisioning_error text,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upload_post_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own upload profile"
  ON public.upload_post_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update own upload profile"
  ON public.upload_post_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins full access upload profiles"
  ON public.upload_post_profiles FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER upload_post_profiles_set_updated_at
  BEFORE UPDATE ON public.upload_post_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- PHASE 1g: NEW SIMPLER SCHEDULE-VALIDATION FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_schedule_requirements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.scheduled_at IS NOT NULL THEN
    IF coalesce(NEW.video_storage_path, '') = '' THEN
      RAISE EXCEPTION 'Cannot schedule: video is missing';
    END IF;
    IF coalesce(NEW.post_title, '') = '' THEN
      RAISE EXCEPTION 'Cannot schedule: post_title is missing';
    END IF;
    IF NEW.post_length IS NULL THEN
      RAISE EXCEPTION 'Cannot schedule: post_length is missing';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_schedule_requirements
  BEFORE INSERT OR UPDATE ON public.social_content
  FOR EACH ROW EXECUTE FUNCTION public.enforce_schedule_requirements();

-- ============================================================
-- PHASE 1h: UPDATE handle_new_user
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  generated_username text;
BEGIN
  INSERT INTO public.profiles (id, email, onboarding_completed)
  VALUES (NEW.id, NEW.email, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  generated_username := 'flurra' || replace(NEW.id::text, '-', '');

  INSERT INTO public.upload_post_profiles (user_id, username, provisioning_status)
  VALUES (NEW.id, generated_username, 'pending')
  ON CONFLICT (user_id) DO NOTHING;

  -- Async fire-and-forget call to provisioning edge function
  BEGIN
    PERFORM net.http_post(
      url := 'https://fjyhehtzryybbpuxqqdo.supabase.co/functions/v1/upload-post-create-profile',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('user_id', NEW.id::text, 'username', generated_username)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
