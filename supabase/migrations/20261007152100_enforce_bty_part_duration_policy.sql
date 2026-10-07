begin;

update public.ai_operations_video_settings
set default_min_clip_seconds=210,
    default_target_max_clip_seconds=600,
    updated_at=now()
where tenant_id='00000000-0000-0000-0000-000000000001';

update public.ai_operations_video_prompt_profiles
set is_active=false,updated_at=now()
where tenant_id='00000000-0000-0000-0000-000000000001'
  and profile_key='bty_segment_parts'
  and is_active=true;

insert into public.ai_operations_video_prompt_profiles(
  tenant_id,profile_key,version,is_active,system_prompt,instruction_prompt,config,created_at,updated_at
)
select
  tenant_id,
  profile_key,
  5,
  true,
  system_prompt || E'\n\nLong-form eligibility is a hard requirement: every Part must be at least 3.5 minutes. Prefer to keep Parts at or under 10 minutes whenever the conversation offers a clean natural break, but never force an awkward cut merely to satisfy the preferred maximum.',
  replace(
    instruction_prompt,
    'Roughly 5-15 minutes per Part is a useful guide, not a hard rule. Editorial coherence comes first.',
    'HARD MINIMUM: every Part must be at least 210 seconds (3.5 minutes). PREFERRED MAXIMUM: keep Parts at or under 600 seconds (10 minutes) whenever a natural breakpoint exists. 600 seconds is not a hard ceiling; only exceed it when there is genuinely no clean transition before 10 minutes.'
  )
  || E'\n\nMANDATORY SEQUENTIAL BOUNDARY SEARCH:\n1. Ignore every possible cut before 210 seconds.\n2. Once 210 seconds has elapsed, actively scan every plausible topic/story resolution through 600 seconds.\n3. If ANY genuine natural breakpoint exists in that 210-600 second window, choose the strongest one.\n4. Only cross 600 seconds when there is genuinely no defensible natural transition anywhere in that window.\n5. Repeat from the next segment.\n6. Before returning, audit every Part over 600 seconds and split it if it contains more than one distinct story, topic, argument, example, organization, institutional issue, or conversational arc.\n\nA reason that lists several distinct subjects joined by commas or "and" is strong evidence that the Part is too broad and should be split. Never create a final orphan Part under 210 seconds; merge the tail or move the prior boundary earlier.',
  (config
    || jsonb_build_object(
      'target_min_seconds',210,
      'target_max_seconds',600,
      'hard_min_seconds',210,
      'preferred_max_seconds',600,
      'preferred_min_parts',8,
      'preferred_max_parts',10,
      'reasoning_effort','high',
      'natural_breaks_required',true,
      'boundary_search_mode','sequential_210_to_600',
      'oversize_self_audit',true
    )
  ),
  now(),now()
from public.ai_operations_video_prompt_profiles
where tenant_id='00000000-0000-0000-0000-000000000001'
  and profile_key='bty_segment_parts'
  and version=3
on conflict (tenant_id,profile_key,version) do nothing;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid)
  into v_def
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname='orchestrate_ai_operations_video_workflow'
  limit 1;

  v_def:=replace(v_def, '''segment_parts_v3''', '''segment_parts_v4_min210_pref600''');
  v_def:=replace(v_def, '''3.4.0''', '''3.5.0''');
  execute v_def;
end $$;

commit;
