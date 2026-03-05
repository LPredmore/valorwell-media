
CREATE OR REPLACE FUNCTION public.auto_promote_incomplete()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
begin
  if new.status = 'incomplete' then
    if coalesce(new.video_storage_path, '') <> ''
       and coalesce(new.post_title, '') <> ''
       and new.post_length is not null
    then
      if new.post_length::text = 'Short'
         or coalesce(new.image, '') <> ''
      then
        new.status := 'unscheduled';
      end if;
    end if;
  end if;

  return new;
end;
$$;

CREATE TRIGGER trg_auto_promote_incomplete
  BEFORE INSERT OR UPDATE ON public.social_content
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_promote_incomplete();
