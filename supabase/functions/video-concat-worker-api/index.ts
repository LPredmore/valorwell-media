import "jsr:@supabase/functions-js@2.4.5/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.93.1";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.0";

const TENANT_ID = "00000000-0000-0000-0000-000000000001";
const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const GITHUB_OIDC_AUDIENCE = "valorwell-video-worker";
const GITHUB_REPOSITORY = "LPredmore/valorwell-media";
const GITHUB_REPOSITORY_ID = "1180964076";
const GITHUB_OWNER_ID = "124374222";
const GITHUB_WORKFLOW_REF =
  "LPredmore/valorwell-media/.github/workflows/video-concat-worker.yml@refs/heads/main";
const GITHUB_JWKS = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function sha256Hex(value: string) {
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function secureEqual(a: string, b: string) {
  if (!a || !b) return false;
  return await sha256Hex(a) === await sha256Hex(b);
}

function serverKeys(): string[] {
  const keys: string[] = [];
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (legacy) keys.push(legacy);

  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") ?? "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const value of Object.values(parsed)) {
          if (typeof value === "string" && value) keys.push(value);
        }
      }
    } catch {
      // Optional new-style key bundle may not exist on older projects.
    }
  }
  return keys;
}

async function serverKeyAuthorized(req: Request) {
  const supplied = req.headers.get("apikey") ?? "";
  if (!supplied) return false;
  for (const candidate of serverKeys()) {
    if (await secureEqual(supplied, candidate)) return true;
  }
  return false;
}

async function githubOidcAuthorized(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, GITHUB_JWKS, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: GITHUB_OIDC_AUDIENCE,
    });

    return (
      String(payload.repository ?? "") === GITHUB_REPOSITORY &&
      String(payload.repository_id ?? "") === GITHUB_REPOSITORY_ID &&
      String(payload.repository_owner_id ?? "") === GITHUB_OWNER_ID &&
      String(payload.ref ?? "") === "refs/heads/main" &&
      String(payload.event_name ?? "") === "push" &&
      String(payload.workflow_ref ?? "") === GITHUB_WORKFLOW_REF &&
      String(payload.runner_environment ?? "") === "github-hosted"
    );
  } catch (error) {
    console.error(JSON.stringify({
      component: "video-concat-worker-api",
      auth: "github_oidc",
      error: error instanceof Error ? error.message : String(error),
    }));
    return false;
  }
}

async function authorized(req: Request) {
  if (await serverKeyAuthorized(req)) return true;
  return await githubOidcAuthorized(req);
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) throw new Error("Supabase service runtime is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function googleAccessToken(db: ReturnType<typeof admin>) {
  const { data, error } = await db.rpc("get_relationship_google_connection_runtime", {
    p_tenant_id: TENANT_ID,
    p_connection_type: "drive",
    p_connection_id: null,
  });
  if (error) throw new Error(error.message);
  if (!data?.refreshToken) throw new Error("Google Drive connection is unavailable.");

  const clientId = Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_ID") ?? "";
  const clientSecret = Deno.env.get("GOOGLE_RELATIONSHIPS_CLIENT_SECRET") ?? "";
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client is not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: String(data.refreshToken),
      grant_type: "refresh_token",
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body?.access_token) {
    throw new Error("Google Drive access-token refresh failed (" + response.status + ").");
  }

  return {
    access_token: String(body.access_token),
    expires_in: Number(body.expires_in ?? 3600),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(await authorized(req))) return json({ error: "Unauthorized" }, 401);

  const input = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(input.action ?? "");
  const workerId = String(input.worker_id ?? "").slice(0, 200);
  if (!workerId) return json({ error: "worker_id is required" }, 400);

  const db = admin();

  try {
    if (action === "claim") {
      const { data: candidates, error: candidateError } = await db
        .from("ai_operations_video_jobs")
        .select("id,project_id,payload,attempts,created_at")
        .eq("tenant_id", TENANT_ID)
        .eq("job_type", "concat_video")
        .eq("status", "queued")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(5);

      if (candidateError) throw new Error(candidateError.message);

      for (const candidate of candidates ?? []) {
        const now = new Date().toISOString();
        const { data: claimed, error: claimError } = await db
          .from("ai_operations_video_jobs")
          .update({
            status: "claimed",
            claimed_by: workerId,
            claimed_at: now,
            started_at: now,
            error_message: null,
            progress: { phase: "claimed", percent: 0 },
            updated_at: now,
          })
          .eq("id", candidate.id)
          .eq("status", "queued")
          .eq("job_type", "concat_video")
          .select("id,project_id,payload,attempts");

        if (claimError) throw new Error(claimError.message);
        if (!claimed?.length) continue;

        const job = claimed[0] as Record<string, unknown>;

        const { data: inputs, error: inputError } = await db
          .from("ai_operations_video_job_inputs")
          .select(
            "id,position,drive_file_id,drive_file_name,drive_folder_id,mime_type,size_bytes,modified_time",
          )
          .eq("job_id", job.id)
          .order("position", { ascending: true });

        if (inputError) throw new Error(inputError.message);
        if (!inputs || inputs.length < 2) {
          await db.from("ai_operations_video_jobs").update({
            status: "error",
            error_message: "concat_video requires at least two ordered inputs.",
            completed_at: now,
            updated_at: now,
            progress: { phase: "error", percent: 0 },
          }).eq("id", job.id);
          continue;
        }

        const payload = (job.payload ?? {}) as Record<string, unknown>;
        const outputFolderId = String(payload.output_folder_id ?? "");
        const outputFileName = String(payload.output_file_name ?? "");
        if (!outputFolderId || !outputFileName) {
          await db.from("ai_operations_video_jobs").update({
            status: "error",
            error_message: "concat_video payload requires output_folder_id and output_file_name.",
            completed_at: now,
            updated_at: now,
            progress: { phase: "error", percent: 0 },
          }).eq("id", job.id);
          continue;
        }

        const token = await googleAccessToken(db);
        return json({
          ok: true,
          job: {
            id: job.id,
            project_id: job.project_id,
            attempts: job.attempts,
            payload,
            inputs,
            output: {
              folder_id: outputFolderId,
              file_name: outputFileName,
              overwrite: Boolean(payload.overwrite ?? false),
              concat_policy: String(payload.concat_policy ?? "preserve"),
            },
          },
          google_access_token: token.access_token,
          google_token_expires_in: token.expires_in,
        });
      }

      return json({ ok: true, job: null });
    }

    const jobId = Number(input.job_id ?? 0);
    if (!Number.isFinite(jobId) || jobId <= 0) {
      return json({ error: "job_id is required" }, 400);
    }

    const { data: jobs, error: jobError } = await db
      .from("ai_operations_video_jobs")
      .select("id,status,claimed_by,attempts")
      .eq("id", jobId)
      .eq("tenant_id", TENANT_ID)
      .eq("job_type", "concat_video")
      .limit(1);

    if (jobError || !jobs?.length) return json({ error: "Job not found" }, 404);
    const job = jobs[0] as Record<string, unknown>;
    if (String(job.claimed_by ?? "") !== workerId) {
      return json({ error: "Job belongs to another worker" }, 409);
    }

    if (action === "drive_token") {
      if (!["claimed", "running"].includes(String(job.status))) {
        return json({ error: "Job is not active" }, 409);
      }
      const token = await googleAccessToken(db);
      return json({
        ok: true,
        google_access_token: token.access_token,
        google_token_expires_in: token.expires_in,
      });
    }

    if (action === "heartbeat") {
      const progress =
        input.progress && typeof input.progress === "object" ? input.progress : {};
      const now = new Date().toISOString();
      const { error } = await db.from("ai_operations_video_jobs").update({
        status: "running",
        progress,
        updated_at: now,
      })
        .eq("id", jobId)
        .eq("claimed_by", workerId)
        .in("status", ["claimed", "running"]);

      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "complete") {
      const result =
        input.result && typeof input.result === "object" ? input.result : {};
      const now = new Date().toISOString();
      const { error } = await db.from("ai_operations_video_jobs").update({
        status: "complete",
        result,
        progress: { phase: "complete", percent: 100 },
        completed_at: now,
        error_message: null,
        updated_at: now,
      })
        .eq("id", jobId)
        .eq("claimed_by", workerId)
        .in("status", ["claimed", "running"]);

      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (action === "fail") {
      const message = String(input.error ?? "Concat worker failed.").slice(0, 4000);
      const retryable = Boolean(input.retryable ?? false);
      const attempts = Number(job.attempts ?? 0) + 1;
      const retry = retryable && attempts < 3;
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: retry ? "queued" : "error",
        attempts,
        error_message: message,
        progress: {
          phase: retry ? "retry_queued" : "error",
          percent: 0,
          retryable,
          attempts,
        },
        updated_at: now,
      };

      if (retry) {
        update.claimed_by = null;
        update.claimed_at = null;
        update.started_at = null;
        update.completed_at = null;
      } else {
        update.completed_at = now;
      }

      const { error } = await db.from("ai_operations_video_jobs").update(update).eq("id", jobId);
      if (error) throw new Error(error.message);
      return json({ ok: true, retry, attempts });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      component: "video-concat-worker-api",
      action,
      workerId,
      error: message,
    }));
    return json({ error: message }, 500);
  }
});
