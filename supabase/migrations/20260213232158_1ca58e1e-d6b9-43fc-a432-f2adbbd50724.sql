
-- Create youtube_connections table
CREATE TABLE public.youtube_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  google_email TEXT,
  channel_id TEXT,
  channel_title TEXT,
  refresh_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.youtube_connections ENABLE ROW LEVEL SECURITY;

-- Users can read their own connection
CREATE POLICY "Users can select own connection"
ON public.youtube_connections
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own connection
CREATE POLICY "Users can insert own connection"
ON public.youtube_connections
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own connection
CREATE POLICY "Users can update own connection"
ON public.youtube_connections
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own connection
CREATE POLICY "Users can delete own connection"
ON public.youtube_connections
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_youtube_connections_updated_at
BEFORE UPDATE ON public.youtube_connections
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
