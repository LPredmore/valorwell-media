## Fix `reveal-r2-secrets` auth

The deployed SDK version doesn't have `supabase.auth.getClaims()`. Swap to `supabase.auth.getUser(token)` which is universally available.

### Change

In `supabase/functions/reveal-r2-secrets/index.ts`, replace the claims block:

```ts
const { data: userData, error: userErr } = await supabase.auth.getUser(token);
if (userErr || !userData?.user) {
  return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, ... });
}
const userId = userData.user.id;
if (userId !== ALLOWED_USER_ID) { /* 403 */ }
```

Everything else (CORS, R2 env reads, account-id parsing) stays the same. Function auto-redeploys.

### After deploy

Re-run the same console snippet you already have — it will return the R2 values and copy the `fly secrets set ...` command to your clipboard.

Approve and I'll apply the fix.