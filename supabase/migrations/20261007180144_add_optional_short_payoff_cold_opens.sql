-- Optional, quality-gated payoff cold opens for BTY Shorts.
-- Production migration version: 20261007180144.
-- Existing rendered Shorts are grandfathered; new/resegmented Shorts are evaluated.

alter table public.ai_operations_video_clips
  add column if not exists cold_open_enabled boolean not null default false,
  add column if not exists cold_open_start_seconds numeric null,
  add column if not exists cold_open_end_seconds numeric null,
  add column if not exists cold_open_text text null,
  add column if not exists cold_open_score numeric null,
  add column if not exists cold_open_reason text null,
  add column if not exists cold_open_prompt_version integer null,
  add column if not exists cold_open_selected_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname='ai_operations_video_clips_cold_open_valid'
      and conrelid='public.ai_operations_video_clips'::regclass
  ) then
    alter table public.ai_operations_video_clips
      add constraint ai_operations_video_clips_cold_open_valid
      check (
        not cold_open_enabled
        or (
          clip_type='short'
          and cold_open_start_seconds is not null
          and cold_open_end_seconds is not null
          and cold_open_start_seconds >= start_seconds
          and cold_open_end_seconds <= end_seconds
          and cold_open_end_seconds > cold_open_start_seconds
          and cold_open_end_seconds-cold_open_start_seconds between 2 and 6
          and (end_seconds-start_seconds)+(cold_open_end_seconds-cold_open_start_seconds) < 180
        )
      );
  end if;
end $$;

update public.ai_operations_video_prompt_profiles
set is_active=false,updated_at=now()
where tenant_id='00000000-0000-0000-0000-000000000001'
  and profile_key='bty_short_cold_open'
  and is_active=true;

insert into public.ai_operations_video_prompt_profiles(
  tenant_id,profile_key,version,is_active,system_prompt,instruction_prompt,config,created_at,updated_at
) values(
  '00000000-0000-0000-0000-000000000001',
  'bty_short_cold_open',
  1,
  true,
  'You are the payoff cold-open selector for Beyond The Yellow Shorts. For each already-selected Short, decide whether a brief flash-forward excerpt from toward the end would make the first seconds materially stronger than the Short''s natural opening. Be selective. A cold open is optional and should be rejected whenever it would confuse the viewer, misrepresent the topic, weaken a stronger natural opening, feel generic, give away the entire payoff, or create annoying repetition.

You receive exact word-level source timestamps. Never invent words or timestamps. If you enable a cold open, its start_seconds must equal the START timestamp of a supplied word and its end_seconds must equal the END timestamp of a supplied word.',
  'Evaluate every supplied Short independently.

DECISION STANDARD:
- Enable a cold open ONLY when the late excerpt is clearly more stop-scroll, emotionally charged, surprising, contradictory, specific, or curiosity-producing than the natural opening.
- It must make sense to a stranger before any setup.
- It should create an unanswered question or emotional tension, not fully resolve the story.
- It must preserve the speaker''s actual meaning.
- If the natural opening is already stronger, return enabled=false.
- If the best late line is generic, context-dependent, misleading, soft, merely reflective, or mostly pronouns without clear referents, return enabled=false.
- Prefer no cold open over a mediocre cold open.

TIMING:
- Cold-open duration must be 2.0 to 6.0 seconds.
- Choose only from the supplied TAIL SEARCH WORDS for that Short.
- start_seconds must exactly match a supplied word START.
- end_seconds must exactly match a supplied word END.
- Do not estimate or round timestamps.
- Do not splice separate moments together; choose one contiguous excerpt.

SCORING:
- Score 0-100 for expected improvement over the natural opening, not for the quote in isolation.
- enabled=true should normally require a score of at least 82.
- 90+ means the cold open is unusually strong and clearly superior.
- Return enabled=false when uncertain.

For disabled Shorts, set start_seconds=0, end_seconds=0, text="" and still provide a concise reason.',
  '{"reasoning_effort":"medium","openrouter_max_tokens":9000,"min_clip_seconds":20,"min_duration_seconds":2,"max_duration_seconds":6,"minimum_score":82,"opening_compare_seconds":6,"tail_fraction":0.35,"tail_min_seconds":12,"tail_max_seconds":35,"final_duration_hard_max_seconds":179.999,"output_mode":"optional_payoff_cold_open_word_timestamps_v1","fail_open_without_cold_open":true}'::jsonb,
  now(),
  now()
)
on conflict (tenant_id,profile_key,version) do update
set is_active=true,
    system_prompt=excluded.system_prompt,
    instruction_prompt=excluded.instruction_prompt,
    config=excluded.config,
    updated_at=now();

-- Patch the existing render enqueue function. The prior migration establishes
-- the canonical function body; fail loudly if its anchors are unexpectedly absent.
do $cold_open_render_enqueue$
declare
  v text;
begin
  select pg_get_functiondef(p.oid) into v
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='enqueue_ai_operations_video_render_job_for_clip_row'
  limit 1;

  if position('if coalesce(v_project.metadata->>''workflow_mode'','''')=''parts_only'' then return null; end if;' in v)=0 then
    raise exception 'render enqueue parts_only anchor missing';
  end if;
  v:=replace(
    v,
    'if coalesce(v_project.metadata->>''workflow_mode'','''')=''parts_only'' then return null; end if;',
    'if coalesce(v_project.metadata->>''workflow_mode'','''')=''parts_only''
     and not (
       coalesce(v_project.metadata->''full_workflow_clip_ids'',''[]''::jsonb) ? v_clip.id::text
     ) then
    return null;
  end if;'
  );

  if position('''clip_type'',v_clip.clip_type,
    ''render_profile_version'',3' in v)=0 then
    raise exception 'render fingerprint anchor missing';
  end if;
  v:=replace(
    v,
    '''clip_type'',v_clip.clip_type,
    ''render_profile_version'',3',
    '''clip_type'',v_clip.clip_type,
    ''cold_open_enabled'',case when v_clip.clip_type=''short'' then coalesce(v_clip.cold_open_enabled,false) else false end,
    ''cold_open_start_seconds'',case when v_clip.clip_type=''short'' and coalesce(v_clip.cold_open_enabled,false) then v_clip.cold_open_start_seconds else null end,
    ''cold_open_end_seconds'',case when v_clip.clip_type=''short'' and coalesce(v_clip.cold_open_enabled,false) then v_clip.cold_open_end_seconds else null end,
    ''render_profile_version'',4'
  );

  if position('jsonb_build_object(''render_profile_version'',3),v_key,' in v)=0 then
    raise exception 'render payload anchor missing';
  end if;
  v:=replace(
    v,
    'jsonb_build_object(''render_profile_version'',3),v_key,',
    'jsonb_build_object(
      ''render_profile_version'',4,
      ''cold_open_enabled'',case when v_clip.clip_type=''short'' then coalesce(v_clip.cold_open_enabled,false) else false end,
      ''cold_open_start_seconds'',case when v_clip.clip_type=''short'' and coalesce(v_clip.cold_open_enabled,false) then v_clip.cold_open_start_seconds else null end,
      ''cold_open_end_seconds'',case when v_clip.clip_type=''short'' and coalesce(v_clip.cold_open_enabled,false) then v_clip.cold_open_end_seconds else null end,
      ''cold_open_text'',case when v_clip.clip_type=''short'' and coalesce(v_clip.cold_open_enabled,false) then v_clip.cold_open_text else null end,
      ''cold_open_score'',case when v_clip.clip_type=''short'' and coalesce(v_clip.cold_open_enabled,false) then v_clip.cold_open_score else null end
    ),v_key,'
  );

  execute v;
end
$cold_open_render_enqueue$;

do $cold_open_render_claim$
declare
  v text;
begin
  select pg_get_functiondef(p.oid) into v
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='claim_next_video_render_job'
  limit 1;

  if position('and coalesce(p.metadata->>''workflow_mode'','''')<>''parts_only''
    and j.workflow_revision=p.workflow_revision' in v)=0 then
    raise exception 'render claim parts_only anchor missing';
  end if;

  v:=replace(
    v,
    'and coalesce(p.metadata->>''workflow_mode'','''')<>''parts_only''
    and j.workflow_revision=p.workflow_revision',
    'and (
      coalesce(p.metadata->>''workflow_mode'','''')<>''parts_only''
      or (
        j.clip_id is not null
        and coalesce(p.metadata->''full_workflow_clip_ids'',''[]''::jsonb) ? j.clip_id::text
      )
    )
    and j.workflow_revision=p.workflow_revision'
  );
  v:=replace(v,'''2.0.0''','''2.1.0''');
  execute v;
end
$cold_open_render_claim$;

do $cold_open_orchestrator$
declare
  v text;
begin
  select pg_get_functiondef(p.oid) into v
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='orchestrate_ai_operations_video_workflow'
  limit 1;

  if position('v_p_shorts integer;' in v)=0 then
    raise exception 'orchestrator variable anchor missing';
  end if;
  v:=replace(v,'v_p_shorts integer;','v_p_shorts integer;
  v_p_cold_open integer;');

  if position('v_p_shorts:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,''bty_segment_shorts'');' in v)=0 then
    raise exception 'orchestrator prompt anchor missing';
  end if;
  v:=replace(
    v,
    'v_p_shorts:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,''bty_segment_shorts'');',
    'v_p_shorts:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,''bty_segment_shorts'');
  v_p_cold_open:=private.ai_operations_video_active_prompt_version(v_settings.tenant_id,''bty_short_cold_open'');'
  );

  v:=replace(
    v,
    'v_p_full is null or v_p_parts is null or v_p_shorts is null or v_p_title is null',
    'v_p_full is null or v_p_parts is null or v_p_shorts is null or v_p_cold_open is null or v_p_title is null'
  );

  if position('''step'',''segment_shorts_v3'',' in v)=0 then
    raise exception 'shorts fingerprint anchor missing';
  end if;
  v:=replace(v,'''step'',''segment_shorts_v3'',','''step'',''segment_shorts_v4_optional_cold_open'',');
  v:=replace(
    v,
    '''prompt_version'',v_p_shorts,
        ''source_revision'',v_project.source_revision',
    '''prompt_version'',v_p_shorts,
        ''cold_open_prompt'',''bty_short_cold_open'',
        ''cold_open_prompt_version'',v_p_cold_open,
        ''cold_open_behavior_revision'',1,
        ''source_revision'',v_project.source_revision'
  );
  v:=replace(v,'''3.8.0''','''3.9.0''');
  execute v;
end
$cold_open_orchestrator$;

-- Preserve the current Short library. Future segmentation inputs use the new
-- fingerprint and cold-open selector; existing rendered Shorts stay untouched.
update public.ai_operations_video_projects p
set shorts_input_fingerprint=private.ai_operations_video_sha256_json(jsonb_build_object(
      'step','segment_shorts_v4_optional_cold_open',
      'transcript',p.transcript_text,
      'duration_seconds',p.duration_seconds,
      'short_threshold_seconds',s.short_clip_threshold_seconds,
      'text_model',s.text_model_id,
      'ai_config_revision',s.ai_config_revision,
      'prompt_profile','bty_segment_shorts',
      'prompt_version',private.ai_operations_video_active_prompt_version(p.tenant_id,'bty_segment_shorts'),
      'cold_open_prompt','bty_short_cold_open',
      'cold_open_prompt_version',private.ai_operations_video_active_prompt_version(p.tenant_id,'bty_short_cold_open'),
      'cold_open_behavior_revision',1,
      'source_revision',p.source_revision
    )),
    updated_at=now()
from public.ai_operations_video_settings s
where s.tenant_id=p.tenant_id
  and p.shorts_input_fingerprint is not null
  and p.transcript_text is not null;
