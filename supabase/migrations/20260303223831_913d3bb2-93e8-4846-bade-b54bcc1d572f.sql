ALTER TABLE public.posted_content
  ADD COLUMN youtube_comment text,
  ADD COLUMN youtube_comment_status text,
  ADD COLUMN youtube_comment_id text,
  ADD COLUMN youtube_comment_posted_at timestamptz,
  ADD COLUMN youtube_comment_error_detail text;