export const CONTENT_STATUSES = ["incomplete", "unscheduled", "scheduled", "posted"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_FIELDS = {
  post_title: "Post Title",
  youtube_title: "YouTube Title",
  youtube_desc: "YouTube Description",
  facebook_desc: "Facebook Caption",
  linkedin_desc: "LinkedIn Post",
  ig_tiktok_desc: "Instagram + TikTok Caption",
} as const;

export type ContentFieldKey = keyof typeof CONTENT_FIELDS;
