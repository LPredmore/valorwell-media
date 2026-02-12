

## Create Admin User via Edge Function

Since the Supabase dashboard isn't allowing user creation directly, I'll create a temporary edge function that uses the **service role key** (already configured as a secret) to:

1. Create the user `info@valorwell.org` with the specified password using `supabase.auth.admin.createUser()`
2. Insert the admin role into the `user_roles` table for that user

### Steps

1. **Create edge function** `supabase/functions/create-admin-user/index.ts`
   - Uses `SUPABASE_URL` and `SERVICE_ROLE_KEY` secrets (both already configured)
   - Calls `auth.admin.createUser({ email, password, email_confirm: true })`
   - Inserts a row into `user_roles` with role `admin`
   - Returns the created user ID

2. **Deploy and invoke** the function once to create the account

3. **Delete the edge function** after use (it's a one-time setup utility)

### Technical Details

- The function will be a simple POST handler, no auth required (one-time use)
- `email_confirm: true` bypasses email verification
- The `SERVICE_ROLE_KEY` secret is already available in the project

