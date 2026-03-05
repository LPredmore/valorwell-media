CREATE OR REPLACE FUNCTION public.enforce_youtube_schedule_requirements()
  RETURNS trigger
  LANGUAGE plpgsql
AS $$
begin
  if new.scheduled_at is not null then
    -- Image only required for Long-form content (not Shorts)
    if new.post_length IS DISTINCT FROM 'Short' and coalesce(new.image, '') = '' then
      raise exception 'Cannot schedule: image is missing';
    end if;

    if coalesce(new.video_storage_path, '') = '' then
      raise exception 'Cannot schedule: video_storage_path is missing';
    end if;

    if coalesce(new.post_title, '') = '' then
      raise exception 'Cannot schedule: post_title is missing';
    end if;

    -- youtube_desc only required for Long-form content (not Shorts)
    if new.post_length IS DISTINCT FROM 'Short' and coalesce(new.youtube_desc, '') = '' then
      raise exception 'Cannot schedule: youtube_desc is missing';
    end if;

    if new.post_length is null then
      raise exception 'Cannot schedule: post_length is missing';
    end if;
  end if;

  return new;
end;
$$;