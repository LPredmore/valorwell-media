
-- 1. Add user_id to content_ideas, backfill to admin, set NOT NULL
ALTER TABLE public.content_ideas ADD COLUMN user_id uuid;

UPDATE public.content_ideas
SET user_id = (
  SELECT id FROM auth.users WHERE email = 'info@valorwell.org' LIMIT 1
)
WHERE user_id IS NULL;

-- Fallback: if no admin user found, assign to first user
UPDATE public.content_ideas
SET user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL;

ALTER TABLE public.content_ideas ALTER COLUMN user_id SET NOT NULL;
CREATE INDEX idx_content_ideas_user_id ON public.content_ideas(user_id);

-- 2. Replace RLS policies on content_ideas
DROP POLICY IF EXISTS "Authenticated select" ON public.content_ideas;
DROP POLICY IF EXISTS "Admin insert" ON public.content_ideas;
DROP POLICY IF EXISTS "Admin update" ON public.content_ideas;
DROP POLICY IF EXISTS "Admin delete" ON public.content_ideas;

CREATE POLICY "Users select own ideas"
  ON public.content_ideas FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ideas"
  ON public.content_ideas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ideas"
  ON public.content_ideas FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ideas"
  ON public.content_ideas FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins full access ideas"
  ON public.content_ideas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Add onboarding_completed to profiles
ALTER TABLE public.profiles ADD COLUMN onboarding_completed boolean NOT NULL DEFAULT false;

-- Existing users have already onboarded (they're using the app)
UPDATE public.profiles SET onboarding_completed = true;

-- Add RLS so users can read/update their own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins read all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. handle_new_user trigger: profile + role + (instructions trigger already exists)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, onboarding_completed)
  VALUES (NEW.id, NEW.email, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
