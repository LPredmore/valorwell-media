import type { SupabaseClient } from "npm:@supabase/supabase-js@2.93.1";
const WORKER="bty-guest-reference-worker";
const TENANT="00000000-0000-0000-0000-000000000001";
type DriveGet=(token:string,id:string,fields?:string)=>Promise<any>;
async function must<T extends {error:unknown}>(result:PromiseLike<T>):Promise<T>{
  const r=await result;if(r.error)throw new Error('Guest reference database operation failed');return r;
}
export async function guestReferenceAction(db:SupabaseClient,token:string,action:string,body:any,driveGet:DriveGet,folder:()=>Promise<string>){
  if(action==='guest_refs_claim'){
    const {data}=await must(db.rpc('claim_next_ai_operations_video_job',{
      p_worker_id:WORKER,p_job_types:['extract_guest_reference_images'],p_lease_seconds:3600,
    }));
    const job=Array.isArray(data)?data[0]:null;
    if(!job)return {ok:true,job:null};
    try{
      const {data:project}=await must(db.from('ai_operations_video_projects').select('workflow_revision,source_revision').eq('id',job.project_id).single());
      if(!project)throw new Error("Project missing");
      if(project.workflow_revision!==job.workflow_revision || project.source_revision!==job.payload.source_revision){
        await must(db.rpc('complete_ai_operations_video_job',{p_job_id:job.id,p_worker_id:WORKER,p_result:{skipped:'stale_source_revision'}}));
        return {ok:true,job:null,status:'stale'};
      }
      const {data:episode}=await must(db.from('bty_episode_processing').select('source_files').eq('video_project_id',job.project_id).eq('tenant_id',TENANT).single());
      const {data:guests}=await must(db.from('ai_operations_video_project_guests').select('*').eq('project_id',job.project_id).order('sort_order').order('id'));
      if(!guests || guests.length<2)throw new Error('Multiple guest names could not be resolved. Verify the project guest roster.');
      if(!episode || !Array.isArray(episode.source_files))throw new Error("Source manifest missing");
      const ids=[...new Set((episode.source_files as any[]).map(f=>String(f.id)))];
      if(!ids.length || ids.length>8)throw new Error('Source video manifest is unavailable or ambiguous');
      const sources=await Promise.all(ids.map(async id=>{
        const f=await driveGet(token,id);
        if(f.mimeType!=='video/mp4'||Number(f.size)<100000)throw new Error('Registered source is not a valid video');
        const match=String(f.name).match(/^(.+)-([^-]+)-webcam-\d+h_\d+m_\d+s_\d+ms-StreamYard\.mp4$/i);
        return {id,name:f.name,size:Number(f.size),speaker:match?match[2].replaceAll('_',' '):''};
      }));
      return {ok:true,job,guests,sources,output_folder_id:await folder(),google_access_token:token};
    }catch(error){
      const {data:task}=await must(db.rpc('request_ai_operations_video_guest_review',{
        p_project_id:job.project_id,p_reason:error instanceof Error?error.message:'Source manifest lookup failed',
      }));
      await must(db.rpc('complete_ai_operations_video_job',{p_job_id:job.id,p_worker_id:WORKER,p_result:{manual_review:true,task_id:task}}));
      return {ok:true,job:null,status:'manual_review',task_id:task};
    }
  }
  const {data:job}=await must(db.from('ai_operations_video_jobs').select('*').eq('id',Number(body.job_id))
    .eq('tenant_id',TENANT).eq('job_type','extract_guest_reference_images').eq('claimed_by',WORKER).eq('status','running').single());
  if(!job || Date.parse(job.lease_expires_at)<=Date.now())throw new Error('Extraction lease is no longer current');
  if(action==='guest_refs_token')return {ok:true,google_access_token:token};
  if(action==='guest_refs_review'){
    const {data:task}=await must(db.rpc('request_ai_operations_video_guest_review',{
      p_project_id:job.project_id,p_reason:String(body.reason??'Guest extraction confidence too low'),
    }));
    await must(db.rpc('complete_ai_operations_video_job',{p_job_id:job.id,p_worker_id:WORKER,p_result:{manual_review:true,task_id:task}}));
    return {ok:true,task_id:task};
  }
  if(action!=='guest_refs_complete')throw new Error('Unsupported guest reference action');
  const {data:guests}=await must(db.from('ai_operations_video_project_guests').select('id').eq('project_id',job.project_id));
  const refs=body.references;
  if(!Array.isArray(refs)||refs.length!==guests?.length||refs.length<2 ||
    new Set(refs.map(r=>r.guest_id)).size!==refs.length || new Set(refs.map(r=>r.image_file_id)).size!==refs.length)
    throw new Error('A unique reference is required for every guest');
  const target=await folder();
  const {data:episode}=await must(db.from('bty_episode_processing').select('source_files').eq('video_project_id',job.project_id).single());
  if(!episode || !Array.isArray(episode.source_files))throw new Error("Source manifest missing");
  for(const ref of refs){
    if(!guests?.some(g=>g.id===ref.guest_id)||!episode.source_files.some((s:any)=>s.id===ref.source_file_id))throw new Error('Unknown guest or source');
    const file=await driveGet(token,String(ref.image_file_id));
    if(file.mimeType!=='image/jpeg'||!file.parents?.includes(target)||Number(file.size)<20000||Number(file.size)>8*1024*1024||
      file.name!==`BTY-guest-${job.id}-${ref.guest_id}.jpg`)throw new Error('Guest crop failed Drive provenance verification');
  }
  const {data}=await must(db.rpc('approve_ai_operations_video_guest_extraction',{p_job_id:job.id,p_references:refs}));
  return {ok:true,...data};
}
