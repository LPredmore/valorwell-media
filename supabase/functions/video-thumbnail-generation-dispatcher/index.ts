
import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.93.1";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.40";

const TENANT_ID="00000000-0000-0000-0000-000000000001";
const OPENROUTER_IMAGE_URL="https://openrouter.ai/api/v1/images";
const OPENROUTER_CHAT_URL="https://openrouter.ai/api/v1/chat/completions";
const MAX_REFERENCE_BYTES=10*1024*1024;
const MAX_YOUTUBE_THUMBNAIL_BYTES=1950000;
const WORKER_ID="bty-image-worker";
const JOB_TYPES=["generate_thumbnail","generate_project_cover"];

const wasmBytes=await Deno.readFile(new URL("magick.wasm",import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.40")));
await initializeImageMagick(wasmBytes);

type ErrorClass="retryable"|"permanent"|"systemic";
type JobRow={id:number;tenant_id:string;project_id:string;clip_id:string|null;job_type:string;workflow_revision:number;attempts:number;payload:Record<string,unknown>|null;input_fingerprint:string|null};
type ProjectRow={id:string;tenant_id:string;guest_name:string|null;organization_name:string|null;guest_image_url:string|null;source_file_name:string;workflow_revision:number;cover_image_file_id:string|null;cover_image_url:string|null;cover_hook_text:string|null;cover_primary_speaker:string|null;cover_person_positioning:string|null;cover_facial_expression:string|null;cover_gesture_action:string|null;cover_camera_framing:string|null;cover_pose_family:string|null;cover_core_visual:string|null;cover_hook_text_placement:string|null;cover_metadata_revision:number};
type ClipRow={id:string;project_id:string;clip_type:string;transcript_text:string;youtube_title:string|null;hook_text:string|null;primary_speaker:string|null;person_positioning:string|null;facial_expression:string|null;gesture_action:string|null;camera_framing:string|null;pose_family:string|null;core_visual:string|null;hook_text_placement:string|null;thumbnail_generation_revision:number;workflow_revision:number;pipeline_status:string;cover_image_file_id:string|null;cover_image_url:string|null};
type SettingsRow={workflow_enabled:boolean;cover_image_folder_id:string|null;host_reference_name:string|null;host_reference_file_id:string|null;host_reference_url:string|null;text_provider:string;text_model_id:string;image_provider:string;image_model_id:string;ai_config_revision:number};
type PromptProfile={profile_key:string;version:number;system_prompt:string;instruction_prompt:string;config:Record<string,unknown>};

class ImageJobError extends Error{
  code:string;errorClass:ErrorClass;detail:Record<string,unknown>;
  constructor(code:string,message:string,errorClass:ErrorClass="retryable",detail:Record<string,unknown>={}){
    super(message);this.name="ImageJobError";this.code=code;this.errorClass=errorClass;this.detail=detail;
  }
}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json","cache-control":"no-store"}});}
function db():SupabaseClient{
  const url=Deno.env.get("SUPABASE_URL")??"";const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)throw new Error("Supabase service runtime is not configured.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function authorized(req:Request){
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  const auth=req.headers.get("authorization")??"";
  if(serviceKey&&auth==="Bearer "+serviceKey)return true;
  const cron=Deno.env.get("CRON_SECRET")??"";
  return Boolean(cron)&&(req.headers.get("x-cron-secret")??"")===cron;
}
function safeMessage(e:unknown){return e instanceof Error?e.message:String(e);}
function log(event:string,detail:Record<string,unknown>={}){console.log(JSON.stringify({component:"video-thumbnail-generation-dispatcher",event,...detail}));}
function bytesToBase64(bytes:Uint8Array){
  const chunk=0x8000;let binary="";
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));
  return btoa(binary);
}
function base64ToBytes(value:string){const binary=atob(value);const out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
function parseDriveFileId(value:string){
  const v=value.trim();if(!v)return null;
  const direct=v.match(/\/file\/d\/([^/?#]+)/i);if(direct?.[1])return direct[1];
  try{const u=new URL(v);return u.searchParams.get("id")?.trim()||null;}catch{return null;}
}
function normalizeReference(bytes:Uint8Array){
  return ImageMagick.read(bytes,(image):Uint8Array=>{
    const longest=Math.max(image.width,image.height);
    if(longest>1600){const scale=1600/longest;image.resize(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));}
    image.quality=90;
    return image.write(MagickFormat.Jpeg,(data)=>new Uint8Array(data));
  });
}
async function getPrompt(admin:SupabaseClient,job:JobRow,tenantId:string,key:string):Promise<PromptProfile>{
  const requested=Number(job.payload?.prompt_profile_version??0);
  let q=admin.from("ai_operations_video_prompt_profiles")
    .select("profile_key,version,system_prompt,instruction_prompt,config")
    .eq("tenant_id",tenantId).eq("profile_key",key);
  q=requested>0?q.eq("version",requested):q.eq("is_active",true).order("version",{ascending:false}).limit(1);
  const {data,error}=await q.maybeSingle();
  if(error)throw new ImageJobError("prompt_profile_lookup_failed",error.message,"retryable");
  if(!data)throw new ImageJobError("prompt_profile_missing","Prompt profile "+key+" is unavailable.","systemic");
  return data as PromptProfile;
}
async function googleAccessToken(admin:SupabaseClient){
  const {data,error}=await admin.rpc("get_relationship_google_connection_runtime",{p_tenant_id:TENANT_ID,p_connection_type:"drive",p_connection_id:null});
  if(error)throw new ImageJobError("drive_connection_query_failed",error.message,"retryable");
  const runtime=data as any;
  const scopes=Array.isArray(runtime?.scopes)?runtime.scopes.map((x:any)=>String(x)):[];
  const writableScope="https://www.googleapis.com/auth/drive";
  if(!scopes.includes(writableScope)){
    throw new ImageJobError(
      "drive_write_scope_missing",
      "Google Drive is connected read-only. Reauthorize info@valorwell.org with writable Drive access before thumbnail generation can continue.",
      "systemic",
      {scopes}
    );
  }
  const refresh=String(runtime?.refreshToken??"");
  if(!refresh)throw new ImageJobError("drive_connection_missing","Google Drive connection is unavailable.","systemic");
  const clientId=Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_ID")??"";
  const clientSecret=Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_SECRET")??"";
  if(!clientId||!clientSecret)throw new ImageJobError("drive_oauth_config_missing","Google Drive OAuth client is not configured.","systemic");
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:"refresh_token"}),signal:AbortSignal.timeout(20000)});
  const body=await r.json().catch(()=>({}));
  if(!r.ok||!body?.access_token){
    const cls:ErrorClass=(r.status===429||r.status>=500)?"retryable":"systemic";
    throw new ImageJobError("drive_token_refresh_failed","Google Drive token refresh failed ("+r.status+").",cls,{status:r.status});
  }
  return String(body.access_token);
}
async function driveFileMetadata(access:string,fileId:string){
  const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+"?fields=id,name,mimeType,size",{headers:{authorization:"Bearer "+access},signal:AbortSignal.timeout(20000)});
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new ImageJobError("drive_metadata_failed","Drive metadata fetch failed ("+r.status+"): "+String(body?.error?.message??"unknown error"),r.status===429||r.status>=500?"retryable":"permanent");
  return {mimeType:String(body.mimeType??""),size:Number(body.size??0),name:String(body.name??"reference")};
}
async function driveFileBytes(access:string,fileId:string){
  const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId)+"?alt=media",{headers:{authorization:"Bearer "+access},signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new ImageJobError("drive_download_failed","Drive image download failed ("+r.status+").",r.status===429||r.status>=500?"retryable":"permanent");
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(!bytes.length)throw new ImageJobError("reference_empty","Reference image was empty.","permanent");
  if(bytes.byteLength>MAX_REFERENCE_BYTES)throw new ImageJobError("reference_too_large","Reference image exceeds 10 MB.","permanent");
  return bytes;
}
async function publicImageBytes(url:string){
  const r=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw new ImageJobError("reference_http_failed","Reference image request failed ("+r.status+").",r.status===429||r.status>=500?"retryable":"permanent");
  const mime=String(r.headers.get("content-type")??"").split(";")[0].trim().toLowerCase();
  if(!mime.startsWith("image/"))throw new ImageJobError("reference_invalid_mime","Reference URL returned "+(mime||"unknown MIME type")+".","permanent");
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(!bytes.length)throw new ImageJobError("reference_empty","Reference image was empty.","permanent");
  if(bytes.byteLength>MAX_REFERENCE_BYTES)throw new ImageJobError("reference_too_large","Reference image exceeds 10 MB.","permanent");
  return bytes;
}
async function guestReference(admin:SupabaseClient,project:ProjectRow){
  const url=String(project.guest_image_url??"").trim();
  if(!url)throw new ImageJobError("guest_reference_missing","Guest reference image is not configured.","permanent");
  const driveId=parseDriveFileId(url);
  if(driveId){
    const token=await googleAccessToken(admin);const meta=await driveFileMetadata(token,driveId);
    if(!meta.mimeType.startsWith("image/"))throw new ImageJobError("guest_reference_invalid","Guest reference file is not an image.","permanent");
    return {bytes:normalizeReference(await driveFileBytes(token,driveId)),mimeType:"image/jpeg",source:"drive:"+driveId,label:"Guest: "+String(project.guest_name??"Guest")};
  }
  return {bytes:normalizeReference(await publicImageBytes(url)),mimeType:"image/jpeg",source:url,label:"Guest: "+String(project.guest_name??"Guest")};
}
async function hostReference(admin:SupabaseClient,settings:SettingsRow){
  const fileId=String(settings.host_reference_file_id??"").trim();
  if(!fileId)throw new ImageJobError("host_reference_missing","Luke reference image is not configured.","permanent");
  const token=await googleAccessToken(admin);const meta=await driveFileMetadata(token,fileId);
  if(!meta.mimeType.startsWith("image/"))throw new ImageJobError("host_reference_invalid","Luke reference file is not an image.","permanent");
  return {bytes:normalizeReference(await driveFileBytes(token,fileId)),mimeType:"image/jpeg",source:"drive:"+fileId,label:"Luke Predmore (host)"};
}
async function clipReferences(admin:SupabaseClient,clip:ClipRow,project:ProjectRow,settings:SettingsRow){
  const speaker=String(clip.primary_speaker??"").trim().toLowerCase();
  const guestName=String(project.guest_name??"").trim().toLowerCase();
  if(clip.clip_type==="part"){
    if(!guestName || guestName!==speaker){
      throw new ImageJobError("speaker_reference_mismatch","Long-form Part thumbnails must use the episode guest as the only visible person.","permanent",{primary_speaker:clip.primary_speaker,guest_name:project.guest_name});
    }
    return [await guestReference(admin,project)];
  }
  if(speaker==="luke"||speaker==="luke predmore")return [await hostReference(admin,settings)];
  if(guestName!==speaker)throw new ImageJobError("speaker_reference_mismatch","Primary speaker does not match Luke or the project guest.","permanent",{primary_speaker:clip.primary_speaker,guest_name:project.guest_name});
  return [await guestReference(admin,project)];
}
function clipCreativeBrief(clip:ClipRow,project:ProjectRow,aspectRatio:string){
  const referenceRules=clip.clip_type==="part" ? [
    "REFERENCE IMAGE: "+String(project.guest_name??"the episode guest")+".",
    "The guest is the ONLY visible recognizable person in the finished thumbnail.",
    "Do NOT include Luke/the host, a second talking head, a host silhouette, or any other recognizable person.",
    "Build the composition around the guest's expression, posture, gesture, and the Part's story."
  ] : [
    "REFERENCE IMAGE: the selected primary speaker."
  ];
  return [
    "Asset scope: clip",
    "Asset type: "+String(clip.clip_type),
    "Aspect ratio: "+aspectRatio,
    "Guest: "+String(project.guest_name??""),
    ...referenceRules,
    "Exact on-image hook: "+JSON.stringify(String(clip.hook_text??"")),
    "Primary speaker / dominant emotional subject: "+String(clip.primary_speaker??""),
    "Person positioning guidance: "+String(clip.person_positioning??""),
    "Facial expression guidance: "+String(clip.facial_expression??""),
    "Gesture/action guidance: "+String(clip.gesture_action??""),
    "Camera framing guidance: "+String(clip.camera_framing??""),
    "Pose family: "+String(clip.pose_family??""),
    "Core visual: "+String(clip.core_visual??""),
    "Hook placement: "+String(clip.hook_text_placement??""),
    "YouTube title: "+String(clip.youtube_title??""),
    "",
    "SCRIPT / STORY SOURCE:",
    String(clip.transcript_text??"")
  ].join("\n");
}
function projectCreativeBrief(project:ProjectRow,title:string){
  return [
    "Asset scope: full_episode",
    "Aspect ratio: 16:9",
    "Exact on-image hook: "+JSON.stringify(String(project.cover_hook_text??"")),
    "Primary speaker: "+String(project.cover_primary_speaker??project.guest_name??""),
    "Guest: "+String(project.guest_name??""),
    "Organization: "+String(project.organization_name??""),
    "Person positioning: "+String(project.cover_person_positioning??""),
    "Facial expression: "+String(project.cover_facial_expression??""),
    "Gesture/action: "+String(project.cover_gesture_action??""),
    "Camera framing: "+String(project.cover_camera_framing??""),
    "Pose family: "+String(project.cover_pose_family??""),
    "Core visual: "+String(project.cover_core_visual??""),
    "Hook placement: "+String(project.cover_hook_text_placement??""),
    "Full episode YouTube title: "+title
  ].join("\n");
}
async function artDirect(apiKey:string,promptProfile:PromptProfile,brief:string,references:Array<{bytes:Uint8Array;mimeType:string;source:string;label?:string}>,aspectRatio:string){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),90000);
  try{
    const r=await fetch(OPENROUTER_CHAT_URL,{method:"POST",signal:controller.signal,headers:{authorization:"Bearer "+apiKey,"content-type":"application/json","HTTP-Referer":"https://valorwell.org","X-Title":"ValorWell BTY Thumbnail Art Director"},body:JSON.stringify({
      model:String((promptProfile.config as any)?.text_model_override??""),
      temperature:0.2,max_tokens:1800,
      messages:[
        {role:"system",content:promptProfile.system_prompt},
        {role:"user",content:[
          {type:"text",text:promptProfile.instruction_prompt+"\n\n"+brief+"\n\nReference images appear below in the exact order described in the brief.\nTarget aspect ratio: "+aspectRatio},
          ...references.flatMap((ref,i)=>[
            {type:"text",text:"Reference Image "+String.fromCharCode(65+i)+": "+String(ref.label??("Reference "+(i+1)))},
            {type:"image_url",image_url:{url:"data:"+ref.mimeType+";base64,"+bytesToBase64(ref.bytes)}}
          ])
        ]}
      ],
      response_format:{type:"json_schema",json_schema:{name:"bty_thumbnail_art_direction",strict:true,schema:{type:"object",properties:{final_prompt:{type:"string"}},required:["final_prompt"],additionalProperties:false}}}
    })});
    const body=await r.json().catch(()=>({}));
    if(!r.ok){
      const msg=String(body?.error?.message??body?.message??("OpenRouter art direction "+r.status));
      const cls:ErrorClass=(r.status===401||r.status===403||r.status===429||r.status>=500)?"systemic":"permanent";
      throw new ImageJobError("openrouter_art_direction_failed",msg,cls,{status:r.status});
    }
    const content=body?.choices?.[0]?.message?.content;
    if(typeof content!=="string"||!content.trim())throw new ImageJobError("openrouter_art_direction_empty","Art-direction model returned no content.","retryable");
    let parsed:any;try{parsed=JSON.parse(content);}catch{throw new ImageJobError("openrouter_art_direction_invalid_json","Art-direction model returned invalid JSON.","retryable");}
    const prompt=String(parsed?.final_prompt??"").trim();
    if(!prompt)throw new ImageJobError("openrouter_art_direction_prompt_empty","Art-direction prompt was empty.","retryable");
    return {prompt,usage:body?.usage??{},cost:Number.isFinite(Number(body?.usage?.cost))?Number(body.usage.cost):null};
  }catch(e){
    if(e instanceof ImageJobError)throw e;
    throw new ImageJobError("openrouter_art_direction_request_failed",safeMessage(e),"retryable");
  }finally{clearTimeout(timer);}
}
async function generateImage(apiKey:string,textModel:string,imageModel:string,promptProfile:PromptProfile,brief:string,references:Array<{bytes:Uint8Array;mimeType:string;source:string;label?:string}>,aspectRatio:string){
  const effectiveProfile:{profile_key:string;version:number;system_prompt:string;instruction_prompt:string;config:Record<string,unknown>}={
    ...promptProfile,config:{...(promptProfile.config||{}),text_model_override:textModel}
  };
  const directed=await artDirect(apiKey,effectiveProfile,brief,references,aspectRatio);
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
  try{
    const r=await fetch(OPENROUTER_IMAGE_URL,{method:"POST",signal:controller.signal,headers:{authorization:"Bearer "+apiKey,"content-type":"application/json","HTTP-Referer":"https://valorwell.org","X-Title":"ValorWell BTY Thumbnail Generator"},body:JSON.stringify({
      model:imageModel,prompt:directed.prompt,aspect_ratio:aspectRatio,quality:"high",background:"opaque",n:1,
      input_references:references.map(ref=>({type:"image_url",image_url:{url:"data:"+ref.mimeType+";base64,"+bytesToBase64(ref.bytes)}}))
    })});
    const body=await r.json().catch(()=>({}));
    if(!r.ok){
      const msg=String(body?.error?.message??body?.message??("OpenRouter image "+r.status));
      const cls:ErrorClass=(r.status===401||r.status===403||r.status===429||r.status>=500)?"systemic":"permanent";
      throw new ImageJobError("openrouter_image_failed",msg,cls,{status:r.status});
    }
    const image=Array.isArray(body?.data)?body.data[0]:null;const encoded=String(image?.b64_json??"");
    if(!encoded)throw new ImageJobError("openrouter_empty_image","OpenRouter returned no image bytes.","retryable");
    const imageCost=Number.isFinite(Number(body?.usage?.cost))?Number(body.usage.cost):null;
    const costs=[directed.cost,imageCost].filter((x):x is number=>x!==null);
    return {bytes:base64ToBytes(encoded),totalCost:costs.length?costs.reduce((a,b)=>a+b,0):null,imageCost,artCost:directed.cost,imageUsage:body?.usage??{},artUsage:directed.usage,prompt:directed.prompt};
  }catch(e){
    if(e instanceof ImageJobError)throw e;
    throw new ImageJobError("openrouter_image_request_failed",safeMessage(e),"retryable");
  }finally{clearTimeout(timer);}
}
function jpegAt(generated:Uint8Array,width:number,height:number,quality:number){
  return ImageMagick.read(generated,(image):Uint8Array=>{image.resize(width,height);image.quality=quality;return image.write(MagickFormat.Jpeg,(data)=>new Uint8Array(data));});
}
function renderFinalImage(generated:Uint8Array,aspectRatio:string){
  const width=aspectRatio==="9:16"?1080:1280;const height=aspectRatio==="9:16"?1920:720;
  const qualities=[88,82,76,70,64,58];let out=new Uint8Array();
  for(const q of qualities){out=jpegAt(generated,width,height,q);if(out.byteLength<=MAX_YOUTUBE_THUMBNAIL_BYTES)return {bytes:out,width,height,quality:q};}
  const sw=aspectRatio==="9:16"?960:1152;const sh=aspectRatio==="9:16"?1707:648;
  out=jpegAt(generated,sw,sh,56);
  return {bytes:out,width:sw,height:sh,quality:56};
}
async function uploadDriveFile(access:string,folderId:string,fileName:string,bytes:Uint8Array){
  const boundary="valorwell-thumbnail-"+crypto.randomUUID();
  const meta={name:fileName,parents:[folderId],mimeType:"image/jpeg"};
  const body=new Blob(["--"+boundary+"\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",JSON.stringify(meta),"\r\n--"+boundary+"\r\nContent-Type: image/jpeg\r\n\r\n",bytes,"\r\n--"+boundary+"--\r\n"]);
  const r=await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",{method:"POST",headers:{authorization:"Bearer "+access,"content-type":"multipart/related; boundary="+boundary},body,signal:AbortSignal.timeout(45000)});
  const result=await r.json().catch(()=>({}));
  if(!r.ok||!result?.id)throw new ImageJobError("drive_upload_failed","Drive thumbnail upload failed ("+r.status+"): "+String(result?.error?.message??"unknown error"),r.status===429||r.status>=500?"retryable":"permanent",{status:r.status});
  const id=String(result.id);return {id,url:"https://drive.google.com/file/d/"+encodeURIComponent(id)+"/view"};
}
async function deleteDriveFile(access:string,fileId:string){
  const r=await fetch("https://www.googleapis.com/drive/v3/files/"+encodeURIComponent(fileId),{method:"DELETE",headers:{authorization:"Bearer "+access},signal:AbortSignal.timeout(20000)});
  if(!r.ok&&r.status!==404)log("orphan_cleanup_failed",{fileId,status:r.status});
}
async function completeJob(admin:SupabaseClient,job:JobRow,result:Record<string,unknown>){
  const {error}=await admin.rpc("complete_ai_operations_video_job",{p_job_id:job.id,p_worker_id:WORKER_ID,p_result:result});
  if(error)throw new ImageJobError("job_complete_failed",error.message,"retryable");
}
async function failJob(admin:SupabaseClient,job:JobRow,e:ImageJobError){
  const {data,error}=await admin.rpc("fail_ai_operations_video_job",{p_job_id:job.id,p_worker_id:WORKER_ID,p_error_code:e.code,p_error_class:e.errorClass,p_error_message:e.message,p_result:{worker:WORKER_ID,...e.detail}});
  if(error)throw new Error("Failed to record image job failure: "+error.message);
  return String(data??"");
}
async function loadSettings(admin:SupabaseClient,tenantId:string):Promise<SettingsRow>{
  const {data,error}=await admin.from("ai_operations_video_settings").select("workflow_enabled,cover_image_folder_id,host_reference_name,host_reference_file_id,host_reference_url,text_provider,text_model_id,image_provider,image_model_id,ai_config_revision").eq("tenant_id",tenantId).maybeSingle();
  if(error)throw new ImageJobError("settings_lookup_failed",error.message,"retryable");
  if(!data)throw new ImageJobError("settings_missing","Video settings are missing.","systemic");
  if(!data.workflow_enabled)throw new ImageJobError("workflow_disabled","BTY workflow is disabled.","permanent");
  if(String(data.image_provider)!=="openrouter"||String(data.text_provider)!=="openrouter")throw new ImageJobError("provider_unsupported","BTY image worker currently requires OpenRouter for text and image models.","permanent");
  if(!String(data.cover_image_folder_id??"").trim())throw new ImageJobError("cover_folder_missing","YouTube Cover Images folder is not configured.","systemic");
  return data as SettingsRow;
}
async function loadProject(admin:SupabaseClient,id:string):Promise<ProjectRow>{
  const {data,error}=await admin.from("ai_operations_video_projects").select("id,tenant_id,guest_name,organization_name,guest_image_url,source_file_name,workflow_revision,cover_image_file_id,cover_image_url,cover_hook_text,cover_primary_speaker,cover_person_positioning,cover_facial_expression,cover_gesture_action,cover_camera_framing,cover_pose_family,cover_core_visual,cover_hook_text_placement,cover_metadata_revision").eq("id",id).maybeSingle();
  if(error)throw new ImageJobError("project_lookup_failed",error.message,"retryable");
  if(!data)throw new ImageJobError("project_missing","Image project no longer exists.","permanent");
  return data as ProjectRow;
}
async function applyClipImage(admin:SupabaseClient,job:JobRow,uploaded:{id:string;url:string},details:Record<string,unknown>){
  if(!job.clip_id)throw new ImageJobError("clip_id_missing","Clip thumbnail job has no clip_id.","permanent");
  const {data:clip,error}=await admin.from("ai_operations_video_clips").select("id,workflow_revision,thumbnail_generation_revision,cover_image_file_id").eq("id",job.clip_id).maybeSingle();
  if(error)throw new ImageJobError("clip_recheck_failed",error.message,"retryable");
  if(!clip)throw new ImageJobError("clip_missing","Clip no longer exists.","permanent");
  const requestedRevision=Number(job.payload?.generation_revision??-1);
  if(Number(clip.workflow_revision)!==Number(job.workflow_revision)||Number(clip.thumbnail_generation_revision)!==requestedRevision){
    const token=await googleAccessToken(admin);await deleteDriveFile(token,uploaded.id);await completeJob(admin,job,{...details,applied:false,skipped:"stale_clip_revision"});return {applied:false,reason:"stale_clip_revision"};
  }
  const now=new Date().toISOString();
  const {error:updateError}=await admin.from("ai_operations_video_clips").update({cover_image_file_id:uploaded.id,cover_image_url:uploaded.url,thumbnail_input_fingerprint:job.input_fingerprint,pipeline_status:"thumbnail_ready",last_progress_at:now,updated_at:now}).eq("id",job.clip_id).eq("workflow_revision",job.workflow_revision).eq("thumbnail_generation_revision",requestedRevision);
  if(updateError)throw new ImageJobError("clip_cover_update_failed",updateError.message,"retryable");
  const {error:pubError}=await admin.from("ai_operations_social_publications").update({thumbnail_file_id:uploaded.id,thumbnail_url:uploaded.url,updated_at:now}).eq("clip_id",job.clip_id).in("status",["draft","ready","approved"]);
  if(pubError)throw new ImageJobError("clip_publication_thumbnail_failed",pubError.message,"retryable");
  await completeJob(admin,job,{...details,applied:true,file_id:uploaded.id,file_url:uploaded.url});return {applied:true};
}
async function applyProjectImage(admin:SupabaseClient,job:JobRow,uploaded:{id:string;url:string},details:Record<string,unknown>){
  const {data:project,error}=await admin.from("ai_operations_video_projects").select("id,workflow_revision,cover_metadata_revision").eq("id",job.project_id).maybeSingle();
  if(error)throw new ImageJobError("project_recheck_failed",error.message,"retryable");
  if(!project)throw new ImageJobError("project_missing","Project no longer exists.","permanent");
  const requestedRevision=Number(job.payload?.generation_revision??-1);
  if(Number(project.workflow_revision)!==Number(job.workflow_revision)||Number((project as any).cover_metadata_revision??-1)!==requestedRevision){
    const token=await googleAccessToken(admin);await deleteDriveFile(token,uploaded.id);await completeJob(admin,job,{...details,applied:false,skipped:"stale_project_revision"});return {applied:false,reason:"stale_project_revision"};
  }
  const now=new Date().toISOString();
  const {error:updateError}=await admin.from("ai_operations_video_projects").update({cover_image_file_id:uploaded.id,cover_image_url:uploaded.url,cover_input_fingerprint:job.input_fingerprint,last_progress_at:now,updated_at:now}).eq("id",job.project_id).eq("workflow_revision",job.workflow_revision);
  if(updateError)throw new ImageJobError("project_cover_update_failed",updateError.message,"retryable");
  const {error:pubError}=await admin.from("ai_operations_social_publications").update({thumbnail_file_id:uploaded.id,thumbnail_url:uploaded.url,updated_at:now}).eq("project_id",job.project_id).eq("source_type","project").in("status",["draft","ready","approved"]);
  if(pubError)throw new ImageJobError("project_publication_thumbnail_failed",pubError.message,"retryable");
  await completeJob(admin,job,{...details,applied:true,file_id:uploaded.id,file_url:uploaded.url});return {applied:true};
}
async function processJob(admin:SupabaseClient,job:JobRow){
  const key=Deno.env.get("OPENROUTER_API_KEY")??"";
  if(!key)throw new ImageJobError("openrouter_key_missing","OPENROUTER_API_KEY is not configured.","systemic");
  const project=await loadProject(admin,job.project_id);
  if(Number(project.workflow_revision)!==Number(job.workflow_revision)){await completeJob(admin,job,{applied:false,skipped:"stale_workflow_revision"});return {status:"skipped_stale"};}
  const settings=await loadSettings(admin,project.tenant_id);
  // Validate writable Drive authorization before any paid image generation work.
  const driveToken=await googleAccessToken(admin);
  const imageModel=String(settings.image_model_id||"openai/gpt-image-2.5-sunburst");
  const textModel=String(settings.text_model_id||"z-ai/glm-5.3-flash");
  const promptKey=String(job.payload?.prompt_profile??(job.job_type==="generate_project_cover"?"bty_image_full_cover":""));
  if(!promptKey)throw new ImageJobError("prompt_profile_missing","Image job did not specify a prompt profile.","systemic");
  const promptProfile=await getPrompt(admin,job,project.tenant_id,promptKey);
  const cachedId=String(job.payload?.image_uploaded_file_id??"");const cachedUrl=String(job.payload?.image_uploaded_file_url??"");
  if(cachedId&&cachedUrl){
    const details={reused_uploaded_file:true,image_model:imageModel,text_model:textModel};
    return job.job_type==="generate_project_cover"?applyProjectImage(admin,job,{id:cachedId,url:cachedUrl},details):applyClipImage(admin,job,{id:cachedId,url:cachedUrl},details);
  }

  let references:Array<{bytes:Uint8Array;mimeType:string;source:string;label?:string}>=[];let brief="";let aspectRatio="16:9";let assetName="";
  if(job.job_type==="generate_project_cover"){
    if(project.cover_image_file_id){await completeJob(admin,job,{applied:false,skipped:"project_cover_already_exists"});return {status:"skipped_existing"};}
    const {data:publication,error:pubError}=await admin.from("ai_operations_social_publications").select("title").eq("project_id",project.id).eq("source_type","project").in("status",["draft","ready","approved","upload_queued","uploading","uploaded","scheduled"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
    if(pubError)throw new ImageJobError("project_publication_lookup_failed",pubError.message,"retryable");
    const title=String(publication?.title??"").trim();if(!title)throw new ImageJobError("project_title_missing","Full-episode publication title is not ready.","retryable");
    if(!String(project.cover_hook_text??"").trim()||!String(project.cover_primary_speaker??"").trim()||!String(project.cover_person_positioning??"").trim()||!String(project.cover_facial_expression??"").trim()||!String(project.cover_gesture_action??"").trim()||!String(project.cover_camera_framing??"").trim()||!String(project.cover_pose_family??"").trim()){
      throw new ImageJobError("project_cover_metadata_missing","Full-episode cover creative metadata is incomplete.","retryable");
    }
    references=[await guestReference(admin,project)];brief=projectCreativeBrief(project,title);aspectRatio="16:9";
    assetName="project-"+project.id+"-cover-r"+job.workflow_revision+"-"+String(job.input_fingerprint??"image").slice(0,10)+".jpg";
  }else if(job.job_type==="generate_thumbnail"){
    if(!job.clip_id)throw new ImageJobError("clip_id_missing","Thumbnail job has no clip_id.","permanent");
    const {data,error}=await admin.from("ai_operations_video_clips").select("id,project_id,clip_type,transcript_text,youtube_title,hook_text,primary_speaker,person_positioning,facial_expression,gesture_action,camera_framing,pose_family,core_visual,hook_text_placement,thumbnail_generation_revision,workflow_revision,pipeline_status,cover_image_file_id,cover_image_url").eq("id",job.clip_id).maybeSingle();
    if(error)throw new ImageJobError("clip_lookup_failed",error.message,"retryable");
    if(!data)throw new ImageJobError("clip_missing","Thumbnail clip no longer exists.","permanent");
    const clip=data as ClipRow;const requestedRevision=Number(job.payload?.generation_revision??-1);
    if(Number(clip.workflow_revision)!==Number(job.workflow_revision)||Number(clip.thumbnail_generation_revision)!==requestedRevision){await completeJob(admin,job,{applied:false,skipped:"stale_clip_revision"});return {status:"skipped_stale"};}
    if(clip.cover_image_file_id){await completeJob(admin,job,{applied:false,skipped:"clip_cover_already_exists"});return {status:"skipped_existing"};}
    if(!String(clip.hook_text??"").trim())throw new ImageJobError("hook_text_missing","Clip hook_text is empty.","permanent");
    references=await clipReferences(admin,clip,project,settings);aspectRatio=clip.clip_type==="short"?"9:16":"16:9";brief=clipCreativeBrief(clip,project,aspectRatio);
    assetName="clip-"+clip.id+"-"+clip.clip_type+"-r"+requestedRevision+"-"+String(job.input_fingerprint??"image").slice(0,10)+".jpg";
  }else throw new ImageJobError("unsupported_job_type","Unsupported image job: "+job.job_type,"permanent");

  if(!references.length)throw new ImageJobError("reference_missing","No image references were resolved.","permanent");
  const generated=await generateImage(key,textModel,imageModel,promptProfile,brief,references,aspectRatio);
  const final=renderFinalImage(generated.bytes,aspectRatio);
  if(!final.bytes.length)throw new ImageJobError("final_image_empty","Final image bytes were empty.","retryable");
  if(final.bytes.byteLength>2000000)throw new ImageJobError("final_image_too_large","Compressed thumbnail is "+final.bytes.byteLength+" bytes; YouTube limit is 2 MB.","retryable");

  const uploaded=await uploadDriveFile(driveToken,String(settings.cover_image_folder_id),assetName,final.bytes);
  const payload={...(job.payload??{}),image_uploaded_file_id:uploaded.id,image_uploaded_file_url:uploaded.url,image_model:imageModel,text_model:textModel,prompt_profile:promptProfile.profile_key,prompt_profile_version:promptProfile.version,art_directed_prompt:generated.prompt,reference_sources:references.map(r=>({label:r.label??null,source:r.source})),reference_count:references.length,output_bytes:final.bytes.byteLength,output_width:final.width,output_height:final.height,jpeg_quality:final.quality,aspect_ratio:aspectRatio,openrouter_cost_usd:generated.totalCost,art_direction_cost_usd:generated.artCost,image_cost_usd:generated.imageCost};
  const {error:payloadError}=await admin.from("ai_operations_video_jobs").update({payload,updated_at:new Date().toISOString()}).eq("id",job.id).eq("claimed_by",WORKER_ID).eq("status","running");
  if(payloadError){try{await deleteDriveFile(driveToken,uploaded.id);}catch(_){}throw new ImageJobError("job_payload_checkpoint_failed",payloadError.message,"retryable");}
  const details={image_model:imageModel,text_model:textModel,prompt_profile:promptProfile.profile_key,prompt_profile_version:promptProfile.version,aspect_ratio:aspectRatio,output_bytes:final.bytes.byteLength,output_width:final.width,output_height:final.height,jpeg_quality:final.quality,reference_sources:references.map(r=>({label:r.label??null,source:r.source})),reference_count:references.length,openrouter_cost_usd:generated.totalCost,art_direction_cost_usd:generated.artCost,image_cost_usd:generated.imageCost,art_direction_usage:generated.artUsage,image_usage:generated.imageUsage};
  return job.job_type==="generate_project_cover"?applyProjectImage(admin,{...job,payload},uploaded,details):applyClipImage(admin,{...job,payload},uploaded,details);
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  if(!authorized(req))return json({error:"Unauthorized"},401);
  const admin=db();let job:JobRow|null=null;
  try{
    const {data:claimed,error:claimError}=await admin.rpc("claim_next_ai_operations_video_job",{p_worker_id:WORKER_ID,p_job_types:JOB_TYPES,p_lease_seconds:600});
    if(claimError)throw new Error(claimError.message);
    job=(Array.isArray(claimed)?claimed[0]:null) as JobRow|null;
    if(!job){
      await admin.rpc("heartbeat_ai_operations_video_worker",{p_worker_id:WORKER_ID,p_tenant_id:TENANT_ID,p_status:"idle",p_current_job_id:null,p_current_project_id:null,p_worker_version:"2.1.0",p_last_error:null,p_metadata:{job_types:JOB_TYPES}});
      return json({ok:true,status:"idle"});
    }
    await admin.rpc("heartbeat_ai_operations_video_worker",{p_worker_id:WORKER_ID,p_tenant_id:job.tenant_id,p_status:"working",p_current_job_id:job.id,p_current_project_id:job.project_id,p_worker_version:"2.1.0",p_last_error:null,p_metadata:{job_type:job.job_type}});
    const result=await processJob(admin,job);
    return json({ok:true,job_id:job.id,job_type:job.job_type,result});
  }catch(e){
    const err=e instanceof ImageJobError?e:new ImageJobError("unexpected_image_worker_error",safeMessage(e),"retryable");
    log("job_failed",{job_id:job?.id??null,code:err.code,error_class:err.errorClass,error:err.message});
    if(job){
      try{const next=await failJob(admin,job,err);return json({ok:false,job_id:job.id,status:next,error_code:err.code,error:err.message},next==="error"?500:202);}
      catch(recordError){return json({ok:false,job_id:job.id,error:err.message,failure_record_error:safeMessage(recordError)},500);}
    }
    await admin.rpc("heartbeat_ai_operations_video_worker",{p_worker_id:WORKER_ID,p_tenant_id:TENANT_ID,p_status:"error",p_current_job_id:null,p_current_project_id:null,p_worker_version:"2.1.0",p_last_error:err.message,p_metadata:{error_code:err.code}});
    return json({ok:false,error_code:err.code,error:err.message},500);
  }
});
