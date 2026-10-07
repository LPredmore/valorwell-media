begin;

CREATE OR REPLACE FUNCTION private.enqueue_ai_operations_video_workflow_job(p_tenant_id uuid, p_project_id uuid, p_job_type text, p_input_fingerprint text, p_clip_id uuid DEFAULT NULL::uuid, p_payload jsonb DEFAULT '{}'::jsonb, p_available_at timestamp with time zone DEFAULT now())
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_settings public.ai_operations_video_settings;
  v_project public.ai_operations_video_projects;
  v_job_id bigint;
  v_key text;
  v_category text;
begin
  select * into v_settings
  from public.ai_operations_video_settings
  where tenant_id=p_tenant_id
  limit 1;

  select * into v_project
  from public.ai_operations_video_projects
  where id=p_project_id and tenant_id=p_tenant_id
  limit 1;

  if not found then return null; end if;

  if coalesce(v_project.metadata->>'workflow_mode','')='parts_only'
     and p_job_type not in ('transcribe','segment_parts') then
    return null;
  end if;

  v_category:=case
    when p_job_type in (
      'generate_full_metadata','segment_parts','segment_shorts',
      'generate_title','generate_clip_copy','generate_hook','generate_thumbnail_visual_metadata',
      'generate_thumbnail_metadata','generate_project_cover_metadata'
    ) then 'ai_text'
    when p_job_type in ('generate_thumbnail','generate_project_cover') then 'ai_image'
    when p_job_type='transcribe' then 'transcription'
    when p_job_type='publish_youtube' then 'youtube_publish'
    when p_job_type='render_clip' then 'video_render_cloudflare'
    else p_job_type
  end;

  v_key:=concat_ws(
    ':','bty',p_job_type,p_project_id::text,coalesce(p_clip_id::text,'project'),
    'r'||coalesce(v_project.workflow_revision,0)::text,
    coalesce(p_input_fingerprint,'no-fingerprint')
  );

  select id into v_job_id
  from public.ai_operations_video_jobs
  where tenant_id=p_tenant_id and idempotency_key=v_key
  limit 1;
  if v_job_id is not null then return v_job_id; end if;

  update public.ai_operations_video_jobs
  set status='cancelled',
      completed_at=coalesce(completed_at,now()),
      claimed_by=null,
      claimed_at=null,
      lease_expires_at=null,
      result=coalesce(result,'{}'::jsonb)||jsonb_build_object(
        'cancel_reason','superseded_input_fingerprint',
        'superseded_at',now(),
        'replacement_fingerprint',p_input_fingerprint
      ),
      updated_at=now()
  where tenant_id=p_tenant_id
    and project_id=p_project_id
    and job_type=p_job_type
    and clip_id is not distinct from p_clip_id
    and workflow_revision=coalesce(v_project.workflow_revision,0)
    and input_fingerprint is distinct from p_input_fingerprint
    and status in ('queued','waiting','error');

  insert into public.ai_operations_video_jobs(
    tenant_id,project_id,clip_id,job_type,status,payload,idempotency_key,
    workflow_revision,input_fingerprint,available_at,max_attempts,worker_category
  )
  values(
    p_tenant_id,p_project_id,p_clip_id,p_job_type,'queued',
    coalesce(p_payload,'{}'::jsonb),v_key,coalesce(v_project.workflow_revision,0),
    p_input_fingerprint,coalesce(p_available_at,now()),coalesce(v_settings.default_max_attempts,3),
    v_category
  )
  on conflict do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id
    from public.ai_operations_video_jobs
    where tenant_id=p_tenant_id and idempotency_key=v_key
    limit 1;
  end if;

  return v_job_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.enqueue_ai_operations_video_render_job_for_clip_row(p_clip_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_clip record;
  v_project record;
  v_settings record;
  v_fp text;
  v_key text;
  v_id bigint;
begin
  select * into v_clip from public.ai_operations_video_clips where id=p_clip_id limit 1;
  if not found
     or v_clip.drive_file_id is not null
     or v_clip.clip_type not in ('short','part')
     or btrim(v_clip.transcript_text)=''
     or v_clip.pipeline_status='superseded' then
    return null;
  end if;

  select p.* into v_project
  from public.ai_operations_video_projects p
  where p.id=v_clip.project_id
  limit 1;
  if not found or v_clip.parent_file_id<>v_project.source_file_id then return null; end if;
  if coalesce(v_project.metadata->>'workflow_mode','')='parts_only' then return null; end if;

  select * into v_settings
  from public.ai_operations_video_settings
  where tenant_id=v_project.tenant_id
  limit 1;

  if not found
     or not coalesce(v_settings.workflow_enabled,false)
     or not coalesce(v_project.initial_information_complete,false)
     or v_clip.workflow_revision is distinct from v_project.workflow_revision then
    return null;
  end if;

  v_fp:=private.ai_operations_video_sha256_json(jsonb_build_object(
    'source_file_id',v_project.source_file_id,
    'source_modified_time',v_project.source_modified_time,
    'source_revision',v_project.source_revision,
    'start_seconds',v_clip.start_seconds,
    'end_seconds',v_clip.end_seconds,
    'clip_type',v_clip.clip_type,
    'render_profile_version',3
  ));

  if v_clip.drive_file_id is not null
     and v_clip.render_input_fingerprint is not distinct from v_fp then
    return null;
  end if;

  v_key:='render_clip:'||v_clip.id::text||':r'||v_project.workflow_revision::text||':'||v_fp;

  insert into public.ai_operations_video_jobs(
    tenant_id,project_id,clip_id,job_type,status,payload,idempotency_key,
    workflow_revision,input_fingerprint,available_at,max_attempts,worker_category
  )
  values(
    v_project.tenant_id,v_project.id,v_clip.id,'render_clip','queued',
    jsonb_build_object('render_profile_version',3),v_key,
    v_project.workflow_revision,v_fp,now(),
    coalesce(v_settings.default_max_attempts,3),'video_render_cloudflare'
  )
  on conflict do nothing returning id into v_id;

  if v_id is null then
    select id into v_id from public.ai_operations_video_jobs
    where tenant_id=v_project.tenant_id and idempotency_key=v_key limit 1;
  end if;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.claim_next_video_render_job(p_worker_id text, p_worker_category text, p_lease_seconds integer DEFAULT 1200)
 RETURNS SETOF ai_operations_video_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.ai_operations_video_jobs;
  v_was_status text;
begin
  if coalesce(btrim(p_worker_id),'')='' then raise exception 'p_worker_id is required'; end if;
  if p_worker_category not in ('video_render_cloudflare','video_render_ffmpeg') then
    raise exception 'invalid render worker category';
  end if;
  if p_lease_seconds < 60 then raise exception 'p_lease_seconds must be at least 60'; end if;

  update private.ai_operations_video_circuit_breakers
  set status='half_open',probe_job_id=null,updated_at=now()
  where worker_category=p_worker_category
    and status='open' and retry_after is not null and retry_after<=now();

  select j.* into v_job
  from public.ai_operations_video_jobs j
  join public.ai_operations_video_projects p on p.id=j.project_id
  join public.ai_operations_video_settings s on s.tenant_id=j.tenant_id
  where j.job_type='render_clip'
    and j.worker_category=p_worker_category
    and s.workflow_enabled
    and p.initial_information_complete
    and coalesce(p.metadata->>'workflow_mode','')<>'parts_only'
    and j.workflow_revision=p.workflow_revision
    and (j.clip_id is null or exists(
      select 1 from public.ai_operations_video_clips c
      where c.id=j.clip_id
        and c.workflow_revision=p.workflow_revision
        and c.pipeline_status<>'superseded'
    ))
    and (
      (j.status in ('queued','waiting') and coalesce(j.available_at,j.created_at)<=now())
      or (
        j.status in ('claimed','running')
        and coalesce(j.lease_expires_at,j.claimed_at,j.updated_at)<now()
      )
    )
    and not exists(
      select 1 from private.ai_operations_video_circuit_breakers b
      where b.tenant_id=j.tenant_id
        and b.worker_category=p_worker_category
        and (b.status='open' or (b.status='half_open' and b.probe_job_id is not null))
    )
  order by
    case j.status when 'queued' then 0 when 'waiting' then 1 else 2 end,
    coalesce(j.available_at,j.created_at),j.created_at,j.id
  limit 1
  for update of j skip locked;

  if not found then return; end if;
  v_was_status:=v_job.status;

  update private.ai_operations_video_circuit_breakers
  set probe_job_id=v_job.id,updated_at=now()
  where tenant_id=v_job.tenant_id and worker_category=p_worker_category
    and status='half_open' and probe_job_id is null;

  return query
  update public.ai_operations_video_jobs j
  set status='running',
      attempts=case when v_was_status='queued' then j.attempts+1 else j.attempts end,
      claimed_by=p_worker_id,
      claimed_at=now(),
      started_at=coalesce(j.started_at,now()),
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      error_message=null,
      updated_at=now(),
      payload=case
        when v_was_status in ('claimed','running') then
          j.payload||jsonb_build_object(
            'stale_recovery_count',coalesce((j.payload->>'stale_recovery_count')::integer,0)+1,
            'stale_recovered_at',now()
          )
        else j.payload
      end
  where j.id=v_job.id
  returning j.*;

  perform public.heartbeat_ai_operations_video_worker(
    p_worker_id,v_job.tenant_id,'working',v_job.id,v_job.project_id,'2.0.0',null,
    jsonb_build_object('worker_category',p_worker_category,'job_type','render_clip')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION private.orchestrate_ai_operations_video_workflow()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_settings public.ai_operations_video_settings;
  v_project record;
  v_clip record;
  v_social jsonb;
  v_fp_full text;
  v_fp_parts text;
  v_fp_shorts text;
  v_fp_cover_meta text;
  v_fp_cover text;
  v_fp_title text;
  v_fp_copy text;
  v_fp_hook text;
  v_fp_thumb_meta text;
  v_actual_parts integer;
  v_actual_shorts integer;
  v_rendered integer;
  v_title_ready integer;
  v_copy_ready integer;
  v_hook_ready integer;
  v_thumb_meta_ready integer;
  v_thumb_ready integer;
  v_publications integer;
  v_expected_total integer;
  v_full_publications integer;
  v_account_id uuid;
  v_now timestamptz:=now();
  v_full_ready boolean;
  v_parts_ready boolean;
  v_shorts_ready boolean;
  v_cover_meta_ready boolean;
  v_cover_ready boolean;
  v_title_current boolean;
  v_copy_current boolean;
  v_hook_current boolean;
  v_thumb_meta_current boolean;
  v_current_errors integer;
  v_status text;
  v_p_full integer;
  v_p_parts integer;
  v_p_shorts integer;
  v_p_title integer;
  v_p_copy integer;
  v_p_hook integer;
  v_p_thumb_meta integer;
  v_p_cover_meta integer;
  v_p_image_full integer;
  v_p_image_short integer;
  v_p_image_part integer;
begin
  select * into v_settings
  from public.ai_operations_video_settings
  where tenant_id='00000000-0000-0000-0000-000000000001'
  limit 1;

  if not found then return jsonb_build_object('ok',false,'reason','video_settings_missing'); end if;

  v_p_full:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_full_metadata');
  v_p_parts:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_segment_parts');
  v_p_shorts:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_segment_shorts');
  v_p_title:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_title_generation');
  v_p_copy:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_clip_copy');
  v_p_hook:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_hook_generation');
  v_p_thumb_meta:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_thumbnail_visual_metadata');
  v_p_cover_meta:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_project_cover_metadata');
  v_p_image_full:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_image_full_cover');
  v_p_image_short:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_image_short');
  v_p_image_part:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,'bty_image_part');

  if v_p_full is null or v_p_parts is null or v_p_shorts is null or v_p_title is null or v_p_copy is null
     or v_p_hook is null or v_p_thumb_meta is null or v_p_cover_meta is null or v_p_image_full is null
     or v_p_image_short is null or v_p_image_part is null then
    return jsonb_build_object('ok',false,'reason','active_prompt_profile_missing');
  end if;

  perform public.heartbeat_ai_operations_video_worker(
    'bty-workflow-orchestrator',v_settings.tenant_id,
    case when v_settings.workflow_enabled then 'working' else 'idle' end,
    null,null,'3.6.0',null,
    jsonb_build_object('workflow_enabled',v_settings.workflow_enabled,'prepare_only',true)
  );

  update private.ai_operations_video_circuit_breakers
  set status='half_open',probe_job_id=null,updated_at=v_now
  where status='open' and retry_after is not null and retry_after<=v_now;

  if not v_settings.workflow_enabled then
    return jsonb_build_object('ok',true,'enabled',false,'prepare_only',true);
  end if;

  select id into v_account_id
  from public.ai_operations_social_accounts
  where tenant_id=v_settings.tenant_id and platform='youtube' and auth_status='connected'
  order by is_default desc,created_at
  limit 1;

  for v_project in
    select p.*
    from public.ai_operations_video_projects p
    where p.tenant_id=v_settings.tenant_id
      and p.status<>'archived'
      and (p.source_folder_id is null or v_settings.drive_folder_id is null or p.source_folder_id=v_settings.drive_folder_id)
    order by p.created_at
  loop
    if not v_project.initial_information_complete then
      update public.ai_operations_video_projects
      set pipeline_status='intake',pipeline_completed_at=null,updated_at=v_now
      where id=v_project.id
        and (pipeline_status is distinct from 'intake' or pipeline_completed_at is not null);
      continue;
    end if;

    if coalesce(btrim(v_project.transcript_text),'')='' or v_project.transcript_completed_at is null then
      update public.ai_operations_video_projects
      set pipeline_status='waiting_transcript',pipeline_completed_at=null,updated_at=v_now
      where id=v_project.id
        and (pipeline_status is distinct from 'waiting_transcript' or pipeline_completed_at is not null);
      continue;
    end if;

    if coalesce(v_project.metadata->>'workflow_mode','')='parts_only' then
      v_fp_parts:=private.ai_operations_video_sha256_json(jsonb_build_object(
        'step','segment_parts_v4_min210_pref600',
        'transcript',v_project.transcript_text,
        'duration_seconds',v_project.duration_seconds,
        'min_seconds',v_settings.default_min_clip_seconds,
        'max_seconds',v_settings.default_target_max_clip_seconds,
        'text_model',v_settings.text_model_id,
        'ai_config_revision',v_settings.ai_config_revision,
        'prompt_profile','bty_segment_parts',
        'prompt_version',v_p_parts,
        'source_revision',v_project.source_revision
      ));

      if v_project.parts_input_fingerprint is distinct from v_fp_parts then
        perform private.enqueue_ai_operations_video_workflow_job(
          v_settings.tenant_id,v_project.id,'segment_parts',v_fp_parts,null,
          jsonb_build_object(
            'prompt_profile','bty_segment_parts',
            'prompt_profile_version',v_p_parts,
            'min_seconds',v_settings.default_min_clip_seconds,
            'max_seconds',v_settings.default_target_max_clip_seconds
          )
        );
      end if;

      update public.ai_operations_video_projects
      set pipeline_status=case
            when parts_input_fingerprint is not distinct from v_fp_parts
              and expected_part_count is not null then 'parts_ready'
            else 'segmenting_parts'
          end,
          pipeline_completed_at=null,
          updated_at=v_now
      where id=v_project.id;

      continue;
    end if;

    v_social:=private.ai_operations_video_project_social_json(v_project.id);

    v_fp_full:=private.ai_operations_video_sha256_json(jsonb_build_object(
      'step','generate_full_metadata_v3',
      'transcript',v_project.transcript_text,
      'guest_name',v_project.guest_name,
      'organization_name',v_project.organization_name,
      'guest_image_url',v_project.guest_image_url,
      'social_links',v_social,
      'text_model',v_settings.text_model_id,
      'ai_config_revision',v_settings.ai_config_revision,
      'prompt_profile','bty_full_metadata',
      'prompt_version',v_p_full,
      'workflow_revision',v_project.workflow_revision
    ));

    if v_project.full_metadata_input_fingerprint is distinct from v_fp_full then
      perform private.enqueue_ai_operations_video_workflow_job(
        v_settings.tenant_id,v_project.id,'generate_full_metadata',v_fp_full,null,
        jsonb_build_object('prompt_profile','bty_full_metadata','prompt_profile_version',v_p_full)
      );
    end if;

    v_full_ready:=v_project.full_metadata_input_fingerprint is not distinct from v_fp_full;

    v_fp_parts:=private.ai_operations_video_sha256_json(jsonb_build_object(
      'step','segment_parts_v4_min210_pref600',
      'transcript',v_project.transcript_text,
      'duration_seconds',v_project.duration_seconds,
      'min_seconds',v_settings.default_min_clip_seconds,
      'max_seconds',v_settings.default_target_max_clip_seconds,
      'text_model',v_settings.text_model_id,
      'ai_config_revision',v_settings.ai_config_revision,
      'prompt_profile','bty_segment_parts',
      'prompt_version',v_p_parts,
      'source_revision',v_project.source_revision
    ));

    if v_project.parts_input_fingerprint is distinct from v_fp_parts then
      perform private.enqueue_ai_operations_video_workflow_job(
        v_settings.tenant_id,v_project.id,'segment_parts',v_fp_parts,null,
        jsonb_build_object(
          'prompt_profile','bty_segment_parts',
          'prompt_profile_version',v_p_parts,
          'min_seconds',v_settings.default_min_clip_seconds,
          'max_seconds',v_settings.default_target_max_clip_seconds
        )
      );
    end if;
    v_parts_ready:=v_project.parts_input_fingerprint is not distinct from v_fp_parts;

    if v_parts_ready then
      v_fp_shorts:=private.ai_operations_video_sha256_json(jsonb_build_object(
        'step','segment_shorts_v3',
        'transcript',v_project.transcript_text,
        'duration_seconds',v_project.duration_seconds,
        'short_threshold_seconds',v_settings.short_clip_threshold_seconds,
        'text_model',v_settings.text_model_id,
        'ai_config_revision',v_settings.ai_config_revision,
        'prompt_profile','bty_segment_shorts',
        'prompt_version',v_p_shorts,
        'source_revision',v_project.source_revision
      ));
      if v_project.shorts_input_fingerprint is distinct from v_fp_shorts then
        perform private.enqueue_ai_operations_video_workflow_job(
          v_settings.tenant_id,v_project.id,'segment_shorts',v_fp_shorts,null,
          jsonb_build_object(
            'prompt_profile','bty_segment_shorts',
            'prompt_profile_version',v_p_shorts,
            'max_seconds',least(v_settings.short_clip_threshold_seconds,120)
          )
        );
      end if;
      v_shorts_ready:=v_project.shorts_input_fingerprint is not distinct from v_fp_shorts;
    else
      v_fp_shorts:=null;
      v_shorts_ready:=false;
    end if;

    if v_full_ready then
      v_fp_cover_meta:=private.ai_operations_video_sha256_json(jsonb_build_object(
        'step','generate_project_cover_metadata_v2',
        'full_metadata_fingerprint',v_fp_full,
        'guest_name',v_project.guest_name,
        'organization_name',v_project.organization_name,
        'text_model',v_settings.text_model_id,
        'ai_config_revision',v_settings.ai_config_revision,
        'prompt_profile','bty_project_cover_metadata',
        'prompt_version',v_p_cover_meta,
        'workflow_revision',v_project.workflow_revision
      ));
      if v_project.cover_metadata_input_fingerprint is distinct from v_fp_cover_meta then
        perform private.enqueue_ai_operations_video_workflow_job(
          v_settings.tenant_id,v_project.id,'generate_project_cover_metadata',v_fp_cover_meta,null,
          jsonb_build_object(
            'prompt_profile','bty_project_cover_metadata',
            'prompt_profile_version',v_p_cover_meta
          )
        );
      end if;
      v_cover_meta_ready:=v_project.cover_metadata_input_fingerprint is not distinct from v_fp_cover_meta;
    else
      v_fp_cover_meta:=null;
      v_cover_meta_ready:=false;
    end if;

    if v_cover_meta_ready then
      v_fp_cover:=private.ai_operations_video_sha256_json(jsonb_build_object(
        'step','generate_project_cover_v3',
        'cover_metadata_fingerprint',v_fp_cover_meta,
        'cover_hook_text',v_project.cover_hook_text,
        'cover_primary_speaker',v_project.cover_primary_speaker,
        'cover_person_positioning',v_project.cover_person_positioning,
        'cover_facial_expression',v_project.cover_facial_expression,
        'cover_gesture_action',v_project.cover_gesture_action,
        'cover_camera_framing',v_project.cover_camera_framing,
        'cover_pose_family',v_project.cover_pose_family,
        'cover_core_visual',v_project.cover_core_visual,
        'cover_hook_text_placement',v_project.cover_hook_text_placement,
        'guest_image_url',v_project.guest_image_url,
        'image_model',v_settings.image_model_id,
        'text_model',v_settings.text_model_id,
        'ai_config_revision',v_settings.ai_config_revision,
        'prompt_profile','bty_image_full_cover',
        'prompt_version',v_p_image_full,
        'workflow_revision',v_project.workflow_revision
      ));

      if v_project.cover_input_fingerprint is distinct from v_fp_cover then
        if v_project.cover_image_file_id is not null then
          update public.ai_operations_video_projects
          set cover_image_file_id=null,cover_image_url=null,cover_input_fingerprint=null,updated_at=v_now
          where id=v_project.id;
          update public.ai_operations_social_publications
          set thumbnail_file_id=null,thumbnail_url=null,updated_at=v_now
          where project_id=v_project.id and source_type='project'
            and workflow_revision=v_project.workflow_revision
            and status in ('draft','ready','approved');
        end if;

        perform private.enqueue_ai_operations_video_workflow_job(
          v_settings.tenant_id,v_project.id,'generate_project_cover',v_fp_cover,null,
          jsonb_build_object(
            'prompt_profile','bty_image_full_cover',
            'prompt_profile_version',v_p_image_full,
            'aspect_ratio','16:9',
            'generation_revision',v_project.cover_metadata_revision
          )
        );
      end if;

      select (p.cover_input_fingerprint is not distinct from v_fp_cover and p.cover_image_file_id is not null)
      into v_cover_ready
      from public.ai_operations_video_projects p
      where p.id=v_project.id;
    else
      v_fp_cover:=null;
      v_cover_ready:=false;
    end if;

    if v_parts_ready and v_shorts_ready then
      for v_clip in
        select c.*
        from public.ai_operations_video_clips c
        where c.project_id=v_project.id
          and c.clip_type in ('part','short')
          and c.pipeline_status<>'superseded'
          and c.workflow_revision=v_project.workflow_revision
        order by c.start_seconds,c.id
      loop
        if v_clip.drive_file_id is not null and v_clip.rendered_at is not null then
          v_fp_title:=private.ai_operations_video_sha256_json(jsonb_build_object(
            'step','generate_title_v2_shared_text_model',
            'transcript',v_clip.transcript_text,
            'text_model',v_settings.text_model_id,
            'reasoning_effort','high',
            'title_behavior_revision',1,
            'workflow_revision',v_project.workflow_revision
          ));

          if coalesce(btrim(v_clip.youtube_title),'')<>'' and v_clip.title_input_fingerprint is null then
            update public.ai_operations_video_clips
            set title_input_fingerprint=v_fp_title,
                title_candidates=coalesce(title_candidates,jsonb_build_array(
                  jsonb_build_object(
                    'title',v_clip.youtube_title,
                    'score',100,
                    'character_count',char_length(v_clip.youtube_title)
                  )
                )),
                title_generation_meta=coalesce(title_generation_meta,jsonb_build_object(
                  'source','legacy_backfill',
                  'context_mode','legacy',
                  'prompt_profile','bty_title_generation',
                  'prompt_version',v_p_title
                )),
                title_generated_at=coalesce(title_generated_at,v_now),
                updated_at=v_now
            where id=v_clip.id;
            v_clip.title_input_fingerprint:=v_fp_title;
          end if;

          v_title_current:=
            v_clip.title_input_fingerprint is not distinct from v_fp_title
            and coalesce(btrim(v_clip.youtube_title),'')<>'';

          if not v_title_current then
            update public.ai_operations_video_clips
            set youtube_title=null,
                title_candidates=null,title_generation_meta=null,title_generated_at=null,title_input_fingerprint=null,
                youtube_description=null,linkedin_description=null,facebook_description=null,tiktok_description=null,
                hashtags='{}'::text[],copy_input_fingerprint=null,
                thumbnail_metadata_input_fingerprint=null,thumbnail_input_fingerprint=null,
                primary_speaker=null,person_positioning=null,facial_expression=null,gesture_action=null,
                camera_framing=null,pose_family=null,core_visual=null,hook_text_placement=null,
                cover_image_file_id=null,cover_image_url=null,pipeline_status='rendered',updated_at=v_now
            where id=v_clip.id;

            update public.ai_operations_social_publications
            set title=null,description=null,thumbnail_file_id=null,thumbnail_url=null,updated_at=v_now
            where clip_id=v_clip.id and status in ('draft','ready','approved');

            perform private.enqueue_ai_operations_video_workflow_job(
              v_settings.tenant_id,v_project.id,'generate_title',v_fp_title,v_clip.id,
              jsonb_build_object('prompt_profile','bty_title_generation','prompt_profile_version',v_p_title)
            );
          else
            v_fp_copy:=private.ai_operations_video_sha256_json(jsonb_build_object(
              'step','generate_clip_copy_v4_descriptions_only',
              'clip_type',v_clip.clip_type,
              'transcript',v_clip.transcript_text,
              'title_input_fingerprint',v_clip.title_input_fingerprint,
              'youtube_title',v_clip.youtube_title,
              'guest_name',v_project.guest_name,
              'organization_name',v_project.organization_name,
              'social_links',v_social,
              'text_model',v_settings.text_model_id,
              'ai_config_revision',v_settings.ai_config_revision,
              'prompt_profile','bty_clip_copy',
              'prompt_version',v_p_copy,
              'workflow_revision',v_project.workflow_revision
            ));

            if v_clip.title_generation_meta->>'source'='legacy_backfill'
               and v_clip.copy_input_fingerprint is not null
               and v_clip.copy_input_fingerprint is distinct from v_fp_copy then
              update public.ai_operations_video_clips
              set copy_input_fingerprint=v_fp_copy,updated_at=v_now
              where id=v_clip.id;
              v_clip.copy_input_fingerprint:=v_fp_copy;
            end if;

            v_copy_current:=v_clip.copy_input_fingerprint is not distinct from v_fp_copy;

            if not v_copy_current then
              update public.ai_operations_video_clips
              set youtube_description=null,linkedin_description=null,facebook_description=null,tiktok_description=null,
                  hashtags='{}'::text[],copy_input_fingerprint=null,pipeline_status='title_ready',updated_at=v_now
              where id=v_clip.id;

              update public.ai_operations_social_publications
              set title=v_clip.youtube_title,description=null,updated_at=v_now
              where clip_id=v_clip.id and status in ('draft','ready','approved');

              perform private.enqueue_ai_operations_video_workflow_job(
                v_settings.tenant_id,v_project.id,'generate_clip_copy',v_fp_copy,v_clip.id,
                jsonb_build_object('prompt_profile','bty_clip_copy','prompt_profile_version',v_p_copy)
              );
            else
              if v_account_id is not null then
              insert into public.ai_operations_social_publications(
                tenant_id,account_id,platform,source_type,project_id,clip_id,content_format,status,
                delivery_mode,timezone,title,description,hashtags,thumbnail_file_id,thumbnail_url,
                workflow_revision,created_at,updated_at
              )
              values(
                v_settings.tenant_id,v_account_id,'youtube','clip',v_project.id,v_clip.id,
                case when v_clip.clip_type='part' then 'long_form' else 'short' end,
                'draft','immediate',v_settings.workflow_timezone,v_clip.youtube_title,v_clip.youtube_description,
                coalesce(v_clip.hashtags,'{}'::text[]),v_clip.cover_image_file_id,v_clip.cover_image_url,
                v_project.workflow_revision,v_now,v_now
              )
              on conflict do nothing;

              update public.ai_operations_social_publications
              set title=v_clip.youtube_title,
                  description=v_clip.youtube_description,
                  hashtags=coalesce(v_clip.hashtags,'{}'::text[]),
                  workflow_revision=v_project.workflow_revision,
                  updated_at=v_now
              where account_id=v_account_id and clip_id=v_clip.id and status in ('draft','ready','approved');
            end if;

            v_fp_hook:=private.ai_operations_video_sha256_json(jsonb_build_object(
              'step','generate_hook_v3_shared_text_model',
              'transcript',v_clip.transcript_text,
              'text_model',v_settings.text_model_id,
              'reasoning_effort','high',
              'hook_behavior_revision',2,
              'workflow_revision',v_project.workflow_revision
            ));

            if coalesce(btrim(v_clip.hook_text),'')<>'' and v_clip.hook_input_fingerprint is null then
              update public.ai_operations_video_clips
              set hook_input_fingerprint=v_fp_hook,
                  hook_candidates=coalesce(hook_candidates,jsonb_build_array(
                    jsonb_build_object('hook_text',v_clip.hook_text,'score',100)
                  )),
                  hook_generation_meta=coalesce(hook_generation_meta,jsonb_build_object(
                    'source','architecture_backfill',
                    'prompt_profile','bty_hook_generation',
                    'prompt_version',v_p_hook
                  )),
                  hook_generated_at=coalesce(hook_generated_at,v_now),
                  pipeline_status=case
                    when thumbnail_metadata_input_fingerprint is null then 'hook_ready'
                    else pipeline_status
                  end,
                  updated_at=v_now
              where id=v_clip.id;
              v_clip.hook_input_fingerprint:=v_fp_hook;
            end if;

            v_hook_current:=
              v_clip.hook_input_fingerprint is not distinct from v_fp_hook
              and coalesce(btrim(v_clip.hook_text),'')<>'';

            if not v_hook_current then
              update public.ai_operations_video_clips
              set hook_text=null,
                  hook_candidates=null,
                  hook_generation_meta=null,
                  hook_generated_at=null,
                  hook_input_fingerprint=null,
                  thumbnail_metadata_input_fingerprint=null,thumbnail_input_fingerprint=null,
                  primary_speaker=null,person_positioning=null,facial_expression=null,
                  gesture_action=null,camera_framing=null,pose_family=null,core_visual=null,hook_text_placement=null,
                  cover_image_file_id=null,cover_image_url=null,pipeline_status='copy_ready',updated_at=v_now
              where id=v_clip.id;

              update public.ai_operations_social_publications
              set thumbnail_file_id=null,thumbnail_url=null,updated_at=v_now
              where clip_id=v_clip.id and status in ('draft','ready','approved');

              perform private.enqueue_ai_operations_video_workflow_job(
                v_settings.tenant_id,v_project.id,'generate_hook',v_fp_hook,v_clip.id,
                jsonb_build_object(
                  'prompt_profile','bty_hook_generation',
                  'prompt_profile_version',v_p_hook
                )
              );
            else
              v_fp_thumb_meta:=private.ai_operations_video_sha256_json(jsonb_build_object(
                'step','generate_thumbnail_visual_metadata_v1',
                'clip_type',v_clip.clip_type,
                'transcript',v_clip.transcript_text,
                'youtube_title',v_clip.youtube_title,
                'hook_input_fingerprint',v_clip.hook_input_fingerprint,
                'hook_text',v_clip.hook_text,
                'guest_name',v_project.guest_name,
                'organization_name',v_project.organization_name,
                'text_model',v_settings.text_model_id,
                'ai_config_revision',v_settings.ai_config_revision,
                'prompt_profile','bty_thumbnail_visual_metadata',
                'prompt_version',v_p_thumb_meta,
                'workflow_revision',v_project.workflow_revision
              ));

              v_thumb_meta_current:=v_clip.thumbnail_metadata_input_fingerprint is not distinct from v_fp_thumb_meta;

              if not v_thumb_meta_current then
                update public.ai_operations_video_clips
                set thumbnail_metadata_input_fingerprint=null,thumbnail_input_fingerprint=null,
                    primary_speaker=null,person_positioning=null,facial_expression=null,
                    gesture_action=null,camera_framing=null,pose_family=null,core_visual=null,hook_text_placement=null,
                    cover_image_file_id=null,cover_image_url=null,pipeline_status='hook_ready',updated_at=v_now
                where id=v_clip.id;

                update public.ai_operations_social_publications
                set thumbnail_file_id=null,thumbnail_url=null,updated_at=v_now
                where clip_id=v_clip.id and status in ('draft','ready','approved');

                perform private.enqueue_ai_operations_video_workflow_job(
                  v_settings.tenant_id,v_project.id,'generate_thumbnail_visual_metadata',v_fp_thumb_meta,v_clip.id,
                  jsonb_build_object(
                    'prompt_profile','bty_thumbnail_visual_metadata',
                    'prompt_profile_version',v_p_thumb_meta
                  )
                );
              else
                perform private.enqueue_ai_operations_video_thumbnail_job(v_clip.id);
              end if;
            end if;
          end if;
          end if;
        end if;
      end loop;
    end if;

    select count(*) filter(where clip_type='part'),
           count(*) filter(where clip_type='short'),
           count(*) filter(where drive_file_id is not null and rendered_at is not null),
           count(*) filter(where title_input_fingerprint is not null and coalesce(btrim(youtube_title),'')<>''),
           count(*) filter(where copy_input_fingerprint is not null),
           count(*) filter(where hook_input_fingerprint is not null and coalesce(btrim(hook_text),'')<>''),
           count(*) filter(where thumbnail_metadata_input_fingerprint is not null),
           count(*) filter(where cover_image_file_id is not null and thumbnail_input_fingerprint is not null)
    into v_actual_parts,v_actual_shorts,v_rendered,v_title_ready,v_copy_ready,v_hook_ready,v_thumb_meta_ready,v_thumb_ready
    from public.ai_operations_video_clips
    where project_id=v_project.id and clip_type in ('part','short')
      and pipeline_status<>'superseded'
      and workflow_revision=v_project.workflow_revision;

    v_expected_total:=coalesce(v_project.expected_part_count,v_actual_parts)+coalesce(v_project.expected_short_count,v_actual_shorts);

    select count(*) into v_publications
    from public.ai_operations_social_publications sp
    join public.ai_operations_video_clips c on c.id=sp.clip_id
    where sp.project_id=v_project.id and sp.source_type='clip'
      and sp.workflow_revision=v_project.workflow_revision
      and sp.status in ('draft','ready','approved')
      and c.pipeline_status<>'superseded'
      and c.workflow_revision=v_project.workflow_revision
      and c.copy_input_fingerprint is not null;

    select count(*) into v_full_publications
    from public.ai_operations_social_publications sp
    where sp.project_id=v_project.id
      and sp.source_type='project'
      and sp.workflow_revision=v_project.workflow_revision
      and sp.status in ('draft','ready','approved');

    select count(*) into v_current_errors
    from public.ai_operations_video_jobs j
    where j.project_id=v_project.id
      and j.status='error'
      and j.workflow_revision=v_project.workflow_revision;

    v_status:=case
      when v_current_errors>0 then 'needs_attention'
      when not v_full_ready or v_full_publications<1 then 'generating_full_metadata'
      when not v_cover_meta_ready then 'generating_full_cover_metadata'
      when not v_cover_ready then 'generating_full_cover'
      when not v_parts_ready or v_project.expected_part_count is null then 'segmenting_parts'
      when not v_shorts_ready or v_project.expected_short_count is null then 'segmenting_shorts'
      when v_rendered<v_expected_total then 'rendering_clips'
      when v_title_ready<v_expected_total then 'generating_titles'
      when v_copy_ready<v_expected_total then 'generating_copy'
      when v_hook_ready<v_expected_total then 'generating_hooks'
      when v_thumb_meta_ready<v_expected_total then 'generating_thumbnail_metadata'
      when v_thumb_ready<v_expected_total then 'generating_thumbnails'
      when v_publications<v_expected_total then 'creating_publications'
      else 'prepared_for_review'
    end;

    update public.ai_operations_video_projects
    set pipeline_status=v_status,
        pipeline_completed_at=case when v_status='prepared_for_review' then coalesce(pipeline_completed_at,v_now) else null end,
        updated_at=v_now
    where id=v_project.id;
  end loop;

  perform public.heartbeat_ai_operations_video_worker(
    'bty-workflow-orchestrator',v_settings.tenant_id,'idle',null,null,'3.6.0',null,
    jsonb_build_object('workflow_enabled',true,'prepare_only',true)
  );

  return jsonb_build_object('ok',true,'enabled',true,'prepare_only',true,'ran_at',v_now);
end;
$function$
;

commit;
