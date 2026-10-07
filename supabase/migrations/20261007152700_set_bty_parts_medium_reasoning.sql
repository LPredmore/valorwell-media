begin;

update public.ai_operations_video_prompt_profiles
set is_active=false,updated_at=now()
where tenant_id='00000000-0000-0000-0000-000000000001'
  and profile_key='bty_segment_parts'
  and is_active=true;

insert into public.ai_operations_video_prompt_profiles(
  tenant_id,profile_key,version,is_active,system_prompt,instruction_prompt,config,created_at,updated_at
)
select
  tenant_id,profile_key,6,true,system_prompt,instruction_prompt,
  jsonb_set(config,'{reasoning_effort}',to_jsonb('medium'::text),true),
  now(),now()
from public.ai_operations_video_prompt_profiles
where tenant_id='00000000-0000-0000-0000-000000000001'
  and profile_key='bty_segment_parts'
  and version=5
on conflict (tenant_id,profile_key,version) do nothing;

commit;
