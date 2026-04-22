DROP POLICY IF EXISTS "Authenticated can read avatar objects" ON storage.objects;

-- Users can only list/read avatar objects in their own folder
CREATE POLICY "Users can read own avatar objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);