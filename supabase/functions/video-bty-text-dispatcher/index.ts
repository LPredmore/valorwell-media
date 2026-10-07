
import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const JOB_TYPES = [
  "generate_full_metadata",
  "segment_parts",
  "segment_shorts",
  "generate_title",
  "generate_clip_copy",
  "generate_hook",
  "generate_thumbnail_visual_metadata",
  "generate_thumbnail_metadata",
  "generate_project_cover_metadata",
];

type Job = {
  id:number; tenant_id:string; project_id:string; clip_id:string|null; job_type:string;
  attempts:number; payload:Record<string,unknown>|null; input_fingerprint:string|null;
};
type Segment = { start_seconds:number; end_seconds:number; text:string; segment_index:number };
type Project = {
  id:string; tenant_id:string; source_file_id:string; source_file_name:string;
  duration_seconds:number|null; transcript_text:string|null; guest_name:string|null;
  organization_name:string|null; guest_image_url:string|null; workflow_revision:number; source_revision:number;
};
class JobError extends Error {
  code:string; errorClass:"retryable"|"permanent"|"systemic";
  constructor(code:string,message:string,errorClass:"retryable"|"permanent"|"systemic"){
    super(message); this.code=code; this.errorClass=errorClass;
  }
}
function db(){
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {auth:{persistSession:false,autoRefreshToken:false}}
  );
}
function json(body:unknown,status=200){
  return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});
}
function authorized(req:Request){
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const auth=req.headers.get("authorization") ?? "";
  if(serviceKey && auth===`Bearer ${serviceKey}`) return true;
  const cron=Deno.env.get("CRON_SECRET") ?? "";
  return Boolean(cron) && (req.headers.get("x-cron-secret") ?? "")===cron;
}
function safeMessage(e:unknown){return e instanceof Error ? e.message : String(e);}
function formatTime(seconds:number){
  const s=Math.max(0,Math.floor(seconds)); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const r=s%60;
  return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(r).padStart(2,"0")}` : `${m}:${String(r).padStart(2,"0")}`;
}
async function getProject(admin:any,id:string):Promise<Project>{
  const {data,error}=await admin.from("ai_operations_video_projects")
    .select("id,tenant_id,source_file_id,source_file_name,duration_seconds,transcript_text,guest_name,organization_name,guest_image_url,workflow_revision,source_revision")
    .eq("id",id).maybeSingle();
  if(error) throw new JobError("project_lookup_failed",error.message,"retryable");
  if(!data) throw new JobError("project_missing","Video project no longer exists.","permanent");
  return data as Project;
}
async function getClip(admin:any,id:string){
  const {data,error}=await admin.from("ai_operations_video_clips").select("*").eq("id",id).maybeSingle();
  if(error) throw new JobError("clip_lookup_failed",error.message,"retryable");
  if(!data) throw new JobError("clip_missing","Video clip no longer exists.","permanent");
  return data as any;
}
async function getSegments(admin:any,projectId:string):Promise<Segment[]>{
  const out:Segment[]=[]; let from=0; const size=1000;
  while(true){
    const {data,error}=await admin.from("ai_operations_video_transcript_segments")
      .select("segment_index,start_seconds,end_seconds,text")
      .eq("project_id",projectId).order("segment_index",{ascending:true}).range(from,from+size-1);
    if(error) throw new JobError("segments_lookup_failed",error.message,"retryable");
    const rows=(data??[]).map((x:any)=>({
      segment_index:Number(x.segment_index), start_seconds:Number(x.start_seconds),
      end_seconds:Number(x.end_seconds), text:String(x.text??"")
    }));
    out.push(...rows);
    if(rows.length<size) break;
    from+=size;
    if(from>=10000) break;
  }
  return out;
}
async function getLinks(admin:any,projectId:string){
  const {data,error}=await admin.from("ai_operations_video_project_social_links")
    .select("platform,url,display_label").eq("project_id",projectId).order("platform");
  if(error) throw new JobError("social_links_lookup_failed",error.message,"retryable");
  return data??[];
}
function transcriptWithTimes(segments:Segment[],fallback:string|null){
  if(!segments.length) return String(fallback??"");
  return segments.map(s=>`[${formatTime(s.start_seconds)}-${formatTime(s.end_seconds)}] ${s.text}`).join("\n");
}
function clipTranscript(segments:Segment[],start:number,end:number,fallback:string|null){
  const text=segments.filter(s=>s.end_seconds>start && s.start_seconds<end).map(s=>s.text).join(" ").trim();
  return text || String(fallback??"").trim();
}

type PromptProfile = {
  profile_key:string; version:number; system_prompt:string; instruction_prompt:string; config:Record<string,unknown>;
};
async function getPrompt(admin:any,job:Job,project:Project,key:string):Promise<PromptProfile>{
  const requested=Number(job.payload?.prompt_profile_version??0);
  let q=admin.from("ai_operations_video_prompt_profiles")
    .select("profile_key,version,system_prompt,instruction_prompt,config")
    .eq("tenant_id",project.tenant_id).eq("profile_key",key);
  q=requested>0?q.eq("version",requested):q.eq("is_active",true).order("version",{ascending:false}).limit(1);
  const {data,error}=await q.maybeSingle();
  if(error) throw new JobError("prompt_profile_lookup_failed",error.message,"retryable");
  if(!data) throw new JobError("prompt_profile_missing","Prompt profile "+key+" is unavailable.","systemic");
  return data as PromptProfile;
}
type OpenRouterJsonOptions={
  maxTokens?:number;
  reasoningEffort?:"none"|"minimal"|"low"|"medium"|"high"|"xhigh";
  emptyRetries?:number;
  temperature?:number;
};
async function openRouterJson(
  apiKey:string, model:string, system:string, user:string, schemaName:string, schema:Record<string,unknown>,
  options:OpenRouterJsonOptions={}
){
  const maxTokens=Math.max(1000,Number(options.maxTokens??10000));
  const emptyRetries=Math.max(0,Math.min(1,Number(options.emptyRetries??0)));
  let lastDiagnostic="";
  for(let attempt=0;attempt<=emptyRetries;attempt++){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),120000);
    try{
      const isOpenAIReasoning=/^openai\/gpt-(?:5|6)/i.test(model);
      const requestBody:any={
        model,
        messages:[{role:"system",content:system},{role:"user",content:user}],
        response_format:{type:"json_schema",json_schema:{name:schemaName,strict:true,schema}},
        provider:isOpenAIReasoning
          ? {allow_fallbacks:true,require_parameters:true}
          : {allow_fallbacks:true}
      };
      if(isOpenAIReasoning){
        requestBody.max_completion_tokens=maxTokens;
        requestBody.reasoning={effort:options.reasoningEffort??"low"};
      }else{
        requestBody.max_tokens=maxTokens;
        requestBody.temperature=attempt>0?0:Number(options.temperature??0.25);
        requestBody.reasoning={effort:options.reasoningEffort??"low"};
      }

      const res=await fetch(OPENROUTER_URL,{
        method:"POST",signal:controller.signal,
        headers:{
          authorization:`Bearer ${apiKey}`,"content-type":"application/json",
          "HTTP-Referer":"https://valorwell.org","X-Title":"ValorWell BTY Publishing Pipeline"
        },
        body:JSON.stringify(requestBody)
      });
      const body=await res.json().catch(()=>({}));
      if(!res.ok){
        const msg=String(body?.error?.message??body?.message??`OpenRouter HTTP ${res.status}`);
        if(res.status===401||res.status===403) throw new JobError("openrouter_auth_failed",msg,"systemic");
        if(res.status===429||res.status>=500) throw new JobError(`openrouter_http_${res.status}`,msg,"systemic");
        throw new JobError(`openrouter_http_${res.status}`,msg,"permanent");
      }

      let content=body?.choices?.[0]?.message?.content;
      if(Array.isArray(content)) content=content.map((x:any)=>x?.text??"").join("");
      const finishReason=String(body?.choices?.[0]?.finish_reason??"unknown");
      const completionTokens=Number(body?.usage?.completion_tokens??0);
      const reasoningTokens=Number(body?.usage?.completion_tokens_details?.reasoning_tokens??0);
      const refusal=Boolean(body?.choices?.[0]?.message?.refusal);
      lastDiagnostic="finish_reason="+finishReason+
        ", completion_tokens="+completionTokens+
        ", reasoning_tokens="+reasoningTokens+
        ", refusal="+refusal+
        ", attempt="+(attempt+1);

      if(typeof content!=="string" || !content.trim()){
        if(attempt<emptyRetries) continue;
        throw new JobError(
          "openrouter_empty",
          "OpenRouter returned no structured content ("+lastDiagnostic+").",
          "retryable"
        );
      }
      try{
        return {value:JSON.parse(content),usage:body?.usage??{},cost:body?.usage?.cost??null,diagnostic:lastDiagnostic};
      }catch{
        if(attempt<emptyRetries) continue;
        throw new JobError(
          "openrouter_invalid_json",
          "OpenRouter returned invalid structured JSON ("+lastDiagnostic+").",
          "retryable"
        );
      }
    }catch(e){
      if(e instanceof JobError) throw e;
      const m=safeMessage(e);
      if(/abort|timeout|network|fetch/i.test(m)) throw new JobError("openrouter_network",m,"retryable");
      throw new JobError("openrouter_unexpected",m,"retryable");
    }finally{clearTimeout(timer);}
  }
  throw new JobError("openrouter_empty","OpenRouter returned no structured content ("+lastDiagnostic+").","retryable");
}
async function processFullMetadata(admin:any,job:Job,project:Project,model:string,apiKey:string){
  const prompt=await getPrompt(admin,job,project,"bty_full_metadata");
  const segments=await getSegments(admin,project.id); const links=await getLinks(admin,project.id);
  const transcript=transcriptWithTimes(segments,project.transcript_text);
  const schema={
    type:"object",additionalProperties:false,
    properties:{
      title:{type:"string"},
      summary:{type:"string"},
      chapters:{type:"array",items:{type:"object",additionalProperties:false,properties:{seconds:{type:"number"},title:{type:"string"}},required:["seconds","title"]}},
      hashtags:{type:"array",minItems:5,maxItems:5,items:{type:"string"}},
      tags:{type:"array",maxItems:15,items:{type:"string"}}
    },required:["title","summary","chapters","hashtags","tags"]
  };
  const user=[
    prompt.instruction_prompt,
    "Guest: "+String(project.guest_name??""),
    "Organization: "+String(project.organization_name??""),
    "Known links: "+JSON.stringify(links),
    "\nTRANSCRIPT\n"+transcript
  ].join("\n");
  const out=await openRouterJson(apiKey,model,prompt.system_prompt,user,"bty_full_metadata",schema);
  const v=out.value as any;
  const chapterLines=(v.chapters??[]).sort((a:any,b:any)=>Number(a.seconds)-Number(b.seconds))
    .map((x:any)=>formatTime(Number(x.seconds))+" "+String(x.title).trim()).join("\n");
  const linkLines=links.map((x:any)=>String(x.display_label??x.platform)+": "+String(x.url)).join("\n");
  const hashtags=(v.hashtags??[]).map((x:any)=>String(x).trim()).filter(Boolean).slice(0,5);
  const description=[
    String(v.summary??"").trim(),
    chapterLines ? "CHAPTERS\n"+chapterLines : "",
    linkLines ? "CONNECT\n"+linkLines : "",
    hashtags.join(" ")
  ].filter(Boolean).join("\n\n");

  const {data:accounts,error:aErr}=await admin.from("ai_operations_social_accounts")
    .select("id").eq("tenant_id",project.tenant_id).eq("platform","youtube").eq("auth_status","connected")
    .order("is_default",{ascending:false}).order("created_at",{ascending:true}).limit(1);
  if(aErr) throw new JobError("youtube_account_lookup_failed",aErr.message,"retryable");
  if(!accounts?.length) throw new JobError("youtube_account_missing","No connected YouTube account is available.","permanent");
  const accountId=String(accounts[0].id);

  const {data:existing,error:eErr}=await admin.from("ai_operations_social_publications")
    .select("id,status").eq("account_id",accountId).eq("project_id",project.id).eq("source_type","project")
    .in("status",["draft","ready","approved"]).limit(1);
  if(eErr) throw new JobError("publication_lookup_failed",eErr.message,"retryable");

  const row:any={
    tenant_id:project.tenant_id,account_id:accountId,platform:"youtube",source_type:"project",
    project_id:project.id,clip_id:null,content_format:"full_episode",status:"draft",delivery_mode:"immediate",
    timezone:"America/Chicago",title:String(v.title??"").trim(),description,
    workflow_revision:project.workflow_revision,
    tags:(v.tags??[]).map((x:any)=>String(x).trim()).filter(Boolean),
    hashtags,updated_at:new Date().toISOString()
  };
  if(existing?.length){
    const {error}=await admin.from("ai_operations_social_publications").update({...row,thumbnail_file_id:null,thumbnail_url:null}).eq("id",existing[0].id);
    if(error) throw new JobError("publication_update_failed",error.message,"retryable");
  }else{
    const {error}=await admin.from("ai_operations_social_publications").insert({...row,thumbnail_file_id:null,thumbnail_url:null,created_at:new Date().toISOString()});
    if(error) throw new JobError("publication_insert_failed",error.message,"retryable");
  }
  const {error:coverInvalidateError}=await admin.from("ai_operations_video_projects").update({
    full_metadata_input_fingerprint:job.input_fingerprint,
    cover_metadata_input_fingerprint:null,cover_input_fingerprint:null,
    cover_hook_text:null,cover_primary_speaker:null,cover_person_positioning:null,cover_facial_expression:null,
    cover_gesture_action:null,cover_camera_framing:null,cover_pose_family:null,cover_core_visual:null,
    cover_hook_text_placement:null,cover_image_file_id:null,cover_image_url:null,
    last_progress_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",project.id);
  if(coverInvalidateError) throw new JobError("project_cover_invalidate_failed",coverInvalidateError.message,"retryable");
  return {title:row.title,chapters:(v.chapters??[]).length,hashtags,model,prompt_profile:prompt.profile_key,prompt_version:prompt.version,cost:out.cost,usage:out.usage};
}
async function processSegments(admin:any,job:Job,project:Project,model:string,apiKey:string,kind:"part"|"short"){
  const promptKey=kind==="part"?"bty_segment_parts":"bty_segment_shorts";
  const prompt=await getPrompt(admin,job,project,promptKey);
  const effectiveModel=String((prompt.config as any)?.model_override??model);
  const segments=await getSegments(admin,project.id);
  const isPart=kind==="part";
  if(!segments.length){
    throw new JobError(
      "segmentation_timestamped_transcript_missing",
      (isPart?"BTY Parts Generator":"BTY Shorts Generator")+" requires timestamped transcript segments.",
      "permanent"
    );
  }

  const transcript=segments
    .map(s=>"[SEG "+s.segment_index+" | "+formatTime(s.start_seconds)+"-"+formatTime(s.end_seconds)+"] "+s.text)
    .join("\n");
  const duration=Math.max(0,Number(project.duration_seconds??segments.at(-1)!.end_seconds));
  const posBySegmentIndex=new Map<number,number>();
  segments.forEach((s,i)=>posBySegmentIndex.set(Number(s.segment_index),i));

  const partMinCount=Math.max(5,Number((prompt.config as any)?.min_parts??5));
  const partMaxCount=Math.min(10,Math.max(partMinCount,Number((prompt.config as any)?.max_parts??10)));
  const partPreferredMin=Math.max(partMinCount,Number((prompt.config as any)?.preferred_min_parts??7));
  const partPreferredMax=Math.min(partMaxCount,Math.max(partPreferredMin,Number((prompt.config as any)?.preferred_max_parts??10)));
  const partMin=Number(job.payload?.min_seconds??(prompt.config as any)?.target_min_seconds??300);
  const partMax=Number(job.payload?.max_seconds??(prompt.config as any)?.target_max_seconds??900);

  const shortPreferredMin=Number((prompt.config as any)?.preferred_min_seconds??20);
  const shortPreferredMax=Number((prompt.config as any)?.preferred_max_seconds??90);
  const shortAllowedMin=Number((prompt.config as any)?.allowed_min_seconds??10);
  const shortHardMax=Number((prompt.config as any)?.hard_max_seconds??179.999);

  const schema=isPart ? {
    type:"object",additionalProperties:false,
    properties:{
      boundaries:{
        type:"array",minItems:partMinCount,maxItems:partMaxCount,
        items:{
          type:"object",additionalProperties:false,
          properties:{
            end_segment_index:{type:"integer",minimum:0},
            reason:{type:"string"}
          },
          required:["end_segment_index","reason"]
        }
      }
    },
    required:["boundaries"]
  } : {
    type:"object",additionalProperties:false,
    properties:{
      clips:{
        type:"array",minItems:0,maxItems:30,
        items:{
          type:"object",additionalProperties:false,
          properties:{
            start_segment_index:{type:"integer",minimum:0},
            end_segment_index:{type:"integer",minimum:0},
            hook_sentence:{type:"string"},
            rationale:{type:"string"},
            category:{type:"string"},
            total_score:{type:"number",minimum:0,maximum:100}
          },
          required:["start_segment_index","end_segment_index","hook_sentence","rationale","category","total_score"]
        }
      }
    },
    required:["clips"]
  };

  const runtimePolicy=isPart
    ? [
        "BTY Parts runtime policy:",
        "- Return "+partMinCount+"-"+partMaxCount+" boundary objects; prefer "+partPreferredMin+"-"+partPreferredMax+" when natural.",
        "- Return one end_segment_index per Part. Do NOT return timestamps.",
        "- Boundary indices must be real supplied SEG numbers and strictly increase.",
        "- The final end_segment_index MUST be "+segments.at(-1)!.segment_index+".",
        "- Coverage is mandatory: all transcript segments from SEG "+segments[0].segment_index+" through SEG "+segments.at(-1)!.segment_index+" must be included exactly once.",
        "- Target Part duration is roughly "+partMin+"-"+partMax+" seconds, but natural editorial boundaries take priority."
      ].join("\n")
    : [
        "BTY Shorts runtime policy:",
        "- Return only final surviving clips after Finder, Critic, Ranker, Deduplicator, and Boundary Refiner.",
        "- Use real start_segment_index and end_segment_index values from the supplied transcript. Do NOT return timestamps.",
        "- Preferred duration: "+shortPreferredMin+"-"+shortPreferredMax+" seconds.",
        "- Allowed duration: "+shortAllowedMin+"-"+shortHardMax+" seconds; hard maximum strictly under 180 seconds.",
        "- Do not pad clips. Exceed the preferred maximum only when context is genuinely required.",
        "- Do not return substantially overlapping or duplicate ideas."
      ].join("\n");

  const user=[
    prompt.instruction_prompt,
    "Episode duration: "+duration+" seconds.",
    runtimePolicy,
    "\nNUMBERED TIMESTAMPED TRANSCRIPT\n"+transcript
  ].join("\n");

  const out=await openRouterJson(
    apiKey,effectiveModel,prompt.system_prompt,user,isPart?"bty_parts_boundaries":"bty_shorts_boundaries",schema,
    {
      maxTokens:Number((prompt.config as any)?.openrouter_max_tokens??(isPart?24000:16000)),
      reasoningEffort:String((prompt.config as any)?.reasoning_effort??"low") as any,
      emptyRetries:1,
      temperature:0.15
    }
  );

  let clips:any[]=[];
  if(isPart){
    const boundaries=((out.value as any).boundaries??[]).map((x:any)=>({
      end_segment_index:Number(x.end_segment_index),
      reason:String(x.reason??"").trim()
    }));
    if(boundaries.length<partMinCount || boundaries.length>partMaxCount){
      throw new JobError("segmentation_part_count_invalid","BTY Parts Generator requires "+partMinCount+"-"+partMaxCount+" Parts; model returned "+boundaries.length+".","retryable");
    }

    let previousPos=-1;
    for(let i=0;i<boundaries.length;i++){
      const boundary=boundaries[i];
      if(!Number.isInteger(boundary.end_segment_index)||!posBySegmentIndex.has(boundary.end_segment_index)){
        throw new JobError("segmentation_boundary_segment_invalid","Part "+(i+1)+" returned an end_segment_index that is not present in the transcript.","retryable");
      }
      const endPos=posBySegmentIndex.get(boundary.end_segment_index)!;
      if(endPos<=previousPos){
        throw new JobError("segmentation_boundary_order_invalid","Part boundary segment indices must be strictly increasing.","retryable");
      }
      const startPos=previousPos+1;
      const startSeg=segments[startPos];
      const endSeg=segments[endPos];
      clips.push({
        start:startSeg.start_seconds,
        end:Math.min(duration||endSeg.end_seconds,endSeg.end_seconds),
        reason:boundary.reason,
        hook_sentence:"",
        rationale:boundary.reason,
        category:"",
        total_score:null
      });
      previousPos=endPos;
    }
    if(previousPos!==segments.length-1){
      throw new JobError("segmentation_final_boundary_invalid","The final Part must end on the final transcript segment (SEG "+segments.at(-1)!.segment_index+").","retryable");
    }

    const eps=0.05;
    let uncovered=0,multiplyCovered=0;
    for(const seg of segments){
      const effectiveEnd=Math.min(duration||seg.end_seconds,seg.end_seconds);
      const owners=clips.filter((c:any)=>c.start<=seg.start_seconds+eps && c.end>=effectiveEnd-eps).length;
      if(owners===0) uncovered++;
      if(owners>1) multiplyCovered++;
    }
    if(uncovered>0||multiplyCovered>0){
      throw new JobError("segmentation_coverage_failed","BTY Parts coverage QA failed: "+uncovered+" transcript segments uncovered; "+multiplyCovered+" assigned to multiple Parts.","retryable");
    }
  }else{
    const rawClips=((out.value as any).clips??[]);
    for(let i=0;i<rawClips.length;i++){
      const x=rawClips[i];
      const startIndex=Number(x.start_segment_index);
      const endIndex=Number(x.end_segment_index);
      if(!Number.isInteger(startIndex)||!Number.isInteger(endIndex)||!posBySegmentIndex.has(startIndex)||!posBySegmentIndex.has(endIndex)){
        throw new JobError("short_boundary_segment_invalid","Short "+(i+1)+" returned a segment index that is not present in the transcript.","retryable");
      }
      const startPos=posBySegmentIndex.get(startIndex)!;
      const endPos=posBySegmentIndex.get(endIndex)!;
      if(endPos<startPos){
        throw new JobError("short_boundary_order_invalid","Short "+(i+1)+" ends before it starts.","retryable");
      }
      const start=segments[startPos].start_seconds;
      const end=Math.min(duration||segments[endPos].end_seconds,segments[endPos].end_seconds);
      const d=end-start;
      if(d<shortAllowedMin || d>=180 || d>shortHardMax+0.000001) continue;
      clips.push({
        start,end,
        reason:String(x.rationale??"").trim(),
        hook_sentence:String(x.hook_sentence??"").trim(),
        rationale:String(x.rationale??"").trim(),
        category:String(x.category??"").trim(),
        total_score:Number.isFinite(Number(x.total_score))?Number(x.total_score):null
      });
    }

    clips.sort((a:any,b:any)=>a.start-b.start);
    const deduped:any[]=[];
    for(const clip of clips){
      const duplicate=deduped.some((kept:any)=>{
        const overlap=Math.max(0,Math.min(clip.end,kept.end)-Math.max(clip.start,kept.start));
        const shorter=Math.min(clip.end-clip.start,kept.end-kept.start);
        return shorter>0 && overlap/shorter>=0.8;
      });
      if(!duplicate) deduped.push(clip);
    }
    clips=deduped;
  }

  if(isPart){
    const {error}=await admin.from("ai_operations_video_clips")
      .update({part_number:null,pipeline_status:"superseded",updated_at:new Date().toISOString()})
      .eq("project_id",project.id).eq("clip_type","part");
    if(error) throw new JobError("part_supersede_failed",error.message,"retryable");
  }else{
    const {error}=await admin.from("ai_operations_video_clips")
      .update({pipeline_status:"superseded",updated_at:new Date().toISOString()})
      .eq("project_id",project.id).eq("clip_type","short");
    if(error) throw new JobError("short_supersede_failed",error.message,"retryable");
  }

  let written=0;
  for(let i=0;i<clips.length;i++){
    const x=clips[i];
    const text=clipTranscript(segments,x.start,x.end,project.transcript_text);
    const {data:existing,error:eErr}=await admin.from("ai_operations_video_clips")
      .select("id,drive_file_id,drive_file_url,rendered_at,output_size_bytes,source_revision")
      .eq("project_id",project.id).eq("clip_type",kind)
      .eq("start_seconds",x.start).eq("end_seconds",x.end).maybeSingle();
    if(eErr) throw new JobError("clip_boundary_lookup_failed",eErr.message,"retryable");

    const canReuseRender=Boolean(existing?.drive_file_id)&&Number(existing?.source_revision??0)===Number(project.source_revision??0);
    const values:any={
      project_id:project.id,start_seconds:x.start,end_seconds:x.end,transcript_text:text,
      clip_type:kind,parent_file_id:project.source_file_id,workflow_revision:project.workflow_revision,
      source_revision:Number(project.source_revision??0),
      pipeline_status:canReuseRender?"rendered":"render_pending",
      last_progress_at:new Date().toISOString(),updated_at:new Date().toISOString()
    };
    if(!canReuseRender){
      values.drive_file_id=null;values.drive_file_url=null;values.rendered_at=null;
      values.output_size_bytes=null;values.error_message=null;values.status="proposed";
    }
    if(isPart) values.part_number=i+1;

    if(existing){
      const {error}=await admin.from("ai_operations_video_clips").update(values).eq("id",existing.id);
      if(error) throw new JobError("clip_update_failed",error.message,"retryable");
    }else{
      const {error}=await admin.from("ai_operations_video_clips").insert({...values,status:"proposed",created_at:new Date().toISOString()});
      if(error) throw new JobError("clip_insert_failed",error.message,"retryable");
    }
    written++;
  }

  const countField=isPart?"expected_part_count":"expected_short_count";
  const fpField=isPart?"parts_input_fingerprint":"shorts_input_fingerprint";
  const {error:pErr}=await admin.from("ai_operations_video_projects")
    .update({[countField]:written,[fpField]:job.input_fingerprint,last_progress_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq("id",project.id);
  if(pErr) throw new JobError("project_expected_count_failed",pErr.message,"retryable");

  return {
    kind,count:written,model:effectiveModel,prompt_profile:prompt.profile_key,prompt_version:prompt.version,
    duration_policy:isPart?{
      min_parts:partMinCount,max_parts:partMaxCount,preferred_min_parts:partPreferredMin,preferred_max_parts:partPreferredMax,
      target_min:partMin,target_max:partMax,coverage_required:true,output_mode:"segment_boundary_indices_v1"
    }:{
      preferred_min:shortPreferredMin,preferred_max:shortPreferredMax,allowed_min:shortAllowedMin,hard_max:shortHardMax,
      output_mode:"short_segment_indices_v1"
    },
    selections:isPart?clips.map((x:any,i:number)=>({
      part_number:i+1,start_seconds:x.start,end_seconds:x.end,duration_seconds:x.end-x.start,reason:x.reason
    })):clips.map((x:any,i:number)=>({
      clip_number:i+1,start_seconds:x.start,end_seconds:x.end,duration_seconds:x.end-x.start,
      hook_sentence:x.hook_sentence,rationale:x.rationale,category:x.category,total_score:x.total_score
    })),
    cost:out.cost,usage:out.usage,openrouter_diagnostic:out.diagnostic
  };
}

async function processTitleGeneration(admin:any,job:Job,project:Project,model:string,apiKey:string){
  if(!job.clip_id) throw new JobError("clip_id_missing","Title-generation job has no clip_id.","permanent");
  const prompt=await getPrompt(admin,job,project,"bty_title_generation");
  const clip=await getClip(admin,job.clip_id);
  const script=String(clip.transcript_text??"").trim();
  if(!script) throw new JobError("title_script_missing","Title generation requires a non-empty clip script.","permanent");

  const effectiveModel=String((prompt.config as any)?.model_override??model);
  const configuredEffort=String((prompt.config as any)?.reasoning_effort??"high");
  const reasoningEffort=(["none","minimal","low","medium","high","xhigh"].includes(configuredEffort)
    ? configuredEffort : "high") as "none"|"minimal"|"low"|"medium"|"high"|"xhigh";
  const candidateCount=Math.min(10,Math.max(3,Number((prompt.config as any)?.candidate_count??10)));
  const maxCharacters=Math.min(55,Math.max(20,Number((prompt.config as any)?.max_characters??55)));

  const schema={
    type:"object",additionalProperties:false,
    properties:{
      title:{type:"string"},
      candidates:{
        type:"array",minItems:candidateCount,maxItems:candidateCount,
        items:{
          type:"object",additionalProperties:false,
          properties:{
            title:{type:"string"},
            score:{type:"number",minimum:0,maximum:100},
            character_count:{type:"integer",minimum:1,maximum:maxCharacters}
          },
          required:["title","score","character_count"]
        }
      }
    },
    required:["title","candidates"]
  };

  // Deliberately sealed context: the title model receives the script and nothing
  // from hook generation, guest/org metadata, descriptions, thumbnails, or asset type.
  const user=[
    prompt.instruction_prompt,
    "Return exactly "+candidateCount+" distinct title candidates.",
    "TITLE HARD CEILING: "+maxCharacters+" characters including spaces and punctuation.",
    "\nSCRIPT\n"+script
  ].join("\n");

  const out=await openRouterJson(
    apiKey,effectiveModel,prompt.system_prompt,user,"bty_title_generation",schema,
    {
      maxTokens:Number((prompt.config as any)?.openrouter_max_tokens??6500),
      reasoningEffort,
      emptyRetries:Number((prompt.config as any)?.empty_response_retries??1),
      temperature:Number((prompt.config as any)?.temperature??0.55)
    }
  );

  const v=out.value as any;
  const normalizeTitle=(value:any)=>String(value??"").trim().replace(/\s+/g," ");
  const characterCount=(value:string)=>Array.from(value).length;
  const validTitle=(value:string)=>Boolean(value) && characterCount(value)<=maxCharacters;

  const requestedWinner=normalizeTitle(v.title);
  if(!validTitle(requestedWinner)){
    throw new JobError(
      "title_character_count_invalid",
      "YouTube title must contain 1-"+maxCharacters+" characters; model returned "+characterCount(requestedWinner)+".",
      "retryable"
    );
  }

  const seen=new Set<string>();
  const candidates=(Array.isArray(v.candidates)?v.candidates:[])
    .map((x:any)=>{
      const title=normalizeTitle(x?.title);
      return {
        title,
        score:Math.max(0,Math.min(100,Number(x?.score??0))),
        character_count:characterCount(title)
      };
    })
    .filter((x:any)=>validTitle(x.title))
    .filter((x:any)=>{
      const key=x.title.toLowerCase();
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a:any,b:any)=>b.score-a.score);

  if(candidates.length!==candidateCount){
    throw new JobError(
      "title_candidate_count_invalid",
      "Title generator must return exactly "+candidateCount+" distinct valid candidates; received "+candidates.length+".",
      "retryable"
    );
  }

  const winner=candidates.find((x:any)=>x.title.toLowerCase()===requestedWinner.toLowerCase());
  if(!winner){
    throw new JobError(
      "title_winner_missing_from_candidates",
      "Selected title must also appear in the ranked candidate set.",
      "retryable"
    );
  }

  const title=winner.title;
  const nextRevision=Number(clip.title_generation_revision??0)+1;
  const now=new Date().toISOString();
  const {error}=await admin.from("ai_operations_video_clips").update({
    youtube_title:title,
    title_candidates:candidates,
    title_generation_meta:{
      source:"generated",
      context_mode:"script_only",
      model:effectiveModel,
      reasoning_effort:reasoningEffort,
      prompt_profile:prompt.profile_key,
      prompt_version:prompt.version,
      candidate_count:candidateCount,
      max_characters:maxCharacters,
      openrouter_diagnostic:out.diagnostic
    },
    title_generation_revision:nextRevision,
    title_input_fingerprint:job.input_fingerprint,
    title_generated_at:now,
    youtube_description:null,
    linkedin_description:null,
    facebook_description:null,
    tiktok_description:null,
    hashtags:[],
    copy_input_fingerprint:null,
    thumbnail_metadata_input_fingerprint:null,
    thumbnail_input_fingerprint:null,
    primary_speaker:null,
    person_positioning:null,
    facial_expression:null,
    gesture_action:null,
    camera_framing:null,
    pose_family:null,
    core_visual:null,
    hook_text_placement:null,
    cover_image_file_id:null,
    cover_image_url:null,
    pipeline_status:"title_ready",
    last_progress_at:now,
    updated_at:now
  }).eq("id",clip.id);
  if(error) throw new JobError("title_update_failed",error.message,"retryable");

  const {error:pubErr}=await admin.from("ai_operations_social_publications").update({
    title,
    description:null,
    thumbnail_file_id:null,
    thumbnail_url:null,
    updated_at:now
  }).eq("clip_id",clip.id).in("status",["draft","ready","approved"]);
  if(pubErr) throw new JobError("title_publication_invalidate_failed",pubErr.message,"retryable");

  return {
    clip_id:clip.id,generation_revision:nextRevision,title,
    character_count:characterCount(title),candidate_count:candidates.length,
    model:effectiveModel,reasoning_effort:reasoningEffort,prompt_profile:prompt.profile_key,
    prompt_version:prompt.version,cost:out.cost,usage:out.usage,openrouter_diagnostic:out.diagnostic
  };
}

async function processClipCopy(admin:any,job:Job,project:Project,model:string,apiKey:string){
  if(!job.clip_id) throw new JobError("clip_id_missing","Clip-copy job has no clip_id.","permanent");
  const prompt=await getPrompt(admin,job,project,"bty_clip_copy");
  const clip=await getClip(admin,job.clip_id);
  if(!clip.title_input_fingerprint || !String(clip.youtube_title??"").trim()){
    throw new JobError("title_not_ready","Platform-copy generation requires a completed title-generation step.","retryable");
  }
  const links=await getLinks(admin,project.id);
  const schema={
    type:"object",additionalProperties:false,
    properties:{
      youtube_description:{type:"string"},
      linkedin_description:{type:"string"},facebook_description:{type:"string"},tiktok_description:{type:"string"},
      hashtags:{type:"array",minItems:3,maxItems:8,items:{type:"string"}}
    },required:["youtube_description","linkedin_description","facebook_description","tiktok_description","hashtags"]
  };
  const user=[
    prompt.instruction_prompt,
    "Asset type: "+String(clip.clip_type),
    "Approved YouTube title (do not rewrite): "+String(clip.youtube_title??""),
    "Guest: "+String(project.guest_name??""),
    "Organization: "+String(project.organization_name??""),
    "Known links: "+JSON.stringify(links),
    "\nCLIP TRANSCRIPT\n"+String(clip.transcript_text??"")
  ].join("\n");
  const out=await openRouterJson(apiKey,model,prompt.system_prompt,user,"bty_clip_copy",schema);
  const v=out.value as any;
  const now=new Date().toISOString();
  const {error}=await admin.from("ai_operations_video_clips").update({
    youtube_description:String(v.youtube_description??"").trim(),
    linkedin_description:String(v.linkedin_description??"").trim(),
    facebook_description:String(v.facebook_description??"").trim(),
    tiktok_description:String(v.tiktok_description??"").trim(),
    hashtags:(v.hashtags??[]).map((x:any)=>String(x).trim()).filter(Boolean),
    copy_input_fingerprint:job.input_fingerprint,
    pipeline_status:"copy_ready",last_progress_at:now,updated_at:now
  }).eq("id",clip.id);
  if(error) throw new JobError("clip_copy_update_failed",error.message,"retryable");

  const {error:pubErr}=await admin.from("ai_operations_social_publications").update({
    title:String(clip.youtube_title??"").trim(),
    description:String(v.youtube_description??"").trim(),
    hashtags:(v.hashtags??[]).map((x:any)=>String(x).trim()).filter(Boolean),
    updated_at:now
  }).eq("clip_id",clip.id).in("status",["draft","ready","approved"]);
  if(pubErr) throw new JobError("clip_copy_publication_update_failed",pubErr.message,"retryable");

  return {clip_id:clip.id,model,prompt_profile:prompt.profile_key,prompt_version:prompt.version,cost:out.cost,usage:out.usage};
}
async function processHookGeneration(admin:any,job:Job,project:Project,model:string,apiKey:string){
  if(!job.clip_id) throw new JobError("clip_id_missing","Hook-generation job has no clip_id.","permanent");
  const prompt=await getPrompt(admin,job,project,"bty_hook_generation");
  const clip=await getClip(admin,job.clip_id);
  const script=String(clip.transcript_text??"").trim();
  if(!script) throw new JobError("hook_script_missing","Hook generation requires a non-empty clip script.","permanent");

  const effectiveModel=String((prompt.config as any)?.model_override??model);
  const configuredEffort=String((prompt.config as any)?.reasoning_effort??"high");
  const reasoningEffort=(["none","minimal","low","medium","high","xhigh"].includes(configuredEffort)
    ? configuredEffort : "high") as "none"|"minimal"|"low"|"medium"|"high"|"xhigh";
  const minHookWords=Math.max(2,Math.min(5,Number((prompt.config as any)?.hook_min_words??2)));
  const maxHookWords=Math.min(5,Math.max(minHookWords,Number((prompt.config as any)?.hook_max_words??5)));
  const candidateCount=Math.min(10,Math.max(3,Number((prompt.config as any)?.candidate_count??10)));

  const schema={
    type:"object",additionalProperties:false,
    properties:{
      hook_text:{type:"string"},
      candidates:{
        type:"array",minItems:candidateCount,maxItems:candidateCount,
        items:{
          type:"object",additionalProperties:false,
          properties:{
            hook_text:{type:"string"},
            score:{type:"number",minimum:0,maximum:100}
          },
          required:["hook_text","score"]
        }
      }
    },
    required:["hook_text","candidates"]
  };

  // Deliberately sealed context: no title, asset type, guest, organization,
  // social copy, thumbnail metadata, or other project framing reaches this model.
  const user=[
    prompt.instruction_prompt,
    "Return exactly "+candidateCount+" distinct candidates.",
    "HOOK HARD LIMIT: every hook must contain "+minHookWords+"-"+maxHookWords+" words.",
    "\nSCRIPT\n"+script
  ].join("\n");

  const out=await openRouterJson(
    apiKey,effectiveModel,prompt.system_prompt,user,"bty_hook_generation",schema,
    {
      maxTokens:Number((prompt.config as any)?.openrouter_max_tokens??6000),
      reasoningEffort,
      emptyRetries:Number((prompt.config as any)?.empty_response_retries??1),
      temperature:Number((prompt.config as any)?.temperature??0.55)
    }
  );

  const v=out.value as any;
  const normalizeHook=(value:any)=>String(value??"").trim().replace(/\s+/g," ");
  const validHook=(value:string)=>{
    const wc=value ? value.split(/\s+/).filter(Boolean).length : 0;
    return wc>=minHookWords && wc<=maxHookWords;
  };

  const requestedWinner=normalizeHook(v.hook_text);
  if(!validHook(requestedWinner)){
    const wc=requestedWinner ? requestedWinner.split(/\s+/).filter(Boolean).length : 0;
    throw new JobError(
      "hook_word_count_invalid",
      "On-screen hook must contain "+minHookWords+"-"+maxHookWords+" words; model returned "+wc+".",
      "retryable"
    );
  }

  const seen=new Set<string>();
  const candidates=(Array.isArray(v.candidates)?v.candidates:[])
    .map((x:any)=>({
      hook_text:normalizeHook(x?.hook_text),
      score:Math.max(0,Math.min(100,Number(x?.score??0)))
    }))
    .filter((x:any)=>validHook(x.hook_text))
    .filter((x:any)=>{
      const key=x.hook_text.toLowerCase();
      if(!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a:any,b:any)=>b.score-a.score);

  if(candidates.length!==candidateCount){
    throw new JobError(
      "hook_candidate_count_invalid",
      "Hook generator must return exactly "+candidateCount+" distinct valid candidates; received "+candidates.length+".",
      "retryable"
    );
  }

  const winner=candidates.find((x:any)=>x.hook_text.toLowerCase()===requestedWinner.toLowerCase());
  if(!winner){
    throw new JobError(
      "hook_winner_missing_from_candidates",
      "Selected hook_text must also appear in the ranked candidate set.",
      "retryable"
    );
  }
  const hook=winner.hook_text;

  const nextRevision=Number(clip.hook_generation_revision??0)+1;
  const now=new Date().toISOString();
  const {error}=await admin.from("ai_operations_video_clips").update({
    hook_text:hook,
    hook_candidates:candidates,
    hook_generation_meta:{
      source:"generated",
      context_mode:"script_only",
      model:effectiveModel,
      reasoning_effort:reasoningEffort,
      prompt_profile:prompt.profile_key,
      prompt_version:prompt.version,
      candidate_count:candidateCount,
      hook_min_words:minHookWords,
      hook_max_words:maxHookWords,
      openrouter_diagnostic:out.diagnostic
    },
    hook_generation_revision:nextRevision,
    hook_input_fingerprint:job.input_fingerprint,
    hook_generated_at:now,
    thumbnail_metadata_input_fingerprint:null,thumbnail_input_fingerprint:null,
    primary_speaker:null,person_positioning:null,facial_expression:null,gesture_action:null,
    camera_framing:null,pose_family:null,core_visual:null,hook_text_placement:null,
    cover_image_file_id:null,cover_image_url:null,
    pipeline_status:"hook_ready",last_progress_at:now,updated_at:now
  }).eq("id",clip.id);
  if(error) throw new JobError("hook_update_failed",error.message,"retryable");

  const {error:pubThumbErr}=await admin.from("ai_operations_social_publications").update({
    thumbnail_file_id:null,thumbnail_url:null,updated_at:now
  }).eq("clip_id",clip.id).in("status",["draft","ready","approved"]);
  if(pubThumbErr) throw new JobError("hook_thumbnail_invalidate_failed",pubThumbErr.message,"retryable");

  return {
    clip_id:clip.id,generation_revision:nextRevision,hook_text:hook,candidate_count:candidates.length,
    model:effectiveModel,reasoning_effort:reasoningEffort,prompt_profile:prompt.profile_key,
    prompt_version:prompt.version,cost:out.cost,usage:out.usage,openrouter_diagnostic:out.diagnostic
  };
}

async function processThumbnailVisualMetadata(admin:any,job:Job,project:Project,model:string,apiKey:string){
  if(!job.clip_id) throw new JobError("clip_id_missing","Thumbnail-visual-metadata job has no clip_id.","permanent");
  const promptJob=job.job_type==="generate_thumbnail_metadata"
    ? {...job,payload:{...(job.payload??{}),prompt_profile_version:0}}
    : job;
  const prompt=await getPrompt(admin,promptJob,project,"bty_thumbnail_visual_metadata");
  const clip=await getClip(admin,job.clip_id);
  if(!clip.hook_input_fingerprint || !String(clip.hook_text??"").trim()){
    throw new JobError("hook_not_ready","Thumbnail visual metadata requires a completed hook-generation step.","retryable");
  }
  const effectiveModel=String((prompt.config as any)?.model_override??model);
  const configuredEffort=String((prompt.config as any)?.reasoning_effort??"low");
  const reasoningEffort=(["none","minimal","low","medium","high","xhigh"].includes(configuredEffort)
    ? configuredEffort : "low") as "none"|"minimal"|"low"|"medium"|"high"|"xhigh";
  const schema={
    type:"object",additionalProperties:false,
    properties:{
      primary_speaker:{type:"string"},person_positioning:{type:"string"},
      facial_expression:{type:"string"},gesture_action:{type:"string"},camera_framing:{type:"string"},
      pose_family:{type:"string"},core_visual:{type:"string"},
      hook_text_placement:{type:"string",enum:["top_left","top_right","left","right","bottom_left","bottom_right","center"]}
    },
    required:["primary_speaker","person_positioning","facial_expression","gesture_action","camera_framing","pose_family","core_visual","hook_text_placement"]
  };
  const user=[
    prompt.instruction_prompt,
    "Asset type: "+String(clip.clip_type),
    "On-screen hook (immutable; do not rewrite): "+String(clip.hook_text??""),
    "YouTube title: "+String(clip.youtube_title??""),
    "Guest: "+String(project.guest_name??""),
    "Organization: "+String(project.organization_name??""),
    "Allowed primary speakers: Luke Predmore or "+String(project.guest_name??"the project guest")+".",
    "\nCLIP TRANSCRIPT\n"+String(clip.transcript_text??"")
  ].join("\n");
  const out=await openRouterJson(
    apiKey,effectiveModel,prompt.system_prompt,user,"bty_thumbnail_visual_metadata",schema,
    {
      maxTokens:Number((prompt.config as any)?.openrouter_max_tokens??5000),
      reasoningEffort,
      emptyRetries:Number((prompt.config as any)?.empty_response_retries??0),
      temperature:Number((prompt.config as any)?.temperature??0.25)
    }
  );
  const v=out.value as any;
  const nextRevision=Number(clip.thumbnail_generation_revision??0)+1;
  const now=new Date().toISOString();
  const {error}=await admin.from("ai_operations_video_clips").update({
    primary_speaker:String(v.primary_speaker??"").trim(),
    person_positioning:String(v.person_positioning??"").trim(),
    facial_expression:String(v.facial_expression??"").trim(),
    gesture_action:String(v.gesture_action??"").trim(),camera_framing:String(v.camera_framing??"").trim(),
    pose_family:String(v.pose_family??"").trim(),core_visual:String(v.core_visual??"").trim(),
    hook_text_placement:String(v.hook_text_placement??"center"),thumbnail_generation_revision:nextRevision,
    thumbnail_metadata_input_fingerprint:job.input_fingerprint,thumbnail_input_fingerprint:null,
    cover_image_file_id:null,cover_image_url:null,
    pipeline_status:"thumbnail_metadata_ready",last_progress_at:now,updated_at:now
  }).eq("id",clip.id);
  if(error) throw new JobError("thumbnail_visual_metadata_update_failed",error.message,"retryable");
  const {error:pubThumbErr}=await admin.from("ai_operations_social_publications").update({
    thumbnail_file_id:null,thumbnail_url:null,updated_at:now
  }).eq("clip_id",clip.id).in("status",["draft","ready","approved"]);
  if(pubThumbErr) throw new JobError("thumbnail_publication_invalidate_failed",pubThumbErr.message,"retryable");
  return {
    clip_id:clip.id,generation_revision:nextRevision,model:effectiveModel,reasoning_effort:reasoningEffort,
    prompt_profile:prompt.profile_key,prompt_version:prompt.version,cost:out.cost,usage:out.usage,
    openrouter_diagnostic:out.diagnostic
  };
}
async function processProjectCoverMetadata(admin:any,job:Job,project:Project,model:string,apiKey:string){
  const prompt=await getPrompt(admin,job,project,"bty_project_cover_metadata");
  const {data:publication,error:pErr}=await admin.from("ai_operations_social_publications")
    .select("title,description").eq("project_id",project.id).eq("source_type","project")
    .eq("workflow_revision",project.workflow_revision).in("status",["draft","ready","approved"])
    .order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(pErr) throw new JobError("full_publication_lookup_failed",pErr.message,"retryable");
  if(!publication?.title) throw new JobError("full_publication_missing","Full-episode metadata is not ready.","retryable");
  const schema={
    type:"object",additionalProperties:false,
    properties:{
      hook_text:{type:"string"},primary_speaker:{type:"string"},person_positioning:{type:"string"},
      facial_expression:{type:"string"},gesture_action:{type:"string"},camera_framing:{type:"string"},
      pose_family:{type:"string"},core_visual:{type:"string"},
      hook_text_placement:{type:"string",enum:["top_left","top_right","left","right","bottom_left","bottom_right","center"]}
    },
    required:["hook_text","primary_speaker","person_positioning","facial_expression","gesture_action","camera_framing","pose_family","core_visual","hook_text_placement"]
  };
  const user=[
    prompt.instruction_prompt,
    "Guest: "+String(project.guest_name??""),
    "Organization: "+String(project.organization_name??""),
    "Full episode YouTube title: "+String(publication.title??""),
    "\nFULL EPISODE DESCRIPTION / CHAPTER CONTEXT\n"+String(publication.description??"")
  ].join("\n");
  const out=await openRouterJson(apiKey,model,prompt.system_prompt,user,"bty_project_cover_metadata",schema);
  const v=out.value as any;
  const {data:current,error:cErr}=await admin.from("ai_operations_video_projects")
    .select("cover_metadata_revision").eq("id",project.id).maybeSingle();
  if(cErr) throw new JobError("project_cover_revision_lookup_failed",cErr.message,"retryable");
  const nextRevision=Number(current?.cover_metadata_revision??0)+1;
  const {error:updateErr}=await admin.from("ai_operations_video_projects").update({
    cover_hook_text:String(v.hook_text??"").trim(),
    cover_primary_speaker:String(v.primary_speaker??project.guest_name??"").trim(),
    cover_person_positioning:String(v.person_positioning??"").trim(),
    cover_facial_expression:String(v.facial_expression??"").trim(),
    cover_gesture_action:String(v.gesture_action??"").trim(),
    cover_camera_framing:String(v.camera_framing??"").trim(),
    cover_pose_family:String(v.pose_family??"").trim(),
    cover_core_visual:String(v.core_visual??"").trim(),
    cover_hook_text_placement:String(v.hook_text_placement??"center"),
    cover_metadata_revision:nextRevision,
    cover_metadata_input_fingerprint:job.input_fingerprint,cover_input_fingerprint:null,
    cover_image_file_id:null,cover_image_url:null,
    last_progress_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",project.id);
  if(updateErr) throw new JobError("project_cover_metadata_update_failed",updateErr.message,"retryable");
  const {error:pubErr}=await admin.from("ai_operations_social_publications").update({
    thumbnail_file_id:null,thumbnail_url:null,updated_at:new Date().toISOString()
  }).eq("project_id",project.id).eq("source_type","project").eq("workflow_revision",project.workflow_revision).in("status",["draft","ready","approved"]);
  if(pubErr) throw new JobError("project_cover_publication_invalidate_failed",pubErr.message,"retryable");
  return {project_id:project.id,generation_revision:nextRevision,model,prompt_profile:prompt.profile_key,prompt_version:prompt.version,cost:out.cost,usage:out.usage};
}
async function processJob(admin:any,job:Job){
  const apiKey=Deno.env.get("OPENROUTER_API_KEY") ?? "";
  if(!apiKey) throw new JobError("openrouter_key_missing","OPENROUTER_API_KEY is not configured.","systemic");
  const project=await getProject(admin,job.project_id);
  const {data:settings,error:sErr}=await admin.from("ai_operations_video_settings")
    .select("text_provider,text_model_id,workflow_enabled").eq("tenant_id",project.tenant_id).maybeSingle();
  if(sErr) throw new JobError("settings_lookup_failed",sErr.message,"retryable");
  if(!settings?.workflow_enabled) throw new JobError("workflow_disabled","BTY workflow is disabled.","permanent");
  if(String(settings.text_provider)!=="openrouter") throw new JobError("text_provider_unsupported",`Unsupported text provider: ${settings.text_provider}`,"permanent");
  const model=String(settings.text_model_id||"z-ai/glm-5.3-flash");
  switch(job.job_type){
    case "generate_full_metadata": return processFullMetadata(admin,job,project,model,apiKey);
    case "segment_parts": return processSegments(admin,job,project,model,apiKey,"part");
    case "segment_shorts": return processSegments(admin,job,project,model,apiKey,"short");
    case "generate_title": return processTitleGeneration(admin,job,project,model,apiKey);
    case "generate_clip_copy": return processClipCopy(admin,job,project,model,apiKey);
    case "generate_hook": return processHookGeneration(admin,job,project,model,apiKey);
    case "generate_thumbnail_visual_metadata": return processThumbnailVisualMetadata(admin,job,project,model,apiKey);
    case "generate_thumbnail_metadata": return processThumbnailVisualMetadata(admin,job,project,model,apiKey);
    case "generate_project_cover_metadata": return processProjectCoverMetadata(admin,job,project,model,apiKey);
    default: throw new JobError("unsupported_job_type",`Unsupported text job: ${job.job_type}`,"permanent");
  }
}

async function processClaimedTextJob(job:Job,workerId:string){
  const admin=db();
  try{
    await admin.rpc("heartbeat_ai_operations_video_worker",{
      p_worker_id:workerId,p_tenant_id:job.tenant_id,p_status:"working",
      p_current_job_id:job.id,p_current_project_id:job.project_id,p_worker_version:"2.6.0",
      p_last_error:null,p_metadata:{job_type:job.job_type,execution_mode:"wait_until_background"}
    });
    const result=await processJob(admin,job);
    const {error:cErr}=await admin.rpc("complete_ai_operations_video_job",{
      p_job_id:job.id,p_worker_id:workerId,p_result:result
    });
    if(cErr) throw new JobError("job_complete_failed",cErr.message,"retryable");
    console.log(JSON.stringify({component:"video-bty-text-dispatcher",event:"job_complete",job_id:job.id,job_type:job.job_type}));
  }catch(e){
    const err=e instanceof JobError?e:new JobError("unexpected_error",safeMessage(e),"retryable");
    const {data:next,error:fErr}=await admin.rpc("fail_ai_operations_video_job",{
      p_job_id:job.id,p_worker_id:workerId,p_error_code:err.code,p_error_class:err.errorClass,
      p_error_message:err.message,p_result:{worker:"bty-text-worker",execution_mode:"wait_until_background"}
    });
    if(fErr){
      console.error(JSON.stringify({component:"video-bty-text-dispatcher",event:"failure_record_error",job_id:job.id,error:fErr.message,original_error:err.code}));
    }else{
      console.error(JSON.stringify({component:"video-bty-text-dispatcher",event:"job_failed",job_id:job.id,job_type:job.job_type,status:next,error_code:err.code,error_class:err.errorClass,error:err.message}));
    }
  }finally{
    try{
      await admin.rpc("heartbeat_ai_operations_video_worker",{
        p_worker_id:workerId,p_tenant_id:job.tenant_id,p_status:"idle",
        p_current_job_id:null,p_current_project_id:null,p_worker_version:"2.6.0",
        p_last_error:null,p_metadata:{last_job_id:job.id,last_job_type:job.job_type,execution_mode:"wait_until_background"}
      });
    }catch(_){}
  }
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return json({error:"Method not allowed"},405);
  if(!authorized(req)) return json({error:"Unauthorized"},401);

  const admin=db();
  const workerId="bty-text-worker";
  const {data:claimed,error:claimErr}=await admin.rpc("claim_next_ai_operations_video_job",{
    p_worker_id:workerId,p_job_types:JOB_TYPES,p_lease_seconds:300
  });
  if(claimErr) return json({ok:false,error:claimErr.message},500);

  const job=(Array.isArray(claimed)?claimed[0]:null) as Job|null;
  if(!job){
    const {data:owned}=await admin.from("ai_operations_video_jobs")
      .select("id,project_id,job_type")
      .eq("claimed_by",workerId)
      .in("status",["claimed","running"])
      .order("claimed_at",{ascending:true})
      .limit(1);
    const active=Array.isArray(owned)&&owned.length?owned[0]:null;
    await admin.rpc("heartbeat_ai_operations_video_worker",{
      p_worker_id:workerId,p_tenant_id:TENANT_ID,p_status:active?"working":"idle",
      p_current_job_id:active?.id??null,p_current_project_id:active?.project_id??null,p_worker_version:"2.6.0",
      p_last_error:null,p_metadata:active?{job_type:active.job_type,execution_mode:"wait_until_background",heartbeat_source:"concurrent_cron"}:{execution_mode:"wait_until_background"}
    });
    return json({ok:true,status:active?"busy":"idle",current_job_id:active?.id??null});
  }

  await admin.rpc("heartbeat_ai_operations_video_worker",{
    p_worker_id:workerId,p_tenant_id:job.tenant_id,p_status:"working",
    p_current_job_id:job.id,p_current_project_id:job.project_id,p_worker_version:"2.6.0",
    p_last_error:null,p_metadata:{job_type:job.job_type,execution_mode:"wait_until_background"}
  });

  EdgeRuntime.waitUntil(processClaimedTextJob(job,workerId));
  return json({ok:true,status:"accepted",job_id:job.id,job_type:job.job_type},202);
});
