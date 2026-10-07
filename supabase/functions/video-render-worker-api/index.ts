
import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const TOKEN_HASH = "28e446130b1c7194b6980042480b682cb09581ece3db39d2a9e3ca06c079e0e5";
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "valorwell-video-worker";
const GITHUB_REPOSITORY = "LPredmore/valorwell-media";
const GITHUB_REPOSITORY_ID = "1180964076";
const GITHUB_OWNER_ID = "124374222";
const GITHUB_WORKFLOW_REF = "LPredmore/valorwell-media/.github/workflows/video-short-render-worker.yml@refs/heads/main";
const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks")
);

function db() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Supabase service runtime is not configured.");
  return createClient(url, key, { auth: { persistSession:false, autoRefreshToken:false } });
}
function json(body:unknown,status=200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type":"application/json", "cache-control":"no-store" }
  });
}
async function sha256Hex(value:string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...d].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function authorized(req:Request) {
  const legacyToken = req.headers.get("x-render-worker-token") ?? "";
  if (legacyToken.length > 20 && await sha256Hex(legacyToken) === TOKEN_HASH) {
    return true;
  }

  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, GITHUB_JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: GITHUB_OIDC_AUDIENCE,
    });
    const eventName = String(payload.event_name ?? "");
    return (
      String(payload.repository ?? "") === GITHUB_REPOSITORY &&
      String(payload.repository_id ?? "") === GITHUB_REPOSITORY_ID &&
      String(payload.repository_owner_id ?? "") === GITHUB_OWNER_ID &&
      String(payload.ref ?? "") === "refs/heads/main" &&
      ["push", "workflow_dispatch", "schedule"].includes(eventName) &&
      String(payload.workflow_ref ?? "") === GITHUB_WORKFLOW_REF &&
      String(payload.runner_environment ?? "") === "github-hosted"
    );
  } catch (error) {
    console.error(JSON.stringify({
      component:"video-render-worker-api",
      auth:"github_oidc",
      error:error instanceof Error ? error.message : String(error)
    }));
    return false;
  }
}
async function cleanupCloudflareClip(uid:string){
  const clipUid=String(uid??"").trim();
  if(!clipUid) return;
  const account=Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
  const token=Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "";
  if(!account||!token) return;
  try{
    const r=await fetch(
      "https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account)+"/stream/"+encodeURIComponent(clipUid),
      {method:"DELETE",headers:{authorization:"Bearer "+token}}
    );
    if(!r.ok){
      console.error(JSON.stringify({component:"video-render-worker-api",event:"cloudflare_cleanup_failed",uid:clipUid,status:r.status}));
    }
  }catch(error){
    console.error(JSON.stringify({
      component:"video-render-worker-api",event:"cloudflare_cleanup_failed",uid:clipUid,
      error:error instanceof Error?error.message:String(error)
    }));
  }
}

async function googleAccessToken(admin:any) {
  const { data, error } = await admin.rpc("get_relationship_google_connection_runtime", {
    p_tenant_id:TENANT_ID,
    p_connection_type:"drive",
    p_connection_id:null
  });
  if (error) throw new Error(error.message);
  if (!data?.refreshToken) throw new Error("Google Drive connection is unavailable.");

  const clientId = Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) throw new Error("Google OAuth client is not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      client_id:clientId,
      client_secret:clientSecret,
      refresh_token:String(data.refreshToken),
      grant_type:"refresh_token"
    })
  });
  const body = await response.json().catch(()=>({}));
  if (!response.ok || !body?.access_token) {
    throw new Error("Google Drive access-token refresh failed ("+response.status+").");
  }
  return {
    access_token:String(body.access_token),
    expires_in:Number(body.expires_in ?? 3600)
  };
}


Deno.serve(async (req:Request) => {
  if (req.method !== "POST") return json({error:"Method not allowed"},405);
  if (!await authorized(req)) return json({error:"Unauthorized"},401);

  const input = await req.json().catch(()=>({})) as any;
  const action = String(input.action ?? "");
  const workerId = String(input.worker_id ?? "").slice(0,200);
  if (!workerId) return json({error:"worker_id is required"},400);
  const admin = db();

  try {
    if (action === "claim") {
      const {data:claimed,error:claimErr}=await admin.rpc("claim_next_video_render_job",{
        p_worker_id:workerId,p_worker_category:"video_render_ffmpeg",p_lease_seconds:1200
      });
      if(claimErr) throw new Error(claimErr.message);
      const job=Array.isArray(claimed)?claimed[0]:null;
      if(!job) return json({ok:true,jobs:[]});

      const {data:clip,error:cErr}=await admin.from("ai_operations_video_clips")
        .select("id,project_id,parent_file_id,start_seconds,end_seconds,transcript_text,clip_type,status,cold_open_enabled,cold_open_start_seconds,cold_open_end_seconds,cold_open_text,cold_open_score,cold_open_reason")
        .eq("id",job.clip_id).maybeSingle();
      if(cErr||!clip) throw new Error(cErr?.message ?? "Video clip not found.");
      if(String(clip.clip_type)!=="short") throw new Error("FFmpeg worker received a non-short clip.");

      const {data:project,error:pErr}=await admin.from("ai_operations_video_projects")
        .select("id,source_file_id,source_file_name,source_mime_type,source_size_bytes")
        .eq("id",job.project_id).maybeSingle();
      if(pErr||!project) throw new Error(pErr?.message ?? "Video project not found.");

      const {data:settings,error:sErr}=await admin.from("ai_operations_video_settings")
        .select("short_clip_folder_id").eq("tenant_id",TENANT_ID).maybeSingle();
      if(sErr||!settings?.short_clip_folder_id) throw new Error(sErr?.message ?? "Shorts Drive folder is not configured.");

      const now=new Date().toISOString();
      await admin.from("ai_operations_video_clips").update({
        status:"rendering",pipeline_status:"rendering",updated_at:now
      }).eq("id",clip.id);

      const token=await googleAccessToken(admin);
      return json({
        ok:true,
        project:{
          id:project.id,parent_file_id:project.source_file_id,
          source_file_name:project.source_file_name,source_mime_type:project.source_mime_type,
          source_size_bytes:project.source_size_bytes
        },
        output_folder_id:settings.short_clip_folder_id,
        google_access_token:token.access_token,
        google_token_expires_in:token.expires_in,
        jobs:[(()=>{
          const clipStart=Number(clip.start_seconds);
          const clipEnd=Number(clip.end_seconds);
          const clipDuration=Math.max(0,clipEnd-clipStart);
          const absColdStart=Number(clip.cold_open_start_seconds);
          const absColdEnd=Number(clip.cold_open_end_seconds);
          const requestedCold=Boolean(clip.cold_open_enabled);
          const relColdStart=absColdStart-clipStart;
          const relColdEnd=absColdEnd-clipStart;
          const coldDuration=relColdEnd-relColdStart;
          const validCold=requestedCold
            && Number.isFinite(relColdStart)&&Number.isFinite(relColdEnd)
            && relColdStart>=-0.05&&relColdEnd<=clipDuration+0.05
            && coldDuration>=1.999&&coldDuration<=6.001
            && clipDuration+coldDuration<180;
          return {
            job_id:job.id,clip_id:clip.id,project_id:clip.project_id,parent_file_id:clip.parent_file_id,
            start_seconds:clipStart,end_seconds:clipEnd,
            transcript_text:clip.transcript_text,
            source_url:String(job?.payload?.cloudflare_download_url ?? ""),
            cold_open_enabled:validCold,
            cold_open_start_seconds:validCold?Math.max(0,relColdStart):null,
            cold_open_end_seconds:validCold?Math.min(clipDuration,relColdEnd):null,
            cold_open_text:validCold?String(clip.cold_open_text??""):null,
            cold_open_score:validCold?Number(clip.cold_open_score??0):null,
            cold_open_reason:String(clip.cold_open_reason??"")
          };
        })()]
      });
    }

    if (action === "drive_token") {
      const {data:active,error:aErr}=await admin.from("ai_operations_video_jobs")
        .select("id").eq("job_type","render_clip").eq("claimed_by",workerId)
        .in("status",["claimed","running"]).limit(1);
      if(aErr) throw new Error(aErr.message);
      if(!active?.length) return json({error:"No active jobs for this worker"},403);
      const token=await googleAccessToken(admin);
      return json({ok:true,google_access_token:token.access_token,google_token_expires_in:token.expires_in});
    }

    if (action === "heartbeat") {
      const ids=Array.isArray(input.job_ids)?input.job_ids.map(Number).filter(Number.isFinite):[];
      if(!ids.length) return json({ok:true,updated:0});
      const now=new Date(); const lease=new Date(now.getTime()+20*60*1000).toISOString();
      const {data:rows,error}=await admin.from("ai_operations_video_jobs")
        .update({status:"running",lease_expires_at:lease,updated_at:now.toISOString()})
        .in("id",ids).eq("claimed_by",workerId).in("status",["claimed","running"])
        .select("id,clip_id,project_id");
      if(error) throw new Error(error.message);
      await admin.rpc("heartbeat_ai_operations_video_worker",{
        p_worker_id:workerId,p_tenant_id:TENANT_ID,p_status:"working",
        p_current_job_id:rows?.[0]?.id??null,p_current_project_id:rows?.[0]?.project_id??null,
        p_worker_version:"2.1.0",p_last_error:null,p_metadata:{worker_category:"video_render_ffmpeg"}
      });
      return json({ok:true,updated:rows?.length??0});
    }

    if (action === "complete") {
      const jobId=Number(input.job_id); const clipId=String(input.clip_id??"");
      const driveFileId=String(input.drive_file_id??""); const driveFileUrl=String(input.drive_file_url??"");
      const outputSize=Number(input.output_size_bytes??0);
      const coldOpenApplied=Boolean(input.cold_open_applied);
      const coldOpenDuration=Number(input.cold_open_duration_seconds??0);
      if(!jobId||!clipId||!driveFileId||!driveFileUrl) return json({error:"Completion fields are incomplete"},400);

      const {data:job,error:jErr}=await admin.from("ai_operations_video_jobs")
        .select("id,clip_id,status,claimed_by,payload").eq("id",jobId).eq("clip_id",clipId)
        .eq("job_type","render_clip").maybeSingle();
      if(jErr||!job) return json({error:"Render job not found"},404);
      if(String(job.claimed_by??"")!==workerId) return json({error:"Render job belongs to another worker"},409);

      const now=new Date().toISOString();
      const {error:cErr}=await admin.from("ai_operations_video_clips").update({
        drive_file_id:driveFileId,drive_file_url:driveFileUrl,output_mime_type:"video/mp4",
        output_size_bytes:Number.isFinite(outputSize)&&outputSize>0?outputSize:null,
        status:"rendered",rendered_at:now,error_message:null,pipeline_status:"rendered",
        render_input_fingerprint:job.input_fingerprint,
        last_progress_at:now,updated_at:now
      }).eq("id",clipId);
      if(cErr) throw new Error(cErr.message);

      const payload={
        ...(job.payload??{}),cloudflare_stage:"drive_complete",drive_file_id:driveFileId,
        render_method:coldOpenApplied
          ?"ffmpeg_blurred_background_preserve_frame_payoff_cold_open_v1"
          :"ffmpeg_blurred_background_preserve_frame",
        render_profile:"youtube_short_9x16",
        render_width:1080,render_height:1920,render_verified_by:"ffprobe",
        cold_open_applied:coldOpenApplied,
        cold_open_duration_seconds:Number.isFinite(coldOpenDuration)&&coldOpenDuration>0?coldOpenDuration:null
      };
      const {error:pErr}=await admin.from("ai_operations_video_jobs").update({payload,updated_at:now})
        .eq("id",jobId).eq("claimed_by",workerId).eq("status","running");
      if(pErr) throw new Error(pErr.message);

      const {error:completeErr}=await admin.rpc("complete_ai_operations_video_job",{
        p_job_id:jobId,p_worker_id:workerId,
        p_result:{
          drive_file_id:driveFileId,drive_file_url:driveFileUrl,output_size_bytes:outputSize,
          render_profile:"youtube_short_9x16",cold_open_applied:coldOpenApplied,
          cold_open_duration_seconds:Number.isFinite(coldOpenDuration)&&coldOpenDuration>0?coldOpenDuration:null
        }
      });
      if(completeErr) throw new Error(completeErr.message);
      await cleanupCloudflareClip(String(job.payload?.cloudflare_clip_uid??""));
      return json({ok:true,cold_open_applied:coldOpenApplied});
    }

    if (action === "fail") {
      const jobId=Number(input.job_id); const clipId=String(input.clip_id??"");
      const message=String(input.error??"Render failed.").slice(0,4000);
      if(!jobId||!clipId) return json({error:"Failure fields are incomplete"},400);

      const {data:job,error:jErr}=await admin.from("ai_operations_video_jobs")
        .select("id,clip_id,claimed_by").eq("id",jobId).eq("clip_id",clipId)
        .eq("job_type","render_clip").maybeSingle();
      if(jErr||!job) return json({error:"Render job not found"},404);
      if(String(job.claimed_by??"")!==workerId) return json({error:"Render job belongs to another worker"},409);

      const permanent=/invalid input|unsupported|non-short/i.test(message);
      const {data:next,error:fErr}=await admin.rpc("fail_ai_operations_video_job",{
        p_job_id:jobId,p_worker_id:workerId,p_error_code:permanent?"ffmpeg_input_invalid":"ffmpeg_render_failed",
        p_error_class:permanent?"permanent":"retryable",p_error_message:message,p_result:{worker:"video-render-worker-api"}
      });
      if(fErr) throw new Error(fErr.message);

      await admin.from("ai_operations_video_clips").update({
        status:next==="error"?"error":"render_queued",error_message:message,updated_at:new Date().toISOString()
      }).eq("id",clipId);
      return json({ok:true,status:next});
    }

    return json({error:"Unknown action"},400);
  } catch (e) {
    const message=e instanceof Error?e.message:String(e);
    console.error(JSON.stringify({component:"video-render-worker-api",action,workerId,error:message}));
    return json({error:message},500);
  }
});
