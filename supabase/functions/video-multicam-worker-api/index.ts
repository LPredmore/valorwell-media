import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

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
      String(payload.workflow_ref) === WORKFLOW &&
      String(payload.runner_environment) === "github-hosted" &&
      ["push", "workflow_dispatch", "schedule"].includes(String(payload.event_name));
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
  const safeEpisode = sources[0].episode.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  const isPreview = previewSeconds > 0;
  const name = safeEpisode + (isPreview ? "-multicam-preview-" + previewSeconds + "s-" :
                             "-multicam-master-") + fingerprint + ".mp4";
  const outputFolderId = isPreview ? folderId : rootId;
  const existing = (await listChildren(token, outputFolderId))
    .find((f) => f.name === name && f.mimeType === "video/mp4");
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
    if (Math.max(...created) < activation) continue;
    try {
      const prepared = await manifest(db, token, String(folder.id), 0);
      if (!prepared.existing) return { folder_id: String(folder.id), found: true };
    } catch {
      // Old or malformed folders never block discovery of another valid episode.
    }
  }
  return { found: false, folder_id: null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!(await authenticated(req))) return reply({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const folderId = String(body.folder_id || "");
  const preview = Number(body.preview_seconds || 0);
  try {
    const db = admin();
    const token = await googleToken(db);
    if (action === "discover") return reply({ ok: true, ...await discover(db, token) });
    const job = await manifest(db, token, folderId, preview);
    if (action === "prepare") return reply({ ok: true, ...job, google_access_token: token });
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
