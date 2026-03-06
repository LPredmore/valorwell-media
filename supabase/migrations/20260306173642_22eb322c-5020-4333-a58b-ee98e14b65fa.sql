ALTER TABLE posted_content
  ADD COLUMN tiktok_status text DEFAULT NULL,
  ADD COLUMN tiktok_error text DEFAULT NULL;