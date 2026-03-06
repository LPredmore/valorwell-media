

# Implementation Plan

## 1. Add `useUpdateIdea` to `src/hooks/useIdeas.ts`
Add a new mutation using `supabase.from("content_ideas").update()`. No DB changes needed -- "Admin update" RLS policy already exists.

## 2. Create `src/hooks/useSpeechToText.ts`
Custom hook wrapping the Web Speech API (`webkitSpeechRecognition`). Returns `{ isListening, isSupported, startListening, stopListening }`. Uses `continuous = true`, calls `onResult` callback with finalized transcript. If browser doesn't support it, `isSupported = false` and mic button hides.

## 3. Create `src/components/ideas/IdeaFormDialog.tsx`
Shared dialog component for both Add and Edit flows. Props: `open`, `onOpenChange`, `initialValues`, `onSubmit`, `title`, `submitLabel`, `isPending`. Contains all existing form fields (topic, avatar, category, length, planned date). Topic textarea gets an absolutely-positioned mic button (bottom-right) that toggles speech recognition -- pulses red while listening, appends transcript to topic value.

## 4. Update `src/pages/Ideas.tsx`
- Replace inline Add dialog with `<IdeaFormDialog>` for add mode
- Add `editingIdea` state and a second `<IdeaFormDialog>` for edit mode
- Add a pencil/edit icon button on each table row to open edit dialog pre-filled
- Add `useUpdateIdea` hook call for edit submissions

## Files Changed

| File | Action |
|---|---|
| `src/hooks/useIdeas.ts` | Add `useUpdateIdea` export |
| `src/hooks/useSpeechToText.ts` | Create new |
| `src/components/ideas/IdeaFormDialog.tsx` | Create new |
| `src/pages/Ideas.tsx` | Refactor to use shared dialog, add edit flow |

No database migrations. No new secrets. No new Edge Functions.

