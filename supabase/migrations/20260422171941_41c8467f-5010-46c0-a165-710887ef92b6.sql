-- Subscribers table
CREATE TABLE public.subscribers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  stripe_customer_id text,
  subscribed boolean NOT NULL DEFAULT false,
  subscription_tier text,
  subscription_end timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscribers FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
  ON public.subscribers FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Edge functions use service role and bypass RLS, so no INSERT/UPDATE policies needed for users.

CREATE TRIGGER subscribers_set_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed a default channel_brief instruction so new users have a placeholder
INSERT INTO public.content_instruction_defaults (scope, instruction)
VALUES (
  'channel_brief',
  'Describe your channel here: what it''s about, who it''s for, your tone and style, topics you cover, and anything you want me to keep in mind when writing scripts and ideas.'
)
ON CONFLICT (scope) DO NOTHING;