
-- 1. Defaults table
CREATE TABLE public.content_instruction_defaults (
  scope text PRIMARY KEY,
  instruction text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_instruction_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated can read defaults"
  ON public.content_instruction_defaults
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert defaults"
  ON public.content_instruction_defaults
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update defaults"
  ON public.content_instruction_defaults
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete defaults"
  ON public.content_instruction_defaults
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER content_instruction_defaults_set_updated_at
  BEFORE UPDATE ON public.content_instruction_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults from current global instructions
INSERT INTO public.content_instruction_defaults (scope, instruction)
SELECT scope, instruction
FROM public.content_instructions
ON CONFLICT (scope) DO NOTHING;

-- 2. Per-user table
CREATE TABLE public.user_content_instructions (
  user_id uuid NOT NULL,
  scope text NOT NULL,
  instruction text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, scope)
);

CREATE INDEX idx_user_content_instructions_user ON public.user_content_instructions(user_id);

ALTER TABLE public.user_content_instructions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own instructions"
  ON public.user_content_instructions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own instructions"
  ON public.user_content_instructions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own instructions"
  ON public.user_content_instructions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own instructions"
  ON public.user_content_instructions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all user instructions"
  ON public.user_content_instructions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER user_content_instructions_set_updated_at
  BEFORE UPDATE ON public.user_content_instructions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Backfill existing users
INSERT INTO public.user_content_instructions (user_id, scope, instruction)
SELECT u.id, d.scope, d.instruction
FROM auth.users u
CROSS JOIN public.content_instruction_defaults d
ON CONFLICT (user_id, scope) DO NOTHING;

-- 4. Signup trigger to seed new users
CREATE OR REPLACE FUNCTION public.seed_user_instructions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_content_instructions (user_id, scope, instruction)
  SELECT NEW.id, d.scope, d.instruction
  FROM public.content_instruction_defaults d
  ON CONFLICT (user_id, scope) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_seed_instructions
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.seed_user_instructions();
