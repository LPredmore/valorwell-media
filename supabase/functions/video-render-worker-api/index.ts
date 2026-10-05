
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
      const { data:candidateRows, error:candidateErr } = await admin
        .from("ai_operations_video_jobs")
        .select("id,project_id,clip_id,attempts,created_at")
        .eq("job_type","render_clip")
        .eq("status","queued")
        .order("created_at",{ascending:true})
        .order("id",{ascending:true})
        .limit(100);
      if (candidateErr) throw new Error(candidateErr.message);
      if (!candidateRows?.length) return json({ok:true,jobs:[]});

      const candidateClipIds = candidateRows.map((x:any)=>x.clip_id).filter(Boolean);
      const { data:candidateClips, error:clipRouteErr } = await admin
        .from("ai_operations_video_clips")
        .select("id,project_id,clip_type")
        .in("id",candidateClipIds);
      if (clipRouteErr) throw new Error(clipRouteErr.message);

      const shortClipIds = new Set(
        (candidateClips ?? [])
          .filter((x:any)=>String(x.clip_type ?? "") === "short")
          .map((x:any)=>String(x.id))
      );
      const firstShort = candidateRows.find((x:any)=>shortClipIds.has(String(x.clip_id)));
      if (!firstShort) return json({ok:true,jobs:[]});

      const projectId = String(firstShort.project_id);
      const queuedRows = candidateRows.filter(
        (x:any)=>String(x.project_id) === projectId && shortClipIds.has(String(x.clip_id))
      );

      const claimed:any[] = [];
      const now = new Date().toISOString();
      for (const row of queuedRows ?? []) {
        const { data:won, error:uErr } = await admin
          .from("ai_operations_video_jobs")
          .update({
            status:"claimed",
            claimed_by:workerId,
            claimed_at:now,
            started_at:now,
            updated_at:now,
            error_message:null
          })
          .eq("id",row.id)
          .eq("status","queued")
          .select("id,project_id,clip_id,attempts");
        if (uErr) throw new Error(uErr.message);
        if (won?.length) claimed.push(won[0]);
      }
      if (!claimed.length) return json({ok:true,jobs:[]});

      const clipIds = claimed.map(x=>x.clip_id);
      const { data:clips, error:cErr } = await admin
        .from("ai_operations_video_clips")
        .select("id,project_id,parent_file_id,start_seconds,end_seconds,transcript_text,clip_type,status")
        .in("id",clipIds);
      if (cErr) throw new Error(cErr.message);

      const { data:projects, error:pErr } = await admin
        .from("ai_operations_video_projects")
        .select("id,source_file_id,source_file_name,source_mime_type,source_size_bytes")
        .eq("id",projectId)
        .limit(1);
      if (pErr || !projects?.length) throw new Error(pErr?.message ?? "Video project not found.");

      const { data:settingsRows, error:sErr } = await admin
        .from("ai_operations_video_settings")
        .select("short_clip_folder_id")
        .eq("tenant_id",TENANT_ID)
        .limit(1);
      if (sErr || !settingsRows?.length || !settingsRows[0].short_clip_folder_id) {
        throw new Error(sErr?.message ?? "Shorts Drive folder is not configured.");
      }

      const jobByClip = new Map(claimed.map(j=>[String(j.clip_id),j]));
      const jobs = (clips ?? []).map((c:any)=>({
        job_id:jobByClip.get(String(c.id))?.id,
        clip_id:c.id,
        project_id:c.project_id,
        parent_file_id:c.parent_file_id,
        start_seconds:Number(c.start_seconds),
        end_seconds:Number(c.end_seconds),
        transcript_text:c.transcript_text
      })).sort((a:any,b:any)=>a.start_seconds-b.start_seconds);

      await admin.from("ai_operations_video_clips")
        .update({status:"rendering",updated_at:now})
        .in("id",clipIds);

      const token = await googleAccessToken(admin);
      return json({
        ok:true,
        project:{
          id:projects[0].id,
          parent_file_id:projects[0].source_file_id,
          source_file_name:projects[0].source_file_name,
          source_mime_type:projects[0].source_mime_type,
          source_size_bytes:projects[0].source_size_bytes
        },
        output_folder_id:settingsRows[0].short_clip_folder_id,
        google_access_token:token.access_token,
        google_token_expires_in:token.expires_in,
        jobs
      });
    }

    if (action === "drive_token") {
      const { data:active, error:aErr } = await admin
        .from("ai_operations_video_jobs")
        .select("id")
        .eq("job_type","render_clip")
        .eq("claimed_by",workerId)
        .in("status",["claimed","running"])
        .limit(1);
      if (aErr) throw new Error(aErr.message);
      if (!active?.length) return json({error:"No active jobs for this worker"},403);
      const token = await googleAccessToken(admin);
      return json({ok:true,google_access_token:token.access_token,google_token_expires_in:token.expires_in});
    }

    if (action === "heartbeat") {
      const ids = Array.isArray(input.job_ids) ? input.job_ids.map(Number).filter(Number.isFinite) : [];
      if (!ids.length) return json({ok:true,updated:0});
      const now = new Date().toISOString();
      const { data:rows, error } = await admin
        .from("ai_operations_video_jobs")
        .update({status:"running",updated_at:now})
        .in("id",ids)
        .eq("claimed_by",workerId)
        .in("status",["claimed","running"])
        .select("id,clip_id");
      if (error) throw new Error(error.message);
      return json({ok:true,updated:rows?.length ?? 0});
    }

    if (action === "complete") {
      const jobId = Number(input.job_id);
      const clipId = String(input.clip_id ?? "");
      const driveFileId = String(input.drive_file_id ?? "");
      const driveFileUrl = String(input.drive_file_url ?? "");
      const outputSize = Number(input.output_size_bytes ?? 0);
      if (!jobId || !clipId || !driveFileId || !driveFileUrl) return json({error:"Completion fields are incomplete"},400);

      const { data:jobs, error:jErr } = await admin
        .from("ai_operations_video_jobs")
        .select("id,clip_id,status,claimed_by")
        .eq("id",jobId)
        .eq("clip_id",clipId)
        .eq("job_type","render_clip")
        .limit(1);
      if (jErr || !jobs?.length) return json({error:"Render job not found"},404);
      if (String(jobs[0].claimed_by ?? "") !== workerId) return json({error:"Render job belongs to another worker"},409);

      const now = new Date().toISOString();
      const { error:cErr } = await admin.from("ai_operations_video_clips").update({
        drive_file_id:driveFileId,
        drive_file_url:driveFileUrl,
        output_mime_type:"video/mp4",
        output_size_bytes:Number.isFinite(outputSize) && outputSize > 0 ? outputSize : null,
        status:"rendered",
        rendered_at:now,
        error_message:null,
        updated_at:now
      }).eq("id",clipId);
      if (cErr) throw new Error(cErr.message);

      const { error:jobErr } = await admin.from("ai_operations_video_jobs").update({
        status:"complete",
        completed_at:now,
        error_message:null,
        updated_at:now
      }).eq("id",jobId);
      if (jobErr) throw new Error(jobErr.message);

      return json({ok:true});
    }

    if (action === "fail") {
      const jobId = Number(input.job_id);
      const clipId = String(input.clip_id ?? "");
      const message = String(input.error ?? "Render failed.").slice(0,4000);
      if (!jobId || !clipId) return json({error:"Failure fields are incomplete"},400);

      const { data:jobs, error:jErr } = await admin
        .from("ai_operations_video_jobs")
        .select("id,clip_id,status,claimed_by,attempts")
        .eq("id",jobId)
        .eq("clip_id",clipId)
        .eq("job_type","render_clip")
        .limit(1);
      if (jErr || !jobs?.length) return json({error:"Render job not found"},404);
      if (String(jobs[0].claimed_by ?? "") !== workerId) return json({error:"Render job belongs to another worker"},409);

      const attempts = Number(jobs[0].attempts ?? 0) + 1;
      const retry = attempts < 3;
      const now = new Date().toISOString();

      await admin.from("ai_operations_video_jobs").update({
        status:retry ? "queued" : "error",
        attempts,
        claimed_by:retry ? null : workerId,
        claimed_at:retry ? null : jobs[0].claimed_at,
        started_at:retry ? null : null,
        error_message:message,
        updated_at:now
      }).eq("id",jobId);

      await admin.from("ai_operations_video_clips").update({
        status:retry ? "render_queued" : "error",
        error_message:message,
        updated_at:now
      }).eq("id",clipId);

      return json({ok:true,retry,attempts});
    }

    return json({error:"Unknown action"},400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({component:"video-render-worker-api",action,workerId,error:message}));
    return json({error:message},500);
  }
});
