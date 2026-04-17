

# Adjustments for `getflurra.com` as the Production Domain

## TL;DR

**The Fly.io diff doesn't change.** The Lovable app code doesn't change either — it already uses `window.location.origin` for OAuth redirects. What you need to update is **OAuth allowlists in three places** and **one default URL in the Fly code**.

---

## What needs updating (and where)

### 1. Google Cloud Console — OAuth client (REQUIRED)

This is the one that will silently break YouTube connect for `getflurra.com` users if you skip it.

**Authorized JavaScript origins** — add:
- `https://getflurra.com`
- `https://www.getflurra.com` (if you'll use www)

**Authorized redirect URIs** — add:
- `https://asjhkidpuhqodryczuth.supabase.co/auth/v1/callback` *(should already be there)*

Note: the redirect URI is **always** the Supabase callback, regardless of your frontend domain. Supabase then bounces back to your `redirectTo`. So only the **JavaScript origins** list needs the new domain.

### 2. Supabase Auth — URL Configuration (REQUIRED)

In Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: change to `https://getflurra.com`
- **Redirect URLs (allowlist)**: add
  - `https://getflurra.com/**`
  - `https://www.getflurra.com/**` (if using www)
  - Keep `https://video-to-post-pro.lovable.app/**` and the preview URL during transition

If `getflurra.com/connections` isn't on the allowlist, the OAuth callback will reject the redirect and YouTube connect will fail with `redirect_to is not allowed`.

### 3. Fly.io `src/index.js` — default Lovable URL (OPTIONAL but recommended)

In the diff I gave you, this line:
```js
const LOVABLE_FUNCTIONS_URL = process.env.LOVABLE_FUNCTIONS_URL || 'https://asjhkidpuhqodryczuth.supabase.co/functions/v1';
```

The fallback already points at the **Supabase functions URL** (not the Lovable frontend), which is correct and domain-independent. **No change needed.** Fly.io always calls Supabase directly, never `getflurra.com`.

You can ignore `LOVABLE_FUNCTIONS_URL` as an env var entirely — the default is fine.

### 4. Email templates (Supabase Auth) — REQUIRED if you use confirmation/magic-link emails

In Supabase Dashboard → Authentication → Email Templates, any hardcoded URLs should use `{{ .SiteURL }}` (which now resolves to `getflurra.com` after step 2). If you've customized templates with literal lovable.app URLs, update them.

---

## What does NOT need to change

| Item | Why |
|---|---|
| Fly.io code diff | Calls Supabase functions URL directly, not the frontend |
| `youtube-get-access-token` edge function | No CORS/origin coupling — service-role auth only |
| `youtube-save-connection` edge function | CORS is `*` |
| `Connections.tsx` redirect logic | Uses `window.location.origin` — auto-adapts |
| `Login.tsx` / `Signup.tsx` redirects | Same — domain-agnostic |
| Any DB schema | Domain-independent |
| `SUPABASE_SERVICE_ROLE_KEY` on Fly | Same key works regardless of frontend domain |

---

## Updated cutover sequence

Insert these **before** the Fly.io deploy:

1. **Google Cloud Console**: add `https://getflurra.com` to JavaScript origins
2. **Supabase Auth URL Config**: set Site URL + add `getflurra.com/**` to allowlist
3. **Connect custom domain in Lovable** (Project Settings → Domains → Connect `getflurra.com`)
4. **Verify**: load `https://getflurra.com/connections`, click Connect YouTube, confirm round-trip works
5. **Then** proceed with the Fly.io deploy from the previous plan

---

## One gotcha to watch

If a user connected YouTube while the app was on `lovable.app` and later visits via `getflurra.com`, **their connection still works** — the refresh token is stored server-side in `youtube_connections`, not tied to a domain. Only the **OAuth handshake itself** is domain-sensitive.

