

## Fix: Use a Custom Secret Name for the Service Role Key

### The Problem
The `SUPABASE_SERVICE_ROLE_KEY` and `SERVICE_ROLE_KEY` secrets are system-managed and contain a 41-character credential (not the JWT). Even when updated, they may get overwritten. This is why the edge function keeps failing.

### The Solution
Use a **new custom secret name** that won't conflict with system-managed secrets, then update the edge function to read from it.

### Steps

1. **Create a new secret** called `CUSTOM_SERVICE_ROLE_KEY`
   - You'll be prompted to paste your Service Role Key (the long JWT starting with `eyJ...` from Supabase Dashboard -> Settings -> API)

2. **Update the edge function** to use `CUSTOM_SERVICE_ROLE_KEY` instead of the system-managed ones:
   - Change the key lookup line from:
     `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")`
   - To:
     `Deno.env.get("CUSTOM_SERVICE_ROLE_KEY")`

3. **Deploy and invoke** the function to create the admin user

4. **Clean up** - delete the edge function and the custom secret after success

### Where to Find Your Service Role Key
- Go to your Supabase Dashboard
- Navigate to **Project Settings** then **API**
- Copy the **Service Role Key** (the long string starting with `eyJ...`)

