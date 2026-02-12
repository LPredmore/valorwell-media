

# Content Job Manager -- Full MVP Implementation Plan

## Current State

The database already has the core tables (`content_jobs`, `platform_outputs`, `platform_instructions`, `image_instructions`) and triggers (`updated_at`, `init_platform_outputs_for_job`). However, **RLS is disabled on all tables**, there are **no storage buckets**, **no user roles**, and `user_id` is **nullable** (must be fixed for security). The frontend is a blank starter app.

---

## Step 1: Database Migration -- Security & Storage Setup

A single migration to prepare the database for multi-user access:

**Schema fixes:**
- Make `content_jobs.user_id` NOT NULL (after clearing any null rows)
- Make `platform_outputs.user_id` NOT NULL

**User roles system:**
- Create `app_role` enum (`admin`, `user`)
- Create `user_roles` table (user_id + role, unique constraint)
- Create `has_role()` security-definer function

**RLS policies:**
- Enable RLS on `content_jobs` -- owner-only CRUD via `auth.uid() = user_id`
- Enable RLS on `platform_outputs` -- owner-only CRUD via `auth.uid() = user_id`
- Enable RLS on `platform_instructions` -- SELECT for all authenticated; INSERT/UPDATE/DELETE for admin only
- Enable RLS on `image_instructions` -- SELECT for all authenticated; INSERT/UPDATE/DELETE for admin only

**Validation trigger:**
- Create trigger on `content_jobs` that rejects status changes beyond `new` if `video_storage_path` is NULL

**Storage:**
- Create `content-media` bucket (private)
- RLS: authenticated users can upload/read within `jobs/<job_id>/` path only if they own the job (checked via a security-definer helper function)

---

## Step 2: Authentication -- Login Page & Route Guards

**Files to create:**
- `src/pages/Login.tsx` -- email/password sign-in form (no sign-up; admin-created users only), modern bold styling
- `src/hooks/useAuth.ts` -- auth state hook using `onAuthStateChange` + `getSession`
- `src/components/AuthGuard.tsx` -- wraps protected routes, redirects to `/login` if not authenticated
- `src/components/AppLayout.tsx` -- shared layout with header (app name + logout button) and content area

**Route updates in App.tsx:**
- `/login` -- public
- `/jobs`, `/jobs/new`, `/jobs/:id`, `/instructions` -- protected via AuthGuard
- Default redirect `/` goes to `/jobs`

---

## Step 3: Jobs List Page (`/jobs`)

**File:** `src/pages/Jobs.tsx`

- Fetch user's jobs from `content_jobs` ordered by `created_at` desc
- Table/card view with columns: Topic, Format badge, Status badge, Created date
- Search input filtering by topic
- Status dropdown filter
- "Create New Job" button linking to `/jobs/new`
- Delete action with confirmation dialog (deletes job + cascading outputs + storage files)
- Click row to navigate to `/jobs/:id`

**Supporting files:**
- `src/components/jobs/JobsTable.tsx`
- `src/components/jobs/JobStatusBadge.tsx`

---

## Step 4: Create Job Flow (`/jobs/new`)

**File:** `src/pages/CreateJob.tsx`

- Form fields: Topic (text input), Format (radio: Short / Long), Video file input (required)
- Submit flow:
  1. Insert `content_jobs` row with `status: 'new'`, `user_id: auth.uid()`
  2. Upload video to `content-media` at `jobs/<job_id>/video.<ext>`
  3. Update job with `video_storage_path`, `video_mime_type`, `video_original_filename`, set `status: 'ready'`
  4. DB trigger auto-creates platform output rows
  5. Navigate to `/jobs/:id`
- Upload progress bar
- Error handling: if upload fails, job stays `new`, user sees retry option

**Supporting files:**
- `src/components/jobs/VideoUploader.tsx` -- drag-and-drop or click-to-upload with progress

---

## Step 5: Job Detail Page (`/jobs/:id`)

**File:** `src/pages/JobDetail.tsx`

**Header section:**
- Editable topic (inline edit with autosave)
- Format badge (read-only)
- Status badge
- Created date
- Delete job button

**Video section (`src/components/jobs/VideoSection.tsx`):**
- Display filename, mime type, duration
- "Replace video" button (uploads new file, updates path)

**Images section (`src/components/jobs/ImagesSection.tsx`):**
- Two upload slots: 9:16 and 16:9 cover images
- Upload to `content-media/jobs/<job_id>/cover_9x16.<ext>` and `cover_16x9.<ext>`
- Thumbnail previews with replace option
- Updates `image_url_9x16` / `image_url_16x9` on the job row

**Platform Outputs Editor (`src/components/jobs/PlatformOutputsEditor.tsx`):**
- Tabs component -- one tab per platform (based on job format)
- Each tab contains `PlatformOutputTab.tsx`:
  - Title input (optional)
  - Body textarea
  - Hashtag chip editor (`src/components/jobs/HashtagEditor.tsx`)
    - Type tag + press Enter to add (auto-prepends `#` if missing)
    - Click X to remove
    - Shows "N / max M" count based on platform limits
    - Visual warning when exceeding recommended max
  - "Copy formatted" button -- copies title + body + hashtags as formatted text to clipboard
- **Autosave**: every field change triggers a debounced (800ms) upsert to `platform_outputs` by `(job_id, platform)`
- Subtle "Saving..." / "Saved" indicator in the tab header

**Default hashtag limits** (hardcoded constants, later pulled from instructions):
- youtube_video: 15, youtube_short: 12, tiktok: 15, instagram_reel: 20, x: 3, linkedin: 7, facebook: 10

---

## Step 6: Instructions Admin Page (`/instructions`)

**File:** `src/pages/Instructions.tsx`

- Access check: only visible/accessible to users with `admin` role (checked via `has_role` or a query to `user_roles`)
- Non-admin users see a "not authorized" message or the route is hidden from nav

**Platform Instructions section:**
- Grouped by platform, then by component (meta, title, description, hashtags)
- Each row: instruction text (editable textarea), preferred_aspect_ratio selector, is_active toggle
- Save button per row

**Image Instructions section:**
- Grouped by aspect ratio (9:16, 16:9)
- Each row: instruction text (editable textarea), is_active toggle
- Save button per row

**Supporting file:**
- `src/hooks/useIsAdmin.ts` -- queries `user_roles` table to check if current user has admin role

---

## Step 7: Shared Utilities & Hooks

- `src/lib/platforms.ts` -- platform key constants, display names, icons, format-to-platform mapping, default hashtag limits
- `src/hooks/useJob.ts` -- React Query hook for fetching a single job + its outputs
- `src/hooks/useJobs.ts` -- React Query hook for fetching jobs list with search/filter
- `src/hooks/useAutosave.ts` -- generic debounced save hook
- `src/lib/clipboard.ts` -- platform-specific copy formatting logic

---

## Technical Details

### File structure
```text
src/
  components/
    AppLayout.tsx
    AuthGuard.tsx
    jobs/
      JobsTable.tsx
      JobStatusBadge.tsx
      VideoUploader.tsx
      VideoSection.tsx
      ImagesSection.tsx
      PlatformOutputsEditor.tsx
      PlatformOutputTab.tsx
      HashtagEditor.tsx
  hooks/
    useAuth.ts
    useIsAdmin.ts
    useJob.ts
    useJobs.ts
    useAutosave.ts
  lib/
    platforms.ts
    clipboard.ts
  pages/
    Login.tsx
    Jobs.tsx
    CreateJob.tsx
    JobDetail.tsx
    Instructions.tsx
```

### Design tokens (Modern & Bold)
- Strong sans-serif typography with large headings
- Vibrant primary accent color (e.g., indigo-600 or violet-600)
- Bold status badges with distinct colors per status
- Generous spacing, card-based layouts with subtle shadows
- Dark header bar with white text

### Autosave implementation
- `useAutosave` hook wraps a debounced mutation (800ms)
- On field change, updates local state immediately, queues save
- Shows "Saving..." during mutation, "Saved" on success, "Error" on failure
- Uses `upsert` on `platform_outputs` keyed by `(job_id, platform)`

### Storage signed URLs
- For displaying uploaded videos/images, generate signed URLs via `supabase.storage.from('content-media').createSignedUrl(path, 3600)`
- This keeps the bucket private while allowing in-app display

