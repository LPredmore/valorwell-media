

## Assign Admin Role to Existing User

### What Happened
The user `info@valorwell.org` was successfully created in Supabase Auth during an earlier attempt, but the outage hit before the admin role could be assigned. Now the edge function fails because it tries to create the user again and gets "already registered."

### What Needs to Change

**Update the `create-admin-user` edge function** to handle the "user already exists" case:

1. Try to create the user as before
2. If the error says the user already exists, look up the existing user by email instead of failing
3. Insert the admin role using the found user ID
4. Return success either way

**After successful role assignment:**
- Clean up by deleting the `create-admin-user` edge function (it's a one-time utility)

### Technical Details

In `supabase/functions/create-admin-user/index.ts`:
- After catching the "already registered" error, call `supabaseAdmin.auth.admin.listUsers()` filtered by email to get the user ID
- Use that ID to insert into `user_roles`
- Keep all other logic the same

