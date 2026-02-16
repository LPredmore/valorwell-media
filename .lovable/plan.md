
# Update Scheduling Validation to Require Cover Image

Currently, the scheduling process only validates for video, YouTube title, YouTube description, and post length. This plan adds a mandatory check for the cover image to ensure all scheduled content is complete.

## Proposed Changes

### Frontend Modifications

#### `src/components/schedule/UnscheduledTab.tsx`
- Update the `validateForScheduling` helper function to include a check for the `image` field.
- If the `image` field is null or an empty string (after trimming), "Cover Image" will be added to the list of missing fields.
- This will automatically trigger the existing error toast in `handleScheduleClick` if the image is missing, blocking the scheduling dialog from opening.

## Technical Detail

```typescript
// Proposed update to validateForScheduling in src/components/schedule/UnscheduledTab.tsx
function validateForScheduling(item: SocialContent): string[] {
  const missing: string[] = [];
  if (!item.video_storage_path) missing.push("Video");
  if (!item.image?.trim()) missing.push("Cover Image"); // New validation rule
  if (!item.youtube_title?.trim()) missing.push("YouTube Title");
  if (!item.youtube_desc?.trim()) missing.push("YouTube Description");
  if (item.post_length !== "Short" && item.post_length !== "Long") missing.push("Post Length (Short or Long)");
  return missing;
}
```

## Impact
- **Scheduling Flow**: Users will no longer be able to schedule content that doesn't have a cover image uploaded.
- **Consistency**: This ensures that all content sent to the YouTube upload service has both video and image assets, preventing downstream failures in the Fly.io service.
- **User Feedback**: The error toast will clearly list "Cover Image" as a missing requirement if the user tries to schedule incomplete content.
