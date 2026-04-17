

## Plan: Consolidated nav + tabbed Settings

### Goal
Replace the cramped 5-button top nav with a clean 2-item nav (**Content**, **Settings**), each routing to a tabbed page. Add a real Profile management surface with auth-system writes.

### New nav structure

**Before:** Content · Ideas · Instructions · Connections · Settings (5 buttons)
**After:** Content · Settings (2 buttons, larger, more breathing room)

### Page changes

**1. `/schedule` (Content) — add top-level tabs**

Wrap the existing page in a two-tab shell:
- **Content** tab → existing tabs (Unscheduled / Scheduled / Past / Incomplete) become a sub-tabset
- **General Ideas** tab → renders the current `Ideas.tsx` body inline

To keep things clean, I'll:
- Extract the body of `src/pages/Ideas.tsx` into `src/components/ideas/IdeasView.tsx` (presentational, no `AppLayout`)
- Extract the existing schedule tabs from `Schedule.tsx` into `src/components/schedule/ScheduleView.tsx`
- `Schedule.tsx` becomes the parent that renders the two top-level tabs
- Keep `/ideas` route working as a redirect to `/schedule?tab=ideas` so old links don't break

**2. `/settings` — rebuild as tabbed hub**

New `Settings.tsx` with three tabs:
- **Profile** (new) — change email, change password, view created date
- **Instructions** — embed current `Instructions.tsx` body
- **Connections** — embed current `Connections.tsx` body

Same extraction pattern: pull bodies into `InstructionsView` and `ConnectionsView` components; keep `/instructions` and `/connections` routes as redirects to `/settings?tab=...`.

**3. Remove the old Settings stub**

The current `Settings.tsx` is just a link card to Connections — gets fully replaced.

### Profile tab — auth integration

Three actions, each in its own card:

1. **Update email** → `supabase.auth.updateUser({ email })`. Supabase sends a confirmation email to the new address; show toast explaining that.
2. **Update password** → require current password (re-auth via `signInWithPassword`), then `supabase.auth.updateUser({ password })`.
3. **Display name** — *Note:* there's no `display_name` / `username` column on `profiles` today. I'll add a `display_name text` column via migration so this can persist. The auth `user_metadata.display_name` will also be updated via `supabase.auth.updateUser({ data: { display_name } })` so it appears in the Supabase dashboard.

All three use zod validation + clear success/error toasts.

### Header redesign

In `AppLayout.tsx`:
- Keep the oversized mascot logo on the left (no changes there)
- Replace the current pill icon-buttons with two clean text nav items:
  - Larger hit area (`px-5 py-2`), proper typography (Space Grotesk, medium weight)
  - Active state: subtle bottom border in brand cyan instead of background pill
  - Icons removed for the top-level nav (icons stay inside the tabbed pages where they're contextual)
- Email + sign-out stay on the right, slightly polished spacing

Result: a header that feels like a product, not a toolbar.

### Files

**New**
- `src/components/ideas/IdeasView.tsx` — extracted Ideas body
- `src/components/schedule/ScheduleView.tsx` — extracted Schedule body
- `src/components/settings/InstructionsView.tsx` — extracted Instructions body
- `src/components/settings/ConnectionsView.tsx` — extracted Connections body
- `src/components/settings/ProfileView.tsx` — new profile management

**Modified**
- `src/components/AppLayout.tsx` — 2-item nav, refined styling
- `src/pages/Schedule.tsx` — wraps ScheduleView + IdeasView in tabs
- `src/pages/Settings.tsx` — wraps Profile + Instructions + Connections in tabs
- `src/pages/Ideas.tsx`, `src/pages/Instructions.tsx`, `src/pages/Connections.tsx` — become thin redirects (or kept as standalone fallbacks pointing to the new tabbed routes)
- `src/App.tsx` — route updates: `/ideas`, `/instructions`, `/connections` redirect into the new tabbed pages

**Database migration**
- Add `display_name text` column to `profiles` (nullable)

### URL/tab sync

Both tabbed pages will read/write `?tab=` in the URL so:
- Direct links work (`/settings?tab=profile`)
- Browser back/forward works
- Old `/ideas`, `/instructions`, `/connections` routes redirect to the right tab

### Out of scope
- No changes to the actual Schedule sub-tab logic, Ideas table, Instructions editor, or Connections card behavior — only their containers move
- Email change still requires Supabase's confirmation email flow (can't be bypassed; just messaged clearly)

