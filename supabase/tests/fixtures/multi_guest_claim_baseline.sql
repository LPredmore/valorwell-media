CREATE OR REPLACE FUNCTION public.claim_next_ai_operations_video_job(p_worker_id text, p_job_types text[], p_lease_seconds integer DEFAULT 300)
 RETURNS SETOF ai_operations_video_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_job public.ai_operations_video_jobs;
  v_was_status text;
begin
  if coalesce(btrim(p_worker_id),'') = '' then
    raise exception 'p_worker_id is required';
  end if;
  if p_job_types is null or cardinality(p_job_types)=0 then
    raise exception 'p_job_types is required';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 60 then
    raise exception 'p_lease_seconds must be at least 60';
  end if;

  update private.ai_operations_video_circuit_breakers b
  set status='half_open',
      probe_job_id=null,
      updated_at=now()
  where b.status='open'
    and b.retry_after is not null
    and b.retry_after <= now()
    and exists (
      select 1
      from public.ai_operations_video_jobs j
      where j.tenant_id=b.tenant_id
        and j.job_type=any(p_job_types)
        and coalesce(j.worker_category,j.job_type)=b.worker_category
    );

  select j.*
  into v_job
  from public.ai_operations_video_jobs j
  where j.job_type = any(p_job_types)
    and (
      (j.status in ('queued','waiting') and coalesce(j.available_at, j.created_at) <= now())
      or (
        j.status in ('claimed','running')
        and coalesce(j.lease_expires_at, j.claimed_at, j.updated_at) < now()
      )
    )
    and not exists (
      select 1
      from private.ai_operations_video_circuit_breakers b
      where b.tenant_id=j.tenant_id
        and b.worker_category=coalesce(j.worker_category,j.job_type)
        and (
          b.status='open'
          or (b.status='half_open' and b.probe_job_id is not null)
        )
    )
  order by
    case j.status when 'queued' then 0 when 'waiting' then 1 else 2 end,
    coalesce(j.available_at,j.created_at),
    j.created_at,
    j.id
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  v_was_status := v_job.status;

  update private.ai_operations_video_circuit_breakers b
  set probe_job_id=v_job.id,
      updated_at=now()
  where b.tenant_id=v_job.tenant_id
    and b.worker_category=coalesce(v_job.worker_category,v_job.job_type)
    and b.status='half_open'
    and b.probe_job_id is null;

  return query
  update public.ai_operations_video_jobs j
  set status='running',
      attempts = case when v_was_status='queued' then j.attempts + 1 else j.attempts end,
      claimed_by=p_worker_id,
      claimed_at=now(),
      started_at=coalesce(j.started_at,now()),
      lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
      error_message=null,
      updated_at=now(),
      payload = case
        when v_was_status in ('claimed','running') then
          j.payload || jsonb_build_object(
            'stale_recovery_count', coalesce((j.payload->>'stale_recovery_count')::integer,0)+1,
            'stale_recovered_at', now()
          )
        else j.payload
      end
  where j.id=v_job.id
  returning j.*;

  perform public.heartbeat_ai_operations_video_worker(
    p_worker_id,
    v_job.tenant_id,
    'working',
    v_job.id,
    v_job.project_id,
    null,
    null,
    jsonb_build_object('job_type',v_job.job_type,'worker_category',coalesce(v_job.worker_category,v_job.job_type))
  );
end;
$function$
