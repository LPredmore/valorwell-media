import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

import { guestReferenceAction } from "./guest-reference-jobs.ts";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const PROJECT = "LPredmore/valorwell-media";
const WORKFLOW = PROJECT + "/.github/workflows/video-multicam-render.yml@refs/heads/main";
const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const FILE_RE = /^(.+)-([^-]+)-webcam-(\d+)h_(\d+)m_(\d+)s_(\d+)ms-StreamYard\.mp4$/i;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
async function authenticated(req: Request) {
  const bearer = req.headers.get("authorization") || "";
  if (!bearer.startsWith("Bearer ")) return false;
  try {
    const { payload } = await jwtVerify(bearer.slice(7), JWKS, {
      issuer: "https://token.actions.githubusercontent.com",
      audience: "valorwell-video-worker",
    });
    return String(payload.repository) === PROJECT &&
      String(payload.repository_id) === "1180964076" &&
      String(payload.repository_owner_id) === "124374222" &&
      String(payload.ref) === "refs/heads/main" &&
      [WORKFLOW, PROJECT+"/.github/workflows/video-guest-references.yml@refs/heads/main"].includes(String(payload.workflow_ref)) &&
      String(payload.runner_environment) === "github-hosted" &&
      ["push", "workflow_dispatch", "schedule"].includes(String(payload.event_name))
      ? (String(payload.workflow_ref)===WORKFLOW?"multicam":"guest_refs") : false;
  } catch {
    return false;
  }
}
function admin() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Supabase runtime not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
async function googleToken(db: ReturnType<typeof admin>) {
  const { data, error } = await db.rpc("get_relationship_google_connection_runtime", {
    p_tenant_id: TENANT_ID, p_connection_type: "drive", p_connection_id: null,
  });
  if (error || !data?.refreshToken) throw new Error("Drive is not connected");
  const id = Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_ID") || "";
  const secret = Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_SECRET") || "";
  if (!id || !secret) throw new Error("Google OAuth configuration missing");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id, client_secret: secret,
      refresh_token: String(data.refreshToken), grant_type: "refresh_token",
    }),
  });
  const payload = await res.json();
  if (!res.ok || !payload.access_token) throw new Error("Drive token refresh failed");
  return String(payload.access_token);
}
async function driveGet(token: string, id: string, fields = "id,name,mimeType,size,parents") {
  if (!/^[a-zA-Z0-9_-]{10,150}$/.test(id)) throw new Error("Invalid Drive ID");
  const url = new URL("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id));
  url.searchParams.set("fields", fields);
  const r = await fetch(url, { headers: { authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Drive metadata request failed: " + r.status);
  return await r.json();
}
async function listChildren(token: string, folder: string) {
  const files: any[] = [];
  let next = "";
  do {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", "'" + folder + "' in parents and trashed = false");
    url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,parents)");
    url.searchParams.set("pageSize", "1000");
    if (next) url.searchParams.set("pageToken", next);
    const r = await fetch(url, { headers: { authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Drive folder listing failed: " + r.status);
    const page = await r.json();
    files.push(...(page.files || []));
    next = String(page.nextPageToken || "");
  } while (next);
  return files;
}
async function manifest(db: ReturnType<typeof admin>, token: string, folderId: string, previewSeconds: number) {
  if (!Number.isFinite(previewSeconds) || previewSeconds < 0 || previewSeconds > 600)
    throw new Error("preview_seconds must be 0 (full) or up to 600");
  const { data: settings, error } = await db.from("ai_operations_video_settings")
    .select("drive_folder_id").eq("tenant_id", TENANT_ID).single();
  if (error || !settings?.drive_folder_id) throw new Error("Video intake root unavailable");
  const rootId = String(settings.drive_folder_id);
  const folder = await driveGet(token, folderId);
  if (folder.mimeType !== "application/vnd.google-apps.folder" ||
      !Array.isArray(folder.parents) || !folder.parents.includes(rootId))
    throw new Error("Requested folder is not a direct child of the approved BTY source root");
  const files = await listChildren(token, folderId);
  const videoFiles = files.filter((f) => FILE_RE.test(String(f.name || "")) && f.mimeType === "video/mp4");
  if (videoFiles.length !== 2) {
    throw new Error("Exactly two StreamYard participant webcam MP4 recordings are required");
  }
  const sources = videoFiles.map((file: any) => {
    const groups = String(file.name).match(FILE_RE);
    if (!groups) throw new Error("Unexpected StreamYard filename");
    const seconds = Number(groups[3]) * 3600 + Number(groups[4]) * 60 +
      Number(groups[5]) + Number(groups[6]) / 1000;
    if (!Number.isFinite(seconds) || seconds > 3600) throw new Error("Invalid join offset");
    if (Number(file.size || 0) < 100000) throw new Error("Recording too small");
    return {
      id: String(file.id), name: String(file.name), size: Number(file.size),
      modified: String(file.modifiedTime || ""),
      episode: String(groups[1]),
      speaker: String(groups[2]).replaceAll("_", " "),
      offset: seconds,
    };
  });
  if (sources[0].episode !== sources[1].episode ||
      sources[0].speaker.toLowerCase() === sources[1].speaker.toLowerCase())
    throw new Error("Recordings must belong to one episode with distinct speakers");
  sources.sort((a, b) => Number(!/luke.predmore/i.test(a.speaker)) -
                        Number(!/luke.predmore/i.test(b.speaker)) ||
                        a.speaker.localeCompare(b.speaker));
  const inputSignature = JSON.stringify(sources.map((x) => [x.id, x.size, x.modified]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inputSignature)));
  const fingerprint = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12);
  // The episode's approved Drive folder, not the participant recording filename,
  // owns the organization/episode display name. Source names can be mislabeled.
  const safeEpisode = String(folder.name || sources[0].episode)
    .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || sources[0].episode;
  const isPreview = previewSeconds > 0;
  const suffix = (isPreview ? "-multicam-preview-" + previewSeconds + "s-" :
                               "-multicam-master-") + fingerprint + ".mp4";
  const canonicalName = safeEpisode + suffix;
  const outputFolderId = isPreview ? folderId : rootId;
  const previousOutputs = await listChildren(token, outputFolderId);
  // A previously completed output with an old episode prefix is the SAME
  // fingerprinted render. Reuse it rather than creating duplicate masters.
  const existing = previousOutputs.find((f) => f.name === canonicalName && f.mimeType === "video/mp4")
    || previousOutputs.find((f) => f.name?.endsWith(suffix) && f.mimeType === "video/mp4");
  const name = existing ? String(existing.name) : canonicalName;
  return {
    folder_id: folderId, output_folder_id: outputFolderId, output_name: name,
    preview_seconds: previewSeconds, is_preview: isPreview, sources, fingerprint,
    existing: existing ? { id: existing.id, size: existing.size } : null,
  };
}


/** Poll only new, complete paired recordings; older episodes remain manual. */
async function discover(db: ReturnType<typeof admin>, token: string) {
  const { data: settings, error } = await db.from("ai_operations_video_settings")
    .select("drive_folder_id").eq("tenant_id", TENANT_ID).single();
  if (error || !settings?.drive_folder_id) throw new Error("Video intake root unavailable");
  const root = String(settings.drive_folder_id);
  const all = await listChildren(token, root);
  const folders = all.filter((f) => f.mimeType === "application/vnd.google-apps.folder")
    .sort((a, b) => Date.parse(b.createdTime || "") - Date.parse(a.createdTime || ""));
  const activation = Date.parse("2026-10-17T13:40:00Z");
  for (const folder of folders) {
    const children = await listChildren(token, String(folder.id));
    const recordings = children.filter((f) => f.mimeType === "video/mp4" &&
      FILE_RE.test(String(f.name || "")));
    if (recordings.length !== 2) continue;
    const created = recordings.map((f) => Date.parse(f.createdTime || "") || 0);
    if (Math.min(...created) < activation) continue;
    try {
      const prepared = await manifest(db, token, String(folder.id), 0);
      if (!prepared.existing) return { folder_id: String(folder.id), found: true };
    } catch {
      // Old or malformed folders never block discovery of another valid episode.
    }
  }
  return { found: false, folder_id: null };
}


/** One portrait per verified guest recording. Never choose the host as the guest. */
function portraitIdentity(job: any) {
  if (job.is_preview) return null;
  const sources = job.sources as Array<{id:string;speaker:string;size:number}>;
  const hosts = sources.filter(s => /^Luke\s+Predmore$/i.test(s.speaker.trim()));
  const guests = sources.filter(s => !/^Luke\s+Predmore$/i.test(s.speaker.trim()));
  if (hosts.length !== 1 || guests.length !== 1) return null;
  const speaker = guests[0].speaker.trim();
  const filename = "BTY-guest-" + job.fingerprint + "-" +
    speaker.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 65) + ".jpg";
  return {guest:guests[0],filename,speaker};
}
async function guestImageFolder(db: ReturnType<typeof admin>) {
  const {data,error} = await db.from("ai_operations_video_settings")
    .select("guest_image_folder_id").eq("tenant_id",TENANT_ID).single();
  if(error||!data?.guest_image_folder_id)throw new Error("BTY guest image folder not configured");
  return String(data.guest_image_folder_id);
}
async function attachPortrait(
  db: ReturnType<typeof admin>, project: any, guestName: string,
  driveFileId: string, provenance: Record<string,unknown>,
) {
  if(!project || String(project.guest_image_url||"").trim())return false;
  const currentMeta=(project.metadata && typeof project.metadata==="object")?project.metadata:{};
  const updates = {
    guest_name: String(project.guest_name||"").trim() || guestName,
    guest_image_url:"https://drive.google.com/file/d/"+driveFileId+"/view",
    metadata:{...currentMeta,guest_image_auto:{
      ...provenance,drive_file_id:driveFileId,source:"original_guest_webcam_frame",
      updated_at:new Date().toISOString(),
    }},
    updated_at:new Date().toISOString(),
  };
  const {data,error}=await db.from("ai_operations_video_projects").update(updates)
    .eq("id",project.id).eq("source_file_id",project.source_file_id)
    .is("guest_image_url",null).select("id");
  if(error)throw new Error("Guest photo database update failed: "+error.message);
  return Boolean(data?.length);
}
async function projectForMaster(db:ReturnType<typeof admin>,job:any) {
  if(!job.existing?.id)return null;
  const {data,error}=await db.from("ai_operations_video_projects")
    .select("id,source_file_id,guest_name,guest_image_url,metadata")
    .eq("tenant_id",TENANT_ID).eq("source_file_id",String(job.existing.id)).maybeSingle();
  if(error)throw new Error("Unable to match generated master to CRM project");
  return data;
}
async function guestPortraitPrepare(db:ReturnType<typeof admin>,token:string,job:any) {
  const identity=portraitIdentity(job);
  if(!identity)return {needed:false,reason:"preview_or_no_unique_host_and_guest"};
  const folder=await guestImageFolder(db);
  const target=await driveGet(token,folder);
  if(target.mimeType!=="application/vnd.google-apps.folder")throw new Error("Guest image destination is not a folder");
  const project=await projectForMaster(db,job);
  if(project && String(project.guest_image_url||"").trim())
    return {needed:false,reason:"existing_manual_or_automated_reference"};
  const files=await listChildren(token,folder);
  const prior=files.find(x=>x.name===identity.filename&&x.mimeType==="image/jpeg"&&Number(x.size||0)>20000);
  if(prior) {
    const attached=await attachPortrait(db,project,identity.speaker,String(prior.id),
      {source_fingerprint:job.fingerprint,guest_source_file_id:identity.guest.id,
       reused_existing_asset:true});
    return {needed:false,reason:"image_already_saved",attached,image_file_id:prior.id};
  }
  return {needed:true,guest_source:identity.guest,guest_name:identity.speaker,
    output_name:identity.filename,output_folder_id:folder};
}
async function guestPortraitComplete(
  db:ReturnType<typeof admin>,token:string,job:any,body:any,
) {
  const identity=portraitIdentity(job);
  if(!identity || !job.existing?.id)throw new Error("No completed full master for guest portrait");
  const folder=await guestImageFolder(db);
  const imageId=String(body.image_id||"");
  const file=await driveGet(token,imageId,"id,name,size,mimeType,parents");
  if(file.name!==identity.filename || file.mimeType!=="image/jpeg" ||
     !file.parents?.includes(folder) || Number(file.size||0)<20000 ||
     Number(file.size||0)>8*1024*1024)throw new Error("Guest portrait failed verified Drive identity");
  const time=Number(body.selected_time_seconds);
  const quality=Number(body.quality_score);
  if(!Number.isFinite(time)||time<0||!Number.isFinite(quality)||quality<0)
    throw new Error("Invalid guest frame scoring metadata");
  const project=await projectForMaster(db,job);
  const attached=await attachPortrait(db,project,identity.speaker,imageId,{
    source_fingerprint:job.fingerprint,guest_source_file_id:identity.guest.id,
    selected_time_seconds:time,quality_score:quality,
    evaluated_candidates:Number(body.evaluated_candidates||0),
  });
  return {ok:true,image_id:imageId,attached,pending_project:!project};
}
/** Reconciles images created before the master was ingested by the transcription pipeline. */
async function reconcileGuestPortraits(db:ReturnType<typeof admin>,token:string) {
  const folder=await guestImageFolder(db);
  const files=(await listChildren(token,folder)).filter(x=>
    x.mimeType==="image/jpeg" && Number(x.size||0)>=20000 &&
    /^BTY-guest-[a-f0-9]{12}-[a-zA-Z0-9_-]+\.jpg$/.test(String(x.name||"")));
  const {data:projects,error}=await db.from("ai_operations_video_projects")
    .select("id,source_file_id,source_file_name,guest_name,guest_image_url,metadata")
    .eq("tenant_id",TENANT_ID).is("guest_image_url",null)
    .like("source_file_name","%-multicam-master-%").limit(100);
  if(error)throw new Error("Guest portrait reconciliation query failed");
  let attached=0;
  for(const project of projects||[]) {
    const match=String(project.source_file_name||"").match(/-multicam-master-([a-f0-9]{12})\.mp4$/);
    if(!match)continue;
    const choices=files.filter(x=>String(x.name).startsWith("BTY-guest-"+match[1]+"-"));
    if(choices.length!==1)continue;
    const asset=choices[0];
    const name=String(asset.name).replace(/^BTY-guest-[a-f0-9]{12}-/,"").replace(/\.jpg$/,"").replace(/_/g," ");
    if(await attachPortrait(db,project,name,String(asset.id),{
      source_fingerprint:match[1],reconciled:true,
    }))attached++;
  }
  return {ok:true,examined:(projects||[]).length,attached};
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const identity=await authenticated(req);
  if (!identity) return reply({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  if(identity==="guest_refs" && !["guest_refs_claim","guest_refs_complete","guest_refs_review","guest_refs_token"].includes(action))
    return reply({error:"Workflow cannot access this action"},403);
  const folderId = String(body.folder_id || "");
  const preview = Number(body.preview_seconds || 0);
  try {
    const db = admin();
    const token = await googleToken(db);
    if (["guest_refs_claim","guest_refs_complete","guest_refs_review","guest_refs_token"].includes(action))
      return reply(await guestReferenceAction(db,token,action,body,driveGet,()=>guestImageFolder(db)));
    if (action === "discover") return reply({ ok: true, ...await discover(db, token) });
    if (action === "guest_image_reconcile") return reply(await reconcileGuestPortraits(db,token));
    const job = await manifest(db, token, folderId, preview);
    if (action === "prepare") return reply({ ok: true, ...job, google_access_token: token });
    if (action === "guest_image_prepare") return reply({
      ok:true,...await guestPortraitPrepare(db,token,job),
    });
    if (action === "guest_image_complete") return reply(
      await guestPortraitComplete(db,token,job,body)
    );
    if (action === "drive_token") return reply({ ok: true, google_access_token: token });
    if (action === "complete") {
      const outputId = String(body.output_id || "");
      const file = await driveGet(token, outputId, "id,name,mimeType,size,parents");
      if (file.name !== job.output_name || file.mimeType !== "video/mp4" ||
          !file.parents?.includes(job.output_folder_id) || Number(file.size || 0) < 100000)
        return reply({ error: "Uploaded artifact fails Drive identity/size validation" }, 409);
      return reply({ ok: true, output_id: outputId, is_preview: job.is_preview,
        ready_for_normal_intake: !job.is_preview });
    }
    return reply({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ component: "video-multicam-worker-api", action, error: message }));
    return reply({ error: message }, 422);
  }
});
