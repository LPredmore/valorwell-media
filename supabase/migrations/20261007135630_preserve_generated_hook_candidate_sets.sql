CREATE OR REPLACE FUNCTION private.invalidate_ai_operations_video_thumbnail_visuals_on_hook_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.hook_text is distinct from old.hook_text
     and new.hook_input_fingerprint is not distinct from old.hook_input_fingerprint
     and not (
       coalesce(new.hook_generation_revision,0) > coalesce(old.hook_generation_revision,0)
       and new.hook_generation_meta->>'source' = 'generated'
     ) then

    new.hook_generation_revision:=coalesce(old.hook_generation_revision,0)+1;
    new.hook_generated_at:=now();
    new.hook_generation_meta:=coalesce(old.hook_generation_meta,'{}'::jsonb)
      || jsonb_build_object('source','manual_override','overridden_at',now());

    if coalesce(btrim(new.hook_text),'')='' then
      new.hook_input_fingerprint:=null;
      new.hook_candidates:=null;
      if new.pipeline_status<>'superseded' then
        new.pipeline_status:='copy_ready';
      end if;
    else
      new.hook_candidates:=jsonb_build_array(
        jsonb_build_object('hook_text',new.hook_text,'score',100)
      );
      if new.pipeline_status<>'superseded' then
        new.pipeline_status:='hook_ready';
      end if;
    end if;

    new.thumbnail_metadata_input_fingerprint:=null;
    new.thumbnail_input_fingerprint:=null;
    new.primary_speaker:=null;
    new.person_positioning:=null;
    new.facial_expression:=null;
    new.gesture_action:=null;
    new.camera_framing:=null;
    new.pose_family:=null;
    new.core_visual:=null;
    new.hook_text_placement:=null;
    new.cover_image_file_id:=null;
    new.cover_image_url:=null;
    new.updated_at:=now();
  end if;

  return new;
end;
$function$
;
