

## Plan: Sweep remaining "Content Creator Studio" references

### What I found

Searched the entire codebase (source, edge functions, configs, memory files, HTML, READMEs) for "Content Creator Studio", "Creator Studio", and "Studio" — **zero matches**. All in-repo branding is already Flurra.

The only remaining places that string can still appear are **Supabase-hosted resources outside the file tree**:

1. **Auth email templates** — Confirm signup, magic link, password reset, email change, reauthentication. These often default to the Supabase project name ("Content Creator Studio").
2. **Supabase Auth "Site name"** in project settings — drives the `{{ .SiteName }}` token used in default email templates.

### What I'll change

**Rewrite all 5 Supabase Auth email templates** to use Flurra branding, first-person voice, and the brand mascot/colors. I'll write them in HTML matching the dark-navy `#101A2B` + cyan brand palette, using Space Grotesk for headings (with system-font fallback since custom fonts don't render reliably in email clients) and Inter for body.

Each template will:
- Replace any "Content Creator Studio" wording with "Flurra"
- Use first-person Flurra voice ("I sent you this link…", "Let's get you signed in…")
- Include the wordmark in brand cyan and a clean CTA button
- Keep all required Supabase tokens (`{{ .ConfirmationURL }}`, `{{ .Token }}`, etc.) intact

Templates to rewrite:
- **Confirm signup** — "Confirm your Flurra account"
- **Magic Link** — "Your Flurra sign-in link"
- **Reset Password** — "Reset your Flurra password"
- **Change Email Address** — "Confirm your new Flurra email"
- **Reauthentication** — "Confirm it's you on Flurra"

### Technical notes

- Templates are managed via the Supabase Auth admin API (not in `supabase/config.toml` for hosted projects). I'll apply them through the Cloud config tool.
- I'll also set the Auth "Site name" / sender display name to **Flurra** so any fallback `{{ .SiteName }}` references render correctly.
- No code changes, no migrations, no edge function deploys needed — this is purely Auth configuration.
- After applying, you can verify by triggering a password reset on your own account and inspecting the email.

### What you should do after

If "Content Creator Studio" appears anywhere outside the app/emails (custom domain DNS records, Stripe receipts, third-party connectors, social profile bios), let me know — those are external systems I can't reach from here.

