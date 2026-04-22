-- Replace the broad public read with a more limited policy.
-- Direct file access via URL still works because the bucket is public,
-- but anonymous listing of all objects is no longer allowed.
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Authenticated users can list/read avatar metadata
CREATE POLICY "Authenticated can read avatar objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');