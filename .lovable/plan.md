

## Plan: Per-tenant n8n workflow cloning + credential injection

### Feasibility: Yes, fully possible

You self-host n8n → you have unlimited workflows, unlimited credentials, no quota walls. The n8n Public API supports everything we need: clone a workflow, create credentials, bind credentials to nodes, activate. Flurra acts as the orchestrator.

### How it works end-to-end

```text
1. You (one-time): build template workflow in n8n, mark nodes with placeholder credential names
2. New user signs up in Flurra
   └─► trigger fires n8n-provision-user edge fn
       ├─ GET  /api/v1/workflows/{TEMPLATE_ID}      (fetch template JSON)
       ├─ POST /api/v1/workflows                    (create copy named "Flurra-{user_id}")
       └─ store row in user_n8n_workflows {user_id, n8n_workflow_id, webhook_url}
3. User opens Connections tab → pastes TikTok/IG/etc credentials
   └─► n8n-set-credential edge fn
       ├─ POST  /api/v1/credentials                 (create credential in n8n)
       ├─ PATCH /api/v1/workflows/{their_id}        (bind credential ID to right node)
       └─ POST  /api/v1/workflows/{id}/activate     (activate once first cred is set)
4. Scheduled post fires → existing pipeline → POST to user's unique webhook URL
```

You never touch n8n per user. Flurra does it all via your API key.

### What you do once

1. Build the template workflow in your self-hosted n8n with placeholder credentials per platform
2. Note the template workflow ID
3. Generate an n8n API key (Settings → n8n API)
4. Provide: `N8N_BASE_URL`, `N8N_API_KEY`, `N8N_TEMPLATE_WORKFLOW_ID`, `N8N_WEBHOOK_SHARED_SECRET`

### Database changes

**`user_n8n_workflows`** (1 row per user)
- `user_id` (uuid, unique), `n8n_workflow_id` (text), `webhook_url` (text), `webhook_secret` (text), `is_active` (bool), timestamps
- RLS: users read own; service role writes

**`user_social_credentials`** (1 row per user × platform)
- `user_id`, `platform` (tiktok/instagram/facebook/linkedin/x), `n8n_credential_id` (text), `account_handle` (text), `status` (connected/expired/error), timestamps
- **No raw tokens stored in Supabase** — they live encrypted inside n8n
- RLS: users read own; service role writes

### Edge functions (4 new)

1. **`n8n-provision-user`** — DB trigger on `profiles` insert → clones template, stores row
2. **`n8n-set-credential`** — Connections UI calls this with pasted token → creates n8n credential, patches workflow node
3. **`n8n-remove-credential`** — Disconnect button → deletes n8n credential
4. **`n8n-dispatch`** — Called by existing scheduled-post pipeline → POSTs payload to user's webhook with shared-secret header

### UI changes

Connections tab gains 5 platform cards (TikTok, IG, FB, LinkedIn, X). Each: status badge + Connect (paste-token modal) + Disconnect.

V1 = paste-token only (fast to ship, no developer-app registration). Real OAuth Connect buttons can replace the modal per-platform later without touching the architecture.

### Honest caveats

1. **Template contract**: your template's nodes must use predictable credential placeholder names (e.g. `__TIKTOK_CRED__`) so the patch step knows which node to update per platform. I'll document the exact convention.
2. **Credential rotation**: n8n's credential PATCH support is limited — token refresh = delete + recreate + rebind. Edge fn handles it.
3. **Backfill existing users**: I'll run a one-time provisioning script for accounts that signed up before this lands.
4. **Cleanup**: deleting a Flurra account should also delete their n8n workflow + credentials. I'll add that to a future `n8n-deprovision-user` fn (out of scope v1).

### Secrets needed (you'll add after approval)

- `N8N_BASE_URL` — e.g. `https://n8n.yourdomain.com`
- `N8N_API_KEY` — from n8n Settings → API
- `N8N_TEMPLATE_WORKFLOW_ID` — the workflow you build
- `N8N_WEBHOOK_SHARED_SECRET` — random string, also configured in your template's first node

### Out of scope for v1

- Per-platform real OAuth Connect buttons (paste-token only)
- Auto-deprovision on account delete
- Admin UI inside Flurra to inspect per-user n8n workflows

### Open question before building

Which 5 platforms for v1? My default: **TikTok, Instagram, Facebook, LinkedIn, X**. Tell me to add/drop any (e.g. Threads, Bluesky, YouTube Community, Pinterest).

