export const CONTENT_STATUSES = ["incomplete", "unscheduled", "scheduled", "posted"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const COMMON_FIELDS = {
  post_title: "Post Title",
  facebook_desc: "Facebook Caption",
} as const;

export const LONG_FIELDS = {
  youtube_desc: "YouTube Description",
  linkedin_desc: "LinkedIn Post",
} as const;

export const SHORT_FIELDS = {
  ig_tiktok_desc: "Instagram + TikTok Caption",
} as const;

export type ContentFieldKey =
  | keyof typeof COMMON_FIELDS
  | keyof typeof LONG_FIELDS
  | keyof typeof SHORT_FIELDS;

export const PLATFORM_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  reddit: "Reddit",
  bluesky: "Bluesky",
};
