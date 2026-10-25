-- Additive, service-only identity records. Existing single-guest URLs remain authoritative.
create table public.ai_operations_video_project_guests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_operations_video_projects(id) on delete cascade,
  display_name text not null check (btrim(display_name) <> ''),
  sort_order integer not null default 0,
  speaker_aliases jsonb not null default '[]'::jsonb check (jsonb_typeof(speaker_aliases)='array'),
  reference_image_file_id text,
  reference_image_url text,
  reference_source_type text,
  reference_quality_score numeric check (reference_quality_score between 0 and 1),
  face_detection_confidence numeric check (face_detection_confidence between 0 and 1),
  reference_status text not null default 'pending' check (reference_status in ('pending','approved','needs_review')),
  reference_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, display_name),
  check (reference_status <> 'approved' or (nullif(btrim(reference_image_file_id),'') is not null or nullif(btrim(reference_image_url),'') is not null))
);
alter table public.ai_operations_video_project_guests enable row level security;
revoke all on public.ai_operations_video_project_guests from anon, authenticated;
grant all on public.ai_operations_video_project_guests to service_role;

create function private.video_guest_reference_key(p_file_id text,p_url text) returns text
language sql immutable set search_path='' as $$
  select coalesce('drive:'||nullif(btrim(p_file_id),''),
    'drive:'||substring(p_url from '^https?://drive\.google\.com/file/d/([A-Za-z0-9_-]+)'),
    case when p_url ~ '^https?://drive\.google\.com/' then
      'drive:'||substring(p_url from '[?&]id=([A-Za-z0-9_-]+)') end,
    'url:'||nullif(btrim(p_url),''));
$$;

-- Metadata is used for guest_count/subject_mode; avoid changing existing project-row contracts.
create function private.video_guest_names(p_project_id uuid) returns text[]
language sql stable set search_path='' as $$
  select case when jsonb_typeof(p.metadata->'thumbnail_required_guests')='array'
      then array(select btrim(value) from jsonb_array_elements_text(p.metadata->'thumbnail_required_guests') where btrim(value)<>'')
    else regexp_split_to_array(btrim(coalesce(p.guest_name,'')), '\s+(?:and|&)\s+', 'i') end
  from public.ai_operations_video_projects p where p.id=p_project_id;
$$;
create function private.video_guest_manifest(p_project_id uuid) returns jsonb
language plpgsql stable set search_path='' as $$
declare v_names text[]; v_guests jsonb; v_expected integer; v_multi boolean; v_ready boolean;
begin
  v_names:=private.video_guest_names(p_project_id);
  select coalesce(jsonb_agg(to_jsonb(g) order by g.sort_order,g.id),'[]'::jsonb)
    into v_guests from public.ai_operations_video_project_guests g where g.project_id=p_project_id;
  select greatest(coalesce(cardinality(v_names),0),jsonb_array_length(v_guests),
    case when p.metadata->>'thumbnail_subject_mode'='guest_pair' then 2 else 0 end,
    case when p.metadata->>'guest_count' ~ '^\d{1,2}$' then (p.metadata->>'guest_count')::integer else 0 end)
    into v_expected from public.ai_operations_video_projects p where p.id=p_project_id;
  v_multi:=coalesce(v_expected>1,false);
  select not v_multi or (
    jsonb_array_length(v_guests)=v_expected
    and not exists(select 1 from public.ai_operations_video_project_guests g where g.project_id=p_project_id
      and (g.reference_status<>'approved' or
        coalesce(nullif(btrim(g.reference_image_file_id),''),nullif(btrim(g.reference_image_url),'')) is null))
    and (coalesce(cardinality(v_names),0)<2 or jsonb_array_length(v_guests)=cardinality(v_names))
    and not exists(select 1 from unnest(v_names) name where btrim(name)<>'' and not exists(
      select 1 from public.ai_operations_video_project_guests g where g.project_id=p_project_id and g.display_name=name))
    and (select count(distinct private.video_guest_reference_key(g.reference_image_file_id,g.reference_image_url))
      from public.ai_operations_video_project_guests g where g.project_id=p_project_id)=v_expected
  ) into v_ready;
  return jsonb_build_object('multi',v_multi,'ready',coalesce(v_ready,false),'guests',v_guests,
    'fingerprint',md5(v_guests::text));
end;
$$;
create function public.get_ai_operations_video_guest_references(p_project_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$ select private.video_guest_manifest(p_project_id); $$;
revoke all on function public.get_ai_operations_video_guest_references(uuid) from public,anon,authenticated;
grant execute on function public.get_ai_operations_video_guest_references(uuid) to service_role;

create function private.ensure_video_guest_extraction(p_project_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare p public.ai_operations_video_projects; v_names text[]; m jsonb;
begin
  select * into p from public.ai_operations_video_projects where id=p_project_id;
  if not found then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('bty-guests:'||p.id,0));
  v_names:=private.video_guest_names(p.id);
  if cardinality(v_names)>1 then
    insert into public.ai_operations_video_project_guests(project_id,display_name,sort_order)
      select p.id,name,ordinality::integer-1 from unnest(v_names) with ordinality n(name,ordinality)
      where btrim(name)<>'' on conflict(project_id,display_name) do nothing;
  end if;
  m:=private.video_guest_manifest(p.id);
  if not (m->>'multi')::boolean or (m->>'ready')::boolean then return; end if;
  insert into public.ai_operations_video_jobs(tenant_id,project_id,job_type,status,workflow_revision,
    input_fingerprint,idempotency_key,payload,worker_category,max_attempts)
  values(p.tenant_id,p.id,'extract_guest_reference_images','queued',p.workflow_revision,
    md5(p.source_file_id||p.source_revision||v_names::text),
    'bty:guest-references:'||p.id||':r'||p.workflow_revision||':s'||p.source_revision||':g'||md5(coalesce(v_names::text,'{}')),
    jsonb_build_object('source_revision',p.source_revision),'guest_reference',3)
  on conflict do nothing;
end;
$$;

-- Extend the CHECK without replacing the established list of job types.
do $$ declare d text; begin
  select pg_get_constraintdef(oid) into d from pg_constraint
    where conrelid='public.ai_operations_video_jobs'::regclass and conname='ai_operations_video_jobs_job_type_check';
  if d is null or position('generate_project_cover' in d)=0 then raise exception 'Unexpected job_type contract'; end if;
  execute 'alter table public.ai_operations_video_jobs drop constraint ai_operations_video_jobs_job_type_check';
  execute 'alter table public.ai_operations_video_jobs add constraint ai_operations_video_jobs_job_type_check '||
    replace(d,'''generate_project_cover''::text','''generate_project_cover''::text, ''extract_guest_reference_images''::text');
end $$;

create function public.request_ai_operations_video_guest_review(p_project_id uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.ai_operations_video_projects; v_actor uuid; v_task uuid; v_tag text;
begin
  select * into strict p from public.ai_operations_video_projects where id=p_project_id;
  perform pg_advisory_xact_lock(hashtextextended('bty-guest-review:'||p.id,0));
  v_tag:='bty-guest-reference:'||p.id;
  select id into v_task from public.crm_tasks where tenant_id=p.tenant_id and v_tag=any(tags)
    and status not in ('completed','canceled') order by created_at desc limit 1;
  if v_task is not null then return v_task; end if;
  select pr.id into v_actor from public.profiles pr join public.tenant_memberships tm on tm.profile_id=pr.id
    where tm.tenant_id=p.tenant_id and pr.email='info@valorwell.org' and pr.is_active is true limit 1;
  if v_actor is null then raise exception 'BTY CRM task assignee unavailable; review task not created'; end if;
  insert into public.crm_tasks(tenant_id,title,description,type,priority,status,owner_id,created_by_profile_id,due_at,tags)
  values(p.tenant_id,'BTY: verify separate guest identities — '||left(coalesce(p.organization_name,p.source_file_name),100),
    'Thumbnail generation is blocked. Project: '||p.id||E'\nGuests: '||coalesce(array_to_string(private.video_guest_names(p.id),', '),'unknown')||
    E'\nIssue: '||left(coalesce(p_reason,'Ambiguous guest reference extraction'),2000)||
    E'\nProvide or approve a separate authentic portrait for EACH guest, with verified name-to-face assignment. Do not approve a combined image. Retry extraction or approve individual guest rows, then regenerate full cover, Parts and Shorts.',
    'general','high','not_started',v_actor,v_actor,now()+interval '24 hours',
    array['bty-production-exception','bty-guest-identity-review',v_tag]) returning id into v_task;
  return v_task;
end;
$$;
revoke all on function public.request_ai_operations_video_guest_review(uuid,text) from public,anon,authenticated;
grant execute on function public.request_ai_operations_video_guest_review(uuid,text) to service_role;

-- Queue boundary covers generic enqueue, clip enqueue and direct inserts (including old jobs).
create function private.gate_video_guest_image_job() returns trigger
language plpgsql security definer set search_path='' as $$
declare m jsonb;
begin
  if new.job_type not in ('generate_thumbnail','generate_project_cover') or new.status not in ('queued','waiting','claimed','running') then return new; end if;
  perform private.ensure_video_guest_extraction(new.project_id);
  m:=private.video_guest_manifest(new.project_id);
  if (m->>'multi')::boolean then
    if not (m->>'ready')::boolean then
      new.status:='waiting'; new.claimed_by:=null; new.claimed_at:=null; new.lease_expires_at:=null;
    else
      if new.payload->>'guest_reference_fingerprint' is distinct from m->>'fingerprint' then
        new.payload:=new.payload - 'image_uploaded_file_id' - 'image_uploaded_file_url';
      end if;
      new.payload:=new.payload||jsonb_build_object('guest_reference_fingerprint',m->>'fingerprint','reference_mode','individual_guests');
    end if;
  end if;
  return new;
end;
$$;
create trigger gate_video_guest_image_job before insert or update of status,payload on public.ai_operations_video_jobs
for each row execute function private.gate_video_guest_image_job();

-- Claim must skip blocked jobs before LIMIT / SKIP LOCKED, so one episode cannot starve others.
do $$ declare d text; anchor text:='where j.job_type = any(p_job_types)'; begin
  select pg_get_functiondef('public.claim_next_ai_operations_video_job(text,text[],integer)'::regprocedure) into d;
  if position(anchor in d)=0 then raise exception 'claim gate anchor missing'; end if;
  execute replace(d,anchor,anchor||E'\n    and (j.job_type not in (''generate_thumbnail'',''generate_project_cover'') or (private.video_guest_manifest(j.project_id)->>''ready'')::boolean)');
end $$;

create function private.video_guest_updated() returns trigger
language plpgsql security definer set search_path='' as $$
begin new.updated_at:=now(); return new; end;
$$;
create trigger video_guest_updated before update on public.ai_operations_video_project_guests
for each row execute function private.video_guest_updated();

-- No client access to private helpers. Public worker RPCs are service-role only above.
revoke all on function private.video_guest_reference_key(text,text),private.video_guest_names(uuid),private.video_guest_manifest(uuid),
  private.ensure_video_guest_extraction(uuid),private.gate_video_guest_image_job(),private.video_guest_updated() from public,anon,authenticated;

-- Detect existing multi-guest projects; never promote their legacy combined reference.
do $$ declare p record; begin
  for p in select id from public.ai_operations_video_projects loop
    perform private.ensure_video_guest_extraction(p.id);
  end loop;
end $$;
-- Move already-queued image jobs behind the same gate; never alter running leases here.
update public.ai_operations_video_jobs set status=status where job_type in ('generate_thumbnail','generate_project_cover') and status in ('queued','waiting');

-- One transaction approves the full roster and replaces queued identity snapshots.
create function public.approve_ai_operations_video_guest_extraction(p_job_id bigint,p_references jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.ai_operations_video_jobs; p public.ai_operations_video_projects; r jsonb; v_count integer;
begin
  select * into strict j from public.ai_operations_video_jobs where id=p_job_id;
  select * into strict p from public.ai_operations_video_projects where id=j.project_id for update;
  select * into strict j from public.ai_operations_video_jobs where id=p_job_id for update;
  if j.job_type<>'extract_guest_reference_images' or j.status<>'running' or j.claimed_by<>'bty-guest-reference-worker'
    or j.lease_expires_at<=now() or j.workflow_revision<>p.workflow_revision or
    (j.payload->>'source_revision')::integer<>p.source_revision then raise exception 'Stale extraction lease or source revision'; end if;
  select count(*) into v_count from public.ai_operations_video_project_guests where project_id=p.id;
  if jsonb_typeof(p_references)<>'array' or jsonb_array_length(p_references)<>v_count or v_count<2 then raise exception 'Full guest roster required'; end if;
  if (select count(distinct x->>'guest_id') from jsonb_array_elements(p_references) x)<>v_count or
     (select count(distinct x->>'image_file_id') from jsonb_array_elements(p_references) x)<>v_count then raise exception 'Duplicate identity or image'; end if;
  for r in select value from jsonb_array_elements(p_references) loop
    if not exists(select 1 from public.ai_operations_video_project_guests where id=(r->>'guest_id')::uuid and project_id=p.id)
      or coalesce(r->>'provenance','')<>'unedited_frame_crop' or coalesce(r->>'identity_method','') not in ('unique_source_speaker','verified_anchor')
      or coalesce((r->>'quality_score')::numeric,0)<0.65 or coalesce((r->>'face_detection_confidence')::numeric,0)<0.8
      or coalesce((r->>'corroborating_frames')::integer,0)<3 or nullif(r->>'image_file_id','') is null then
      raise exception 'Guest identity/quality verification failed'; end if;
    update public.ai_operations_video_project_guests set
      reference_image_file_id=r->>'image_file_id',reference_image_url='https://drive.google.com/file/d/'||(r->>'image_file_id')||'/view',
      reference_status='approved',reference_source_type='source_video_frame',reference_quality_score=(r->>'quality_score')::numeric,
      face_detection_confidence=(r->>'face_detection_confidence')::numeric,reference_evidence=reference_evidence||r
      where id=(r->>'guest_id')::uuid and project_id=p.id;
  end loop;
  if not (private.video_guest_manifest(p.id)->>'ready')::boolean then raise exception 'References are still incomplete'; end if;
  update public.ai_operations_video_jobs set status='complete',completed_at=now(),lease_expires_at=null,
    result=jsonb_build_object('approved_guests',v_count),updated_at=now() where id=j.id;
  return jsonb_build_object('approved_guests',v_count);
end;
$$;
revoke all on function public.approve_ai_operations_video_guest_extraction(bigint,jsonb) from public,anon,authenticated;
grant execute on function public.approve_ai_operations_video_guest_extraction(bigint,jsonb) to service_role;

-- Reference edits invalidate all three asset scopes, including in-flight jobs and cached uploads.
create function private.invalidate_video_guest_images() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_project uuid; m jsonb;
begin
  if tg_op='UPDATE' and (to_jsonb(new)-'updated_at')=(to_jsonb(old)-'updated_at') then return null; end if;
  v_project:=case when tg_op='DELETE' then old.project_id else new.project_id end;
  m:=private.video_guest_manifest(v_project);
  if not (m->>'multi')::boolean then return null; end if;
  update public.ai_operations_video_jobs set status='cancelled',completed_at=now(),lease_expires_at=null,updated_at=now(),
    result=result||'{"cancel_reason":"guest_identity_changed"}'::jsonb
    where project_id=v_project and job_type in ('generate_thumbnail','generate_project_cover') and status in ('queued','waiting','claimed','running');
  update public.ai_operations_video_projects set cover_image_file_id=null,cover_image_url=null,cover_input_fingerprint=null,
    cover_metadata_revision=cover_metadata_revision+1,updated_at=now() where id=v_project;
  update public.ai_operations_video_clips set cover_image_file_id=null,cover_image_url=null,thumbnail_input_fingerprint=null,
    thumbnail_generation_revision=thumbnail_generation_revision+1,updated_at=now()
    where project_id=v_project and clip_type in ('part','short') and pipeline_status<>'superseded';
  update public.ai_operations_social_publications set thumbnail_file_id=null,thumbnail_url=null,updated_at=now()
    where project_id=v_project and status in ('draft','ready','approved');
  return null;
end;
$$;
create trigger invalidate_video_guest_images after update or delete on public.ai_operations_video_project_guests
for each row execute function private.invalidate_video_guest_images();
revoke all on function private.invalidate_video_guest_images() from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.enqueue_ai_operations_video_thumbnail_job(p_clip_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_clip record;
  v_settings record;
  v_fp text;
  v_job_id bigint;
  v_idempotency_key text;
  v_aspect_ratio text;
  v_prompt_key text;
  v_prompt_version integer;
  v_is_host_primary boolean;
  v_is_guest_pair boolean;
begin
  select
    c.*,
    p.tenant_id,
    p.guest_name,
    p.guest_image_url,
    p.metadata as episode_metadata,
    p.workflow_revision as project_workflow_revision,
    p.initial_information_complete
  into v_clip
  from public.ai_operations_video_clips c
  join public.ai_operations_video_projects p on p.id=c.project_id
  where c.id=p_clip_id
  limit 1;

  if not found
     or not coalesce(v_clip.initial_information_complete,false)
     or v_clip.clip_type not in ('short','part')
     or v_clip.pipeline_status='superseded'
     or v_clip.workflow_revision is distinct from v_clip.project_workflow_revision
     or coalesce(btrim(v_clip.hook_text),'')=''
     or v_clip.hook_input_fingerprint is null
     or coalesce(btrim(v_clip.primary_speaker),'')=''
     or coalesce(btrim(v_clip.person_positioning),'')=''
     or coalesce(btrim(v_clip.facial_expression),'')=''
     or coalesce(btrim(v_clip.gesture_action),'')=''
     or coalesce(btrim(v_clip.camera_framing),'')=''
     or coalesce(btrim(v_clip.pose_family),'')='' then
    return null;
  end if;

  select s.* into v_settings
  from public.ai_operations_video_settings s
  where s.tenant_id=v_clip.tenant_id
  limit 1;

  if not found
     or not coalesce(v_settings.workflow_enabled,false)
     or coalesce(btrim(v_settings.cover_image_folder_id),'')=''
     or coalesce(btrim(v_settings.image_model_id),'')='' then
    return null;
  end if;

  v_is_host_primary:=lower(btrim(v_clip.primary_speaker)) in ('luke','luke predmore');
  perform private.ensure_video_guest_extraction(v_clip.project_id);
  v_is_guest_pair:=(private.video_guest_manifest(v_clip.project_id)->>'multi')::boolean;
  if v_is_guest_pair and not (private.video_guest_manifest(v_clip.project_id)->>'ready')::boolean then return null; end if;

  -- Independent approved guest references override single-speaker artwork.
  -- Keep the clip's actual speech label unchanged.
  if v_is_guest_pair and
       (coalesce(btrim(v_clip.guest_name),'')='' or not (private.video_guest_manifest(v_clip.project_id)->>'ready')::boolean) then
    return null;
  end if;

  -- Shorts use the single appropriate speaker reference.
  -- Long-form Parts are guest-only thumbnails: no host reference is permitted.
  if v_is_guest_pair then
    null; -- Individual approved guest references are used for every clip.
  elsif v_clip.clip_type='part' then
    if coalesce(btrim(v_clip.guest_name),'')=''
       or coalesce(btrim(v_clip.guest_image_url),'')='' then
      return null;
    end if;

    if coalesce(lower(btrim(v_clip.guest_name)),'') <> lower(btrim(v_clip.primary_speaker)) then
      return null;
    end if;
  else
    if v_is_host_primary then
      if coalesce(btrim(v_settings.host_reference_file_id),'')='' then return null; end if;
    elsif coalesce(lower(btrim(v_clip.guest_name)),'') <> lower(btrim(v_clip.primary_speaker))
          or coalesce(btrim(v_clip.guest_image_url),'')='' then
      return null;
    end if;
  end if;

  v_aspect_ratio:=case when v_clip.clip_type='short' then '9:16' else '16:9' end;
  v_prompt_key:=case when v_clip.clip_type='short' then 'bty_image_short' else 'bty_image_part' end;
  v_prompt_version:=private.ai_operations_video_active_prompt_version(v_clip.tenant_id,v_prompt_key);
  if v_prompt_version is null then return null; end if;

  v_fp:=private.ai_operations_video_sha256_json(jsonb_build_object(
    'step',case when v_clip.clip_type='part' then 'generate_thumbnail_v6_guest_only_part' else 'generate_thumbnail_v5' end,
    'clip_id',v_clip.id,
    'clip_type',v_clip.clip_type,
    'workflow_revision',v_clip.workflow_revision,
    'hook_input_fingerprint',v_clip.hook_input_fingerprint,
    'thumbnail_metadata_input_fingerprint',v_clip.thumbnail_metadata_input_fingerprint,
    'hook_text',v_clip.hook_text,
    'primary_speaker',v_clip.primary_speaker,
    'person_positioning',v_clip.person_positioning,
    'facial_expression',v_clip.facial_expression,
    'gesture_action',v_clip.gesture_action,
    'camera_framing',v_clip.camera_framing,
    'pose_family',v_clip.pose_family,
    'core_visual',v_clip.core_visual,
    'hook_text_placement',v_clip.hook_text_placement,
    'generation_revision',v_clip.thumbnail_generation_revision,
    'aspect_ratio',v_aspect_ratio,
    'image_model',v_settings.image_model_id,
    'text_model',v_settings.text_model_id,
    'prompt_profile',v_prompt_key,
    'prompt_version',v_prompt_version,
    'ai_config_revision',v_settings.ai_config_revision,
    'host_reference_file_id',
      case when v_clip.clip_type='short' and v_is_host_primary and not v_is_guest_pair
        then v_settings.host_reference_file_id else null end,
    'guest_name',
      case when v_is_guest_pair or v_clip.clip_type='part' or not v_is_host_primary
        then v_clip.guest_name else null end,
    'guest_image_url',
      case when v_clip.clip_type='part' or not v_is_host_primary
        then v_clip.guest_image_url else null end
  ));

  -- Multi-guest fingerprints include every approved guest reference.
  -- Preserve byte-for-byte v5/v6 hashes for all other episodes.
  if v_is_guest_pair then
    v_fp:=private.ai_operations_video_sha256_json(jsonb_build_object(
      'base_fingerprint',v_fp,
      'thumbnail_subject_mode','guest_pair',
      'guest_reference_fingerprint',private.video_guest_manifest(v_clip.project_id)->>'fingerprint'
    ));
  end if;

  if v_clip.cover_image_file_id is not null
     and v_clip.thumbnail_input_fingerprint is not distinct from v_fp then
    return null;
  end if;

  if v_clip.cover_image_file_id is not null
     and v_clip.thumbnail_input_fingerprint is distinct from v_fp then
    update public.ai_operations_video_clips
    set cover_image_file_id=null,
        cover_image_url=null,
        thumbnail_input_fingerprint=null,
        pipeline_status='thumbnail_metadata_ready',
        updated_at=now()
    where id=v_clip.id;

    update public.ai_operations_social_publications
    set thumbnail_file_id=null,
        thumbnail_url=null,
        updated_at=now()
    where clip_id=v_clip.id
      and status in ('draft','ready','approved');
  end if;

  v_idempotency_key:='bty:generate_thumbnail:'||v_clip.project_id::text||':'||v_clip.id::text||
    ':r'||v_clip.workflow_revision::text||':'||v_fp;

  select id into v_job_id
  from public.ai_operations_video_jobs
  where tenant_id=v_clip.tenant_id and idempotency_key=v_idempotency_key
  limit 1;
  if v_job_id is not null then return v_job_id; end if;

  insert into public.ai_operations_video_jobs(
    tenant_id,project_id,clip_id,job_type,status,payload,idempotency_key,
    workflow_revision,input_fingerprint,available_at,max_attempts,worker_category
  )
  values(
    v_clip.tenant_id,v_clip.project_id,v_clip.id,'generate_thumbnail','queued',
    jsonb_build_object(
      'asset_scope','clip',
      'clip_type',v_clip.clip_type,
      'generation_revision',v_clip.thumbnail_generation_revision,
      'aspect_ratio',v_aspect_ratio,
      'metadata_hash',v_fp,
      'prompt_profile',v_prompt_key,
      'prompt_profile_version',v_prompt_version,
      'reference_mode',case when v_is_guest_pair then 'guest_pair' when v_clip.clip_type='part' then 'guest_only' else 'primary_speaker' end
    ),
    v_idempotency_key,v_clip.workflow_revision,v_fp,now(),
    coalesce(v_settings.default_max_attempts,3),'ai_image'
  )
  on conflict do nothing
  returning id into v_job_id;

  return v_job_id;
end;
$function$;


create function private.sync_video_project_guests() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' or old.guest_name is distinct from new.guest_name
    or old.source_revision is distinct from new.source_revision
    or old.workflow_revision is distinct from new.workflow_revision
    or old.metadata->'thumbnail_required_guests' is distinct from new.metadata->'thumbnail_required_guests'
    or old.metadata->'guest_count' is distinct from new.metadata->'guest_count'
    or old.metadata->'thumbnail_subject_mode' is distinct from new.metadata->'thumbnail_subject_mode' then
    if tg_op='UPDATE' and (old.source_revision is distinct from new.source_revision
      or old.guest_name is distinct from new.guest_name
      or old.metadata->'thumbnail_required_guests' is distinct from new.metadata->'thumbnail_required_guests') then
      update public.ai_operations_video_project_guests set reference_status='pending' where project_id=new.id;
    end if;
    perform private.ensure_video_guest_extraction(new.id);
  end if;
  return null;
end;
$$;
create trigger sync_video_project_guests after insert or update of guest_name,metadata,source_revision,workflow_revision on public.ai_operations_video_projects
for each row execute function private.sync_video_project_guests();
revoke all on function private.sync_video_project_guests() from public,anon,authenticated;

-- Serialize applying a multi-guest image against approving/editing its references.
create function public.apply_ai_operations_video_guest_thumbnail(p_job_id bigint,p_file_id text,p_file_url text) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.ai_operations_video_jobs; p public.ai_operations_video_projects; m jsonb;
begin
  select * into strict j from public.ai_operations_video_jobs where id=p_job_id;
  select * into strict p from public.ai_operations_video_projects where id=j.project_id for update;
  -- Re-read after acquiring the project lock; reference invalidation can cancel a running job.
  select * into strict j from public.ai_operations_video_jobs where id=p_job_id for update;
  m:=private.video_guest_manifest(p.id);
  if not (m->>'multi')::boolean or not (m->>'ready')::boolean or
    j.status<>'running' or j.claimed_by<>'bty-image-worker' or j.lease_expires_at<=now() or
    j.workflow_revision<>p.workflow_revision or
    j.payload->>'guest_reference_fingerprint' is distinct from m->>'fingerprint' then return false; end if;
  if nullif(btrim(p_file_id),'') is null or p_file_url is distinct from 'https://drive.google.com/file/d/'||p_file_id||'/view' then
    raise exception 'Invalid thumbnail artifact'; end if;
  if j.job_type='generate_project_cover' then
    if p.cover_metadata_revision is distinct from (j.payload->>'generation_revision')::integer then return false; end if;
    update public.ai_operations_video_projects set cover_image_file_id=p_file_id,cover_image_url=p_file_url,
      cover_input_fingerprint=j.input_fingerprint,last_progress_at=now(),updated_at=now() where id=p.id;
    update public.ai_operations_social_publications set thumbnail_file_id=p_file_id,thumbnail_url=p_file_url,updated_at=now()
      where project_id=p.id and source_type='project' and status in ('draft','ready','approved');
  elsif j.job_type='generate_thumbnail' then
    update public.ai_operations_video_clips set cover_image_file_id=p_file_id,cover_image_url=p_file_url,
      thumbnail_input_fingerprint=j.input_fingerprint,pipeline_status='thumbnail_ready',last_progress_at=now(),updated_at=now()
      where id=j.clip_id and project_id=p.id and workflow_revision=j.workflow_revision
        and thumbnail_generation_revision=(j.payload->>'generation_revision')::integer;
    if not found then return false; end if;
    update public.ai_operations_social_publications set thumbnail_file_id=p_file_id,thumbnail_url=p_file_url,updated_at=now()
      where clip_id=j.clip_id and status in ('draft','ready','approved');
  else return false;
  end if;
  return true;
end;
$$;
revoke all on function public.apply_ai_operations_video_guest_thumbnail(bigint,text,text) from public,anon,authenticated;
grant execute on function public.apply_ai_operations_video_guest_thumbnail(bigint,text,text) to service_role;
