-- Operator-controlled Short expression switch, using the existing thumbnail requeue trigger.
-- Available only to trusted service workers. Published/scheduled content is protected.
CREATE OR REPLACE FUNCTION public.override_bty_short_expression(
 p_clip_id uuid, p_tenant_id uuid, p_preset_code text, p_lock boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
 c public.ai_operations_video_clips%ROWTYPE;
 p public.ai_operations_thumbnail_expression_presets%ROWTYPE;
 v_generation integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('bty-expression:'||p_tenant_id::text,0));
 SELECT * INTO c FROM public.ai_operations_video_clips WHERE id=p_clip_id FOR UPDATE;
 IF NOT FOUND OR c.clip_type<>'short' OR
   NOT EXISTS(SELECT 1 FROM public.ai_operations_video_projects pr
     WHERE pr.id=c.project_id AND pr.tenant_id=p_tenant_id) THEN
   RAISE EXCEPTION 'Invalid tenant or Short clip';
 END IF;
 IF coalesce(c.youtube_video_id,'')<>'' OR EXISTS(
   SELECT 1 FROM public.ai_operations_social_publications pub
   WHERE pub.clip_id=p_clip_id AND pub.status NOT IN ('draft','ready','approved','cancelled')
 ) THEN RAISE EXCEPTION 'Cannot override uploaded or scheduled content'; END IF;
 SELECT * INTO p FROM public.ai_operations_thumbnail_expression_presets
 WHERE tenant_id=p_tenant_id AND code=p_preset_code AND active=true
   AND valence<>'negative';
 IF NOT FOUND THEN RAISE EXCEPTION 'Curated nonnegative preset not found'; END IF;
 IF c.thumbnail_expression_preset_id=p.id AND c.thumbnail_expression_locked=p_lock
 THEN RETURN jsonb_build_object('unchanged',true,'code',p.code,'locked',p_lock); END IF;
 v_generation:=c.thumbnail_generation_revision+1;
 UPDATE public.ai_operations_video_clips SET
   person_positioning=p.person_positioning,facial_expression=p.facial_expression,
   gesture_action=p.gesture_action,camera_framing=p.camera_framing,
   pose_family=p.pose_family,
   hook_text_placement=coalesce(nullif(hook_text_placement,''),p.hook_text_placement),
   thumbnail_expression_preset_id=p.id,
   thumbnail_expression_family=p.emotion_family,
   thumbnail_expression_selection_reason='manual_override',
   thumbnail_expression_selection_version=1,
   thumbnail_expression_locked=p_lock,
   thumbnail_expression_selected_at=now(),
   thumbnail_generation_revision=v_generation,
   thumbnail_input_fingerprint=NULL,
   cover_image_file_id=NULL,cover_image_url=NULL,
   pipeline_status='thumbnail_metadata_ready',updated_at=now(),
   last_progress_at=now()
 WHERE id=c.id;
 INSERT INTO public.ai_operations_thumbnail_expression_usage
 (tenant_id,project_id,clip_id,preset_id,speaker_name,emotion_family,generation_revision,selection_reason)
 VALUES(p_tenant_id,c.project_id,c.id,p.id,coalesce(nullif(c.primary_speaker,''),'unknown'),
 p.emotion_family,v_generation,'manual_override');
 UPDATE public.ai_operations_social_publications SET
   thumbnail_file_id=NULL,thumbnail_url=NULL,updated_at=now()
 WHERE clip_id=p_clip_id AND status IN ('draft','ready','approved');
 RETURN jsonb_build_object('code',p.code,'preset_id',p.id,
   'generation_revision',v_generation,'locked',p_lock,
   'queued_for_rebuild',coalesce(c.hook_input_fingerprint,'')<>'');
END;
$$;
REVOKE ALL ON FUNCTION public.override_bty_short_expression(uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.override_bty_short_expression(uuid,uuid,text,boolean) TO service_role;
