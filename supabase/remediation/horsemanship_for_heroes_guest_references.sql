-- Run on Billing Hub ahqauomkgflopxgnlndd AFTER the multi-guest identity migration.
-- Reversible asset-pointer backup; no Drive deletion, no publication action.
begin;
select id from public.ai_operations_video_projects
where id='fc80db51-ef89-47ab-9715-1d17ca9bd41a' for update;
update public.ai_operations_video_projects p
set metadata=p.metadata || jsonb_build_object('thumbnail_subject_mode','guest_pair',
  'guest_count',2,'guest_reference_mode','individual_guests',
  'thumbnail_required_guests',jsonb_build_array('Scott Hooper','Karolyn Hooper'),
  'multi_guest_thumbnail_remediation',coalesce(p.metadata->'multi_guest_thumbnail_remediation',
    jsonb_build_object('started_at',now(),'prior_cover_file_id',p.cover_image_file_id,'prior_cover_url',p.cover_image_url,
      'prior_clips',(select coalesce(jsonb_agg(jsonb_build_object('clip_id',c.id,'file_id',c.cover_image_file_id,'url',c.cover_image_url)),'[]')
        from public.ai_operations_video_clips c where c.project_id=p.id and c.clip_type in ('part','short')),
      'prior_publications',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'file_id',s.thumbnail_file_id,'url',s.thumbnail_url)),'[]')
        from public.ai_operations_social_publications s where s.project_id=p.id))))
where p.id='fc80db51-ef89-47ab-9715-1d17ca9bd41a';
select private.ensure_video_guest_extraction('fc80db51-ef89-47ab-9715-1d17ca9bd41a');
-- Clearing stale pointers also increments revisions, so old jobs cannot win a race.
update public.ai_operations_video_jobs set status='cancelled',completed_at=now(),lease_expires_at=null,
  result=result||'{"cancel_reason":"multi_guest_identity_remediation"}'::jsonb,updated_at=now()
where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a' and job_type in ('generate_thumbnail','generate_project_cover')
  and status in ('queued','waiting','claimed','running');
update public.ai_operations_video_projects set cover_image_file_id=null,cover_image_url=null,cover_input_fingerprint=null,
  cover_metadata_revision=cover_metadata_revision+1,updated_at=now()
where id='fc80db51-ef89-47ab-9715-1d17ca9bd41a';
update public.ai_operations_video_clips set cover_image_file_id=null,cover_image_url=null,thumbnail_input_fingerprint=null,
  thumbnail_generation_revision=thumbnail_generation_revision+1,updated_at=now()
where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a' and clip_type in ('part','short') and pipeline_status<>'superseded';
update public.ai_operations_social_publications set thumbnail_file_id=null,thumbnail_url=null,updated_at=now()
where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a' and status in ('draft','ready','approved');
commit;

select public.get_ai_operations_video_guest_references('fc80db51-ef89-47ab-9715-1d17ca9bd41a');
select id,display_name,reference_status,reference_image_file_id,reference_quality_score,face_detection_confidence,reference_evidence
from public.ai_operations_video_project_guests where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a' order by sort_order,id;
select id,job_type,status,result,error_message from public.ai_operations_video_jobs
where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a'
  and job_type in ('extract_guest_reference_images','generate_project_cover','generate_thumbnail') order by id desc;
select id,clip_type,pipeline_status,cover_image_file_id,cover_image_url
from public.ai_operations_video_clips where project_id='fc80db51-ef89-47ab-9715-1d17ca9bd41a'
  and clip_type in ('part','short') and pipeline_status<>'superseded';
