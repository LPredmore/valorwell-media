
CREATE TABLE public.user_knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  extracted_text text,
  status text NOT NULL DEFAULT 'pending',
  error text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX user_knowledge_files_user_idx ON public.user_knowledge_files(user_id);

ALTER TABLE public.user_knowledge_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own knowledge files"
  ON public.user_knowledge_files FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own knowledge files"
  ON public.user_knowledge_files FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own knowledge files"
  ON public.user_knowledge_files FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own knowledge files"
  ON public.user_knowledge_files FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins full access knowledge files"
  ON public.user_knowledge_files FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER user_knowledge_files_set_updated_at
  BEFORE UPDATE ON public.user_knowledge_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Storage policies for content-media bucket, scoped to knowledge/<user-id>/...
CREATE POLICY "Users upload knowledge files to own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-media'
    AND (storage.foldername(name))[1] = 'knowledge'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users read own knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-media'
    AND (storage.foldername(name))[1] = 'knowledge'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Users delete own knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-media'
    AND (storage.foldername(name))[1] = 'knowledge'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
