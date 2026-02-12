
-- Step 1a: Clear any null user_id rows so we can add NOT NULL
DELETE FROM public.platform_outputs WHERE user_id IS NULL;
DELETE FROM public.content_jobs WHERE user_id IS NULL;

-- Step 1b: Make user_id NOT NULL
ALTER TABLE public.content_jobs ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.platform_outputs ALTER COLUMN user_id SET NOT NULL;

-- Step 1c: Create app_role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read their own roles
CREATE POLICY "Users can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Step 1d: Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Step 1e: Security definer to check job ownership (for storage RLS)
CREATE OR REPLACE FUNCTION public.owns_job(_user_id uuid, _job_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.content_jobs
    WHERE id = _job_id AND user_id = _user_id
  )
$$;

-- Step 1f: Enable RLS on content_jobs
ALTER TABLE public.content_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select" ON public.content_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner insert" ON public.content_jobs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update" ON public.content_jobs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner delete" ON public.content_jobs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Step 1g: Enable RLS on platform_outputs
ALTER TABLE public.platform_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select" ON public.platform_outputs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner insert" ON public.platform_outputs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner update" ON public.platform_outputs
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner delete" ON public.platform_outputs
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Step 1h: Enable RLS on platform_instructions
ALTER TABLE public.platform_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select" ON public.platform_instructions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert" ON public.platform_instructions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update" ON public.platform_instructions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete" ON public.platform_instructions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Step 1i: Enable RLS on image_instructions
ALTER TABLE public.image_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated select" ON public.image_instructions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin insert" ON public.image_instructions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin update" ON public.image_instructions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin delete" ON public.image_instructions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Step 1j: Validation trigger - reject status beyond 'new' if no video
CREATE OR REPLACE FUNCTION public.validate_content_job_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status <> 'new' AND NEW.video_storage_path IS NULL THEN
    RAISE EXCEPTION 'Cannot set status beyond "new" without a video_storage_path';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_content_job_status
  BEFORE UPDATE ON public.content_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_content_job_status();

-- Step 1k: Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('content-media', 'content-media', false);

-- Storage RLS: users can upload to jobs they own
CREATE POLICY "Owner upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-media'
    AND public.owns_job(auth.uid(), (string_to_array(name, '/'))[2]::uuid)
  );

CREATE POLICY "Owner read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-media'
    AND public.owns_job(auth.uid(), (string_to_array(name, '/'))[2]::uuid)
  );

CREATE POLICY "Owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-media'
    AND public.owns_job(auth.uid(), (string_to_array(name, '/'))[2]::uuid)
  );

CREATE POLICY "Owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-media'
    AND public.owns_job(auth.uid(), (string_to_array(name, '/'))[2]::uuid)
  );
