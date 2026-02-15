SELECT cron.schedule(
  'post-scheduled-content',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://asjhkidpuhqodryczuth.supabase.co/functions/v1/post-scheduled-content',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzamhraWRwdWhxb2RyeWN6dXRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzIzNDYsImV4cCI6MjA4NTg0ODM0Nn0.kb_iP02Fu-NNJtemRnLh7DhwaAybUEMUYQFaFWNxDOA"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);