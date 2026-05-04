# Reveal R2 Secrets — One-Time Function

## What I'll build

Create `supabase/functions/reveal-r2-secrets/index.ts` that:

1. Requires an Authorization Bearer JWT.
2. Verifies the caller's user via `supabase.auth.getUser(token)`.
3. Hard-gates to your `user_id` (hardcoded) — anyone else gets 403.
4. Returns JSON with:
   - `R2_ACCOUNT_ID` — parsed from `R2_ENDPOINT` (the subdomain before `.r2.cloudflarestorage.com`)
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
   - `R2_ENDPOINT` (for reference)
5. Includes CORS headers so it can be called from the browser console.

Add a `[functions.reveal-r2-secrets]` block with `verify_jwt = false` to `supabase/config.toml` (we validate the JWT manually inside the function, same pattern as your other gated functions).

## Step 1 — I need your user_id

Before I create the function, please run this in the browser console on any logged-in page (e.g. `/schedule`):

```js
const { data: { session } } = await window.supabase.auth.getSession();
console.log('USER_ID:', session.user.id);
console.log('TOKEN:', session.access_token);
```

Paste back the `USER_ID`. (You can ignore the token for now — you'll need it in step 3.)

> If `window.supabase` is undefined, tell me and I'll instead read your user_id from the DB via a query.

## Step 2 — I create the function

Once you give me your user_id, I'll write the function with that UUID hardcoded in the gate. It will deploy automatically.

## Step 3 — You invoke it from the console

On a logged-in page (e.g. `https://getflurra.com/schedule` or your preview URL), open DevTools → Console and paste this **as one block**:

```js
const { data: { session } } = await window.supabase.auth.getSession();
const res = await fetch(
  'https://fjyhehtzryybbpuxqqdo.supabase.co/functions/v1/reveal-r2-secrets',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqeWhlaHR6cnl5YmJwdXhxcWRvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MTE3NzMsImV4cCI6MjA5MjM4Nzc3M30.Z2j-FCMp9IqNlm3R0aOv5F1OwxCh9oEj5Ky3G8AfSlg',
      'Content-Type': 'application/json'
    }
  }
);
const data = await res.json();
console.log(data);
copy(`fly secrets set R2_ACCOUNT_ID="${data.R2_ACCOUNT_ID}" R2_ACCESS_KEY_ID="${data.R2_ACCESS_KEY_ID}" R2_SECRET_ACCESS_KEY="${data.R2_SECRET_ACCESS_KEY}" R2_BUCKET_NAME="${data.R2_BUCKET_NAME}" -a youtube-uploader-service`);
console.log('✅ Fly command copied to clipboard — paste into your terminal.');
```

The full `fly secrets set ...` command will be copied to your clipboard, ready to paste into your terminal.

## Step 4 — I delete the function

After you confirm you got the values and ran the fly command, I'll delete `supabase/functions/reveal-r2-secrets/` and call the delete-edge-functions tool to remove the deployed copy. Done.

## Notes

- The function never logs the secrets server-side.
- Gated to your user_id only — even another logged-in user would get 403.
- `R2_ACCOUNT_ID` is derived from `R2_ENDPOINT` (e.g. `https://abc123.r2.cloudflarestorage.com` → `abc123`). If parsing fails, I'll return the raw endpoint so you can grab it manually.

**Approve and I'll proceed. First reply with your `USER_ID` from Step 1.**
