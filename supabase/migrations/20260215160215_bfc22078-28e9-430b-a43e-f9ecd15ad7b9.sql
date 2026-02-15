
-- Map old text statuses to enum values before converting
UPDATE social_content SET status = 'incomplete' WHERE status IN ('new', 'uploading', 'ready', 'generating', 'error');
UPDATE social_content SET status = 'unscheduled' WHERE status = 'complete';

-- Drop default, convert type, re-add default
ALTER TABLE social_content ALTER COLUMN status DROP DEFAULT;
ALTER TABLE social_content ALTER COLUMN status TYPE post_status USING status::post_status;
ALTER TABLE social_content ALTER COLUMN status SET DEFAULT 'incomplete';

UPDATE posted_content SET status = 'posted' WHERE true;

ALTER TABLE posted_content ALTER COLUMN status DROP DEFAULT;
ALTER TABLE posted_content ALTER COLUMN status TYPE post_status USING status::post_status;
ALTER TABLE posted_content ALTER COLUMN status SET DEFAULT 'posted';

-- Add playlist_id to both tables
ALTER TABLE social_content ADD COLUMN playlist_id bigint REFERENCES playlists(id);
ALTER TABLE posted_content ADD COLUMN playlist_id bigint REFERENCES playlists(id);

-- Enable RLS on playlists
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated select" ON playlists FOR SELECT USING (true);

-- Enable pg_cron and pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
