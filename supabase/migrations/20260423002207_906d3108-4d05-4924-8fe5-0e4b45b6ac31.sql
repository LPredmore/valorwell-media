-- Native YouTube connections table
CREATE TABLE public.youtube_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  google_account_email text,
  channel_id text,
  channel_title text,
  channel_handle text,
  refresh_token_encrypted text NOT NULL,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;

-- Users can read their own row (but the safe view is what the UI uses)
CREATE POLICY "Users select own youtube connection"
ON public.youtube_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins full access
CREATE POLICY "Admins full access youtube connections"
ON public.youtube_connections
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER set_updated_at_youtube_connections
BEFORE UPDATE ON public.youtube_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Safe view exposing non-sensitive columns only
CREATE VIEW public.youtube_connections_public
WITH (security_invoker = true)
AS
SELECT
  user_id,
  google_account_email,
  channel_id,
  channel_title,
  channel_handle,
  scopes,
  connected_at,
  updated_at
FROM public.youtube_connections;

GRANT SELECT ON public.youtube_connections_public TO authenticated;

-- New columns on social_content
ALTER TABLE public.social_content
  ADD COLUMN youtube_native_status text,
  ADD COLUMN youtube_native_video_id text,
  ADD COLUMN youtube_native_uploaded_at timestamptz,
  ADD COLUMN youtube_native_error_detail text,
  ADD COLUMN youtube_via text;

-- New columns on posted_content
ALTER TABLE public.posted_content
  ADD COLUMN youtube_native_status text,
  ADD COLUMN youtube_native_video_id text,
  ADD COLUMN youtube_native_uploaded_at timestamptz,
  ADD COLUMN youtube_native_error_detail text,
  ADD COLUMN youtube_via text;