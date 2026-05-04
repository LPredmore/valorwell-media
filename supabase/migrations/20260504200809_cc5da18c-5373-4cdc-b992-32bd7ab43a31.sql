CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  generated_username text;
BEGIN
  INSERT INTO public.profiles (id, email, onboarding_completed)
  VALUES (NEW.id, NEW.email, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  generated_username := 'flurra' || replace(NEW.id::text, '-', '');

  -- Reserve a username row but do NOT call Upload-Post yet.
  -- Profile is created lazily on first Connect click to avoid burning slots
  -- on signups that never connect a social account.
  INSERT INTO public.upload_post_profiles (user_id, username, provisioning_status)
  VALUES (NEW.id, generated_username, 'pending')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;